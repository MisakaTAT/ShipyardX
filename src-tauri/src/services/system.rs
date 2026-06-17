use log::{debug, info, warn};
use tauri::State;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use bollard::models::{ContainerStatsResponse, SystemInfo};
use bollard::query_parameters::StatsOptionsBuilder;
use font_kit::source::SystemSource;
use futures_util::StreamExt;

use crate::docker::client::{docker, invalidate_api_version, map_bollard_error};
use crate::docker::stats::compute_stats;
use crate::docker::transport::{DockerEndpoint, invalidate_docker_endpoint, resolve_docker_endpoint};
use crate::dto::container::ContainerStats;
use crate::dto::daemon::{DaemonSettings, DaemonUpdate};
use crate::dto::info::DockerEngineInfo;
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::scripts::{
    DOCKER_CHECK_SOCKET_SH, DOCKER_CHECK_TCP_SH, DOCKER_READ_DAEMON_CONFIG_SH, SYSTEM_RESTART_WITH_PASSWORD_SH,
    SYSTEM_RESTART_WITHOUT_PASSWORD_SH, SYSTEM_WRITE_DAEMON_WITH_PASSWORD_SH, SYSTEM_WRITE_DAEMON_WITHOUT_PASSWORD_SH,
    render, render_shell,
};
use crate::services::support::ServerContext;
use crate::ssh::exec::ssh_exec;
use crate::ssh::pool;
use crate::state::AppState;
use crate::utils::formatting::format_bytes_i64;

const ERR_BAD_SUDO_PASSWORD: &str = "__ERR_BAD_SUDO_PASSWORD__";
const ERR_BAD_SU_PASSWORD: &str = "__ERR_BAD_SU_PASSWORD__";
const ERR_NO_MANAGER: &str = "__ERR_NO_MANAGER__";
const ERR_SYSTEMCTL: &str = "__ERR_SYSTEMCTL__";
const ERR_RC_SERVICE: &str = "__ERR_RC_SERVICE__";
const ERR_SERVICE_OP: &str = "__ERR_SERVICE_OP__";
const ERR_SUDO_NONINTERACTIVE: &str = "__ERR_SUDO_NONINTERACTIVE__";
const ERR_NO_SUDO: &str = "__ERR_NO_SUDO__";

#[derive(Debug, Default, serde::Deserialize, serde::Serialize)]
#[serde(default)]
struct DaemonConfig {
    #[serde(rename = "registry-mirrors", skip_serializing_if = "Option::is_none")]
    registry_mirrors: Option<Vec<String>>,
    #[serde(rename = "log-driver", skip_serializing_if = "Option::is_none")]
    log_driver: Option<String>,
    #[serde(rename = "log-opts", skip_serializing_if = "Option::is_none")]
    log_opts: Option<std::collections::HashMap<String, String>>,
    #[serde(rename = "live-restore", skip_serializing_if = "Option::is_none")]
    live_restore: Option<bool>,
    #[serde(rename = "exec-opts", skip_serializing_if = "Option::is_none")]
    exec_opts: Option<Vec<String>>,
    #[serde(rename = "hosts", skip_serializing_if = "Option::is_none")]
    hosts: Option<Vec<String>>,
    #[serde(flatten)]
    extra: std::collections::BTreeMap<String, serde_json::Value>,
}

pub async fn list_system_fonts() -> AppResult<Vec<String>> {
    debug!(target: "shipyardx_lib::services::system", "listing system fonts");
    let source = SystemSource::new();
    let mut fonts = source
        .all_families()
        .map_err(|e| AppError::internal("system.fonts_list_failed", "读取系统字体失败").with_source(e))?;
    fonts.sort_unstable();
    fonts.dedup();
    info!(target: "shipyardx_lib::services::system", "listed system fonts; count={}", fonts.len());
    Ok(fonts)
}

fn map_restart_error(err: AppError) -> AppError {
    let detail = err.detail.clone().unwrap_or_else(|| err.message.clone());
    if detail.contains(ERR_BAD_SUDO_PASSWORD) {
        return AppError::auth("system.sudo_password_invalid", "提权失败：sudo 密码错误，请重新输入。")
            .with_action("请重新输入正确的 sudo 密码");
    }
    if detail.contains(ERR_BAD_SU_PASSWORD) {
        return AppError::auth("system.su_password_invalid", "提权失败：root 密码错误，请重新输入。")
            .with_action("请重新输入正确的 root 密码");
    }
    if detail.contains(ERR_NO_MANAGER) {
        return AppError::unavailable(
            "system.service_manager_missing",
            "重启失败：未检测到可用的服务管理器（systemctl / rc-service / service）。请在服务器上手动重启 Docker。",
        );
    }
    if detail.contains(ERR_SUDO_NONINTERACTIVE) {
        return AppError::permission(
            "system.sudo_password_required",
            "重启失败：无法非交互使用 sudo（未配置 NOPASSWD）。请在服务器连接中填写 sudo 密码，或在 sudoers 中为该用户配置 docker/systemctl 的无密码规则。",
        )
        .with_action("提供 sudo 密码或配置 NOPASSWD");
    }
    if detail.contains(ERR_NO_SUDO) {
        return AppError::permission(
            "system.sudo_unavailable",
            "重启失败：当前用户非 root 且未找到 sudo，无法重启 Docker 服务。请使用 root 或具备 sudo 的账户。",
        );
    }
    if detail.contains(ERR_SYSTEMCTL) {
        return AppError::unavailable(
            "system.service_restart_failed",
            "重启失败：systemctl 重启 docker 未成功（可能为权限、单元名或服务状态问题）。若本机可执行 systemctl restart docker.service，请尝试在连接中填写 sudo 密码。",
        )
        .retryable(true);
    }
    if detail.contains(ERR_RC_SERVICE) || detail.contains(ERR_SERVICE_OP) {
        return AppError::unavailable(
            "system.service_operation_failed",
            "重启失败：已检测到服务管理器，但执行 docker restart 失败，请检查服务名称与权限。",
        )
        .retryable(true);
    }
    AppError::internal("system.restart_failed", "重启 Docker 服务失败").with_detail(detail)
}

async fn restart_docker_service(server: &ServerConfig, sudo_password: Option<String>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::system", "restarting docker service; server_id={} use_sudo_password={}", server.id, sudo_password.as_ref().is_some_and(|s| !s.is_empty()));
    let restart_cmd = if let Some(pwd) = sudo_password.filter(|s| !s.is_empty()) {
        let pwd_b64 = STANDARD.encode(pwd);
        render(
            SYSTEM_RESTART_WITH_PASSWORD_SH,
            &[
                ("__PASS_B64__", &pwd_b64),
                ("__ERR_BAD_SUDO_PASSWORD__", ERR_BAD_SUDO_PASSWORD),
                ("__ERR_BAD_SU_PASSWORD__", ERR_BAD_SU_PASSWORD),
                ("__ERR_SYSTEMCTL__", ERR_SYSTEMCTL),
                ("__ERR_RC_SERVICE__", ERR_RC_SERVICE),
                ("__ERR_SERVICE_OP__", ERR_SERVICE_OP),
                ("__ERR_NO_MANAGER__", ERR_NO_MANAGER),
            ],
        )
    } else {
        render(
            SYSTEM_RESTART_WITHOUT_PASSWORD_SH,
            &[
                ("__ERR_SUDO_NONINTERACTIVE__", ERR_SUDO_NONINTERACTIVE),
                ("__ERR_NO_SUDO__", ERR_NO_SUDO),
                ("__ERR_SYSTEMCTL__", ERR_SYSTEMCTL),
                ("__ERR_RC_SERVICE__", ERR_RC_SERVICE),
                ("__ERR_SERVICE_OP__", ERR_SERVICE_OP),
                ("__ERR_NO_MANAGER__", ERR_NO_MANAGER),
            ],
        )
    };
    ssh_exec(server, &restart_cmd).await.map_err(map_restart_error)?;
    info!(target: "shipyardx_lib::services::system", "docker service restarted; server_id={}", server.id);
    Ok(())
}

async fn fetch_docker_engine_info(server: &ServerConfig) -> AppResult<DockerEngineInfo> {
    let docker = docker(server).await?;
    let client_version = docker.client_version();
    let api_version = format!("{}.{}", client_version.major_version, client_version.minor_version);
    let v: SystemInfo = docker.info().await.map_err(map_bollard_error)?;
    let flatten_pairs = |pairs: Option<Vec<Vec<String>>>| -> Vec<String> {
        pairs
            .unwrap_or_default()
            .into_iter()
            .filter_map(|pair| {
                if pair.is_empty() {
                    None
                } else if pair.len() == 1 {
                    Some(pair[0].clone())
                } else {
                    Some(format!("{}: {}", pair[0], pair[1]))
                }
            })
            .collect()
    };
    let containers = v.containers.unwrap_or(0);
    let containers_running = v.containers_running.unwrap_or(0);
    let containers_paused = v.containers_paused.unwrap_or(0);
    let containers_stopped = v.containers_stopped.unwrap_or(0);
    let images = v.images.unwrap_or(0);
    let ncpu = v.ncpu.unwrap_or(0);
    let warning_details = v.warnings.clone().unwrap_or_default();
    let warnings = warning_details.len() as i64;
    let total = containers.max(0) as f64;
    let pct = |value: i64| {
        if total <= 0.0 {
            0.0
        } else {
            ((value.max(0) as f64 / total) * 100.0).clamp(0.0, 100.0)
        }
    };
    Ok(DockerEngineInfo {
        containers: containers.to_string(),
        containers_running: containers_running.to_string(),
        containers_paused: containers_paused.to_string(),
        containers_stopped: containers_stopped.to_string(),
        images: images.to_string(),
        containers_running_percent: pct(containers_running),
        containers_paused_percent: pct(containers_paused),
        containers_stopped_percent: pct(containers_stopped),
        server_version: v.server_version.unwrap_or_default(),
        api_version,
        name: v.name.unwrap_or_default(),
        ncpu: ncpu.to_string(),
        mem_total: format_bytes_i64(v.mem_total.unwrap_or(0)),
        os: v.operating_system.unwrap_or_default(),
        os_version: v.os_version.unwrap_or_default(),
        kernel_version: v.kernel_version.unwrap_or_default(),
        architecture: v.architecture.unwrap_or_default(),
        storage_driver: v.driver.unwrap_or_default(),
        warnings: warnings.to_string(),
        warning_details,
        docker_root_dir: v.docker_root_dir.unwrap_or_default(),
        logging_driver: v.logging_driver.unwrap_or_default(),
        cgroup_driver: v.cgroup_driver.map(|value| value.to_string()).unwrap_or_default(),
        cgroup_version: v.cgroup_version.map(|value| value.to_string()).unwrap_or_default(),
        os_type: v.os_type.unwrap_or_default(),
        system_time: v.system_time.unwrap_or_default(),
        default_runtime: v.default_runtime.unwrap_or_default(),
        runtimes: v.runtimes.map(|value| value.into_keys().collect()).unwrap_or_default(),
        security_options: v.security_options.unwrap_or_default(),
        live_restore_enabled: v.live_restore_enabled.unwrap_or(false),
        experimental_build: v.experimental_build.unwrap_or(false),
        debug: v.debug.unwrap_or(false),
        ipv4_forwarding: v.ipv4_forwarding.unwrap_or(false),
        http_proxy: v.http_proxy.unwrap_or_default(),
        https_proxy: v.https_proxy.unwrap_or_default(),
        no_proxy: v.no_proxy.unwrap_or_default(),
        memory_limit: v.memory_limit.unwrap_or(false),
        swap_limit: v.swap_limit.unwrap_or(false),
        cpu_cfs_period: v.cpu_cfs_period.unwrap_or(false),
        cpu_cfs_quota: v.cpu_cfs_quota.unwrap_or(false),
        cpu_shares: v.cpu_shares.unwrap_or(false),
        cpu_set: v.cpu_set.unwrap_or(false),
        pids_limit: v.pids_limit.unwrap_or(false),
        oom_kill_disable: v.oom_kill_disable.unwrap_or(false),
        labels: v.labels.unwrap_or_default(),
        storage_driver_status: flatten_pairs(v.driver_status),
        volume_plugins: v.plugins.as_ref().and_then(|value| value.volume.clone()).unwrap_or_default(),
        network_plugins: v.plugins.as_ref().and_then(|value| value.network.clone()).unwrap_or_default(),
        authorization_plugins: v.plugins.as_ref().and_then(|value| value.authorization.clone()).unwrap_or_default(),
        log_plugins: v.plugins.as_ref().and_then(|value| value.log.clone()).unwrap_or_default(),
        firewall_driver: v.firewall_backend.as_ref().and_then(|value| value.driver.clone()).unwrap_or_default(),
        firewall_info: flatten_pairs(v.firewall_backend.and_then(|value| value.info)),
    })
}

pub async fn get_docker_info(server_id: String, state: State<'_, AppState>) -> AppResult<DockerEngineInfo> {
    debug!(target: "shipyardx_lib::services::system", "fetching docker info; server_id={}", server_id);
    let ctx = ServerContext::from_state(&state, &server_id)?;
    let info = fetch_docker_engine_info(ctx.server()).await?;
    info!(target: "shipyardx_lib::services::system", "fetched docker info; server_id={} version={} containers={} images={}", server_id, info.server_version, info.containers, info.images);
    Ok(info)
}

pub async fn check_docker_access(server_id: String, state: State<'_, AppState>) -> AppResult<DockerEngineInfo> {
    info!(target: "shipyardx_lib::services::system", "checking docker access; server_id={}", server_id);
    let ctx = ServerContext::from_state(&state, &server_id)?;
    invalidate_api_version(ctx.server());
    invalidate_docker_endpoint(ctx.server()).await;
    match fetch_docker_engine_info(ctx.server()).await {
        Ok(info) => {
            info!(target: "shipyardx_lib::services::system", "docker access check succeeded; server_id={} api_version={}", server_id, info.api_version);
            Ok(info)
        }
        Err(e) => {
            let endpoint = resolve_docker_endpoint(ctx.server()).await.ok();
            warn!(target: "shipyardx_lib::services::system", "docker access check failed; server_id={} code={} message={} detail={:?} endpoint={:?}", server_id, e.code, e.message, e.detail, endpoint);
            match endpoint {
                Some(DockerEndpoint::Unix { path }) => {
                    let diag = ssh_exec(
                        ctx.server(),
                        &render_shell(DOCKER_CHECK_SOCKET_SH, &[], &[("__SOCKET_PATH__", &path)]),
                    )
                    .await
                    .unwrap_or_else(|_| "ok".to_string());
                    match diag.trim() {
                        "no_docker" => Err(AppError::unavailable(
                            "docker.unavailable",
                            format!("Docker 未安装、未运行，或 {path} 不可用。"),
                        )),
                        "no_permission" => Err(AppError::permission(
                            "docker.permission_denied",
                            format!("当前用户没有访问 Docker Socket 的权限：{path}"),
                        )),
                        _ => Err(AppError::unavailable("docker.connect_failed", "无法连接 Docker")
                            .with_detail(e.detail.unwrap_or(e.message))
                            .retryable(true)),
                    }
                }
                Some(DockerEndpoint::Tcp { host, port }) => {
                    let port_str = port.to_string();
                    let diag = ssh_exec(
                        ctx.server(),
                        &render_shell(DOCKER_CHECK_TCP_SH, &[("__PORT__", &port_str)], &[("__HOST__", &host)]),
                    )
                    .await
                    .unwrap_or_else(|_| "ok".to_string());
                    match diag.trim() {
                        "no_docker" => Err(AppError::unavailable(
                            "docker.unavailable",
                            format!("Docker TCP Host 不可达：{host}:{port}"),
                        )),
                        _ => Err(AppError::unavailable("docker.connect_failed", "无法连接 Docker")
                            .with_detail(e.detail.unwrap_or(e.message))
                            .retryable(true)),
                    }
                }
                None => Err(AppError::unavailable("docker.connect_failed", "无法连接 Docker")
                    .with_detail(e.detail.unwrap_or(e.message))
                    .retryable(true)),
            }
        }
    }
}

pub async fn get_container_stats(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> AppResult<ContainerStats> {
    debug!(target: "shipyardx_lib::services::system", "fetching container stats; server_id={} container_id={}", server_id, container_id);
    let docker = ServerContext::from_state(&state, &server_id)?.streaming().await?;
    let mut stream = docker.stats(
        &container_id,
        Some(StatsOptionsBuilder::default().stream(false).one_shot(true).build()),
    );
    let raw: ContainerStatsResponse = stream
        .next()
        .await
        .ok_or_else(|| AppError::unavailable("container.stats_empty", "容器统计信息为空"))?
        .map_err(map_bollard_error)?;
    let stats = compute_stats(raw);
    debug!(target: "shipyardx_lib::services::system", "fetched container stats; server_id={} container_id={} cpu_percent={:.2} mem_usage={}", server_id, container_id, stats.cpu_percent, stats.mem_usage);
    Ok(stats)
}

pub async fn get_docker_daemon_settings(server_id: String, state: State<'_, AppState>) -> AppResult<DaemonSettings> {
    debug!(target: "shipyardx_lib::services::system", "fetching docker daemon settings; server_id={}", server_id);
    let ctx = ServerContext::from_state(&state, &server_id)?;
    let raw = match pool::exec(ctx.server(), DOCKER_READ_DAEMON_CONFIG_SH).await {
        Ok(raw) => raw,
        Err(_) => ssh_exec(ctx.server(), DOCKER_READ_DAEMON_CONFIG_SH).await?,
    };
    let cfg: DaemonConfig = serde_json::from_str(raw.trim()).unwrap_or_default();

    let mirror_url = cfg.registry_mirrors.clone().unwrap_or_default();
    let cgroup_driver = cfg
        .exec_opts
        .as_deref()
        .and_then(|opts| opts.iter().find(|s| s.starts_with("native.cgroupdriver=")))
        .map(|s| s.trim_start_matches("native.cgroupdriver=").to_string())
        .unwrap_or_default();
    let socket_path = cfg
        .hosts
        .as_deref()
        .and_then(|hosts| hosts.first())
        .cloned()
        .unwrap_or_else(|| "unix:///var/run/docker.sock".to_string());
    let log_max_size = cfg
        .log_opts
        .as_ref()
        .and_then(|m| m.get("max-size").cloned())
        .unwrap_or_else(|| "10m".to_string());
    let log_max_file = cfg
        .log_opts
        .as_ref()
        .and_then(|m| m.get("max-file").cloned())
        .unwrap_or_else(|| "3".to_string());
    let log_rotation = cfg.log_opts.as_ref().map(|m| !m.is_empty()).unwrap_or(false);

    let settings = DaemonSettings {
        mirror_urls: mirror_url,
        log_rotation,
        log_max_size,
        log_max_file,
        live_restore: cfg.live_restore.unwrap_or(false),
        cgroup_driver,
        socket_path,
    };
    info!(target: "shipyardx_lib::services::system", "fetched docker daemon settings; server_id={} mirrors={} live_restore={} log_rotation={} socket_path={}", server_id, settings.mirror_urls.len(), settings.live_restore, settings.log_rotation, settings.socket_path);
    Ok(settings)
}

pub async fn update_docker_daemon_settings(
    server_id: String,
    params: DaemonUpdate,
    state: State<'_, AppState>,
) -> AppResult<()> {
    info!(
        target: "shipyardx_lib::services::system",
        "updating docker daemon settings; server_id={} mirrors={} live_restore={} log_rotation={} cgroup_driver_set={} socket_path_set={} sudo_password_provided={}",
        server_id,
        params.mirror_urls.iter().filter(|s| !s.trim().is_empty()).count(),
        params.live_restore,
        params.log_rotation,
        !params.cgroup_driver.trim().is_empty(),
        !params.socket_path.trim().is_empty(),
        params.sudo_password.as_ref().is_some_and(|s| !s.is_empty())
    );
    let ctx = ServerContext::from_state(&state, &server_id)?;
    invalidate_api_version(ctx.server());
    invalidate_docker_endpoint(ctx.server()).await;
    let current_raw = match pool::exec(ctx.server(), DOCKER_READ_DAEMON_CONFIG_SH).await {
        Ok(raw) => raw,
        Err(_) => ssh_exec(ctx.server(), DOCKER_READ_DAEMON_CONFIG_SH).await?,
    };
    let mut cfg: DaemonConfig = serde_json::from_str(current_raw.trim()).unwrap_or_default();

    let mirrors: Vec<String> = params
        .mirror_urls
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    cfg.registry_mirrors = if mirrors.is_empty() { None } else { Some(mirrors) };
    cfg.live_restore = if params.live_restore { Some(true) } else { None };

    let cgroup = params.cgroup_driver.trim().to_string();
    cfg.exec_opts = if cgroup.is_empty() {
        None
    } else {
        Some(vec![format!("native.cgroupdriver={}", cgroup)])
    };

    let socket = params.socket_path.trim();
    cfg.hosts = if socket.is_empty() {
        None
    } else {
        Some(vec![socket.to_string()])
    };

    if params.log_rotation {
        cfg.log_driver = Some("json-file".to_string());
        let mut opts = std::collections::HashMap::new();
        let max_size = if params.log_max_size.trim().is_empty() {
            "10m".to_string()
        } else {
            params.log_max_size.trim().to_string()
        };
        let max_file = if params.log_max_file.trim().is_empty() {
            "3".to_string()
        } else {
            params.log_max_file.trim().to_string()
        };
        opts.insert("max-size".to_string(), max_size);
        opts.insert("max-file".to_string(), max_file);
        cfg.log_opts = Some(opts);
    } else {
        cfg.log_driver = None;
        cfg.log_opts = None;
    }

    let json = serde_json::to_string_pretty(&cfg)
        .map_err(|e| AppError::internal("daemon.serialize_failed", "序列化 Docker daemon 配置失败").with_source(e))?;
    let b64 = STANDARD.encode(json);
    let write_cmd = if let Some(pwd) = params.sudo_password.clone().filter(|s| !s.is_empty()) {
        let pwd_b64 = STANDARD.encode(pwd);
        render(
            SYSTEM_WRITE_DAEMON_WITH_PASSWORD_SH,
            &[
                ("__CFG_B64__", &b64),
                ("__PASS_B64__", &pwd_b64),
                ("__ERR_BAD_SUDO_PASSWORD__", ERR_BAD_SUDO_PASSWORD),
                ("__ERR_BAD_SU_PASSWORD__", ERR_BAD_SU_PASSWORD),
            ],
        )
    } else {
        render(SYSTEM_WRITE_DAEMON_WITHOUT_PASSWORD_SH, &[("__CFG_B64__", &b64)])
    };
    ssh_exec(ctx.server(), &write_cmd).await.map_err(map_restart_error)?;
    info!(target: "shipyardx_lib::services::system", "docker daemon settings updated; server_id={}", server_id);
    Ok(())
}

pub async fn restart_docker_daemon(
    server_id: String,
    sudo_password: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::system", "restart docker daemon requested; server_id={}", server_id);
    let ctx = ServerContext::from_state(&state, &server_id)?;
    restart_docker_service(ctx.server(), sudo_password).await
}
