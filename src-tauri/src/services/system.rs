use tauri::State;

use base64::{Engine as _, engine::general_purpose::STANDARD};

use crate::contracts::docker_api::stats::DockerStats;
use crate::contracts::docker_api::system::{DaemonConfig, SystemInfo};
use crate::contracts::frontend::container::ContainerStats;
use crate::contracts::frontend::daemon::{DaemonSettings, DaemonUpdate};
use crate::contracts::frontend::info::DockerEngineInfo;
use crate::contracts::frontend::server::ServerConfig;
use crate::docker::client::{docker_get_async, invalidate_api_version, resolve_api_version_async};
use crate::docker::stats::compute_stats;
use crate::docker::transport::{DockerEndpoint, invalidate_docker_endpoint, resolve_docker_endpoint};
use crate::error::{AppError, AppResult};
use crate::scripts::{
    DOCKER_CHECK_SOCKET_SH, DOCKER_CHECK_TCP_SH, DOCKER_READ_DAEMON_CONFIG_SH, SYSTEM_RESTART_WITH_PASSWORD_SH,
    SYSTEM_RESTART_WITHOUT_PASSWORD_SH, SYSTEM_WRITE_DAEMON_WITH_PASSWORD_SH, SYSTEM_WRITE_DAEMON_WITHOUT_PASSWORD_SH,
    render, render_shell,
};
use crate::ssh::exec::ssh_exec_async;
use crate::state::{AppState, get_server_config};

const ERR_BAD_SUDO_PASSWORD: &str = "__ERR_BAD_SUDO_PASSWORD__";
const ERR_BAD_SU_PASSWORD: &str = "__ERR_BAD_SU_PASSWORD__";
const ERR_NO_MANAGER: &str = "__ERR_NO_MANAGER__";
const ERR_SYSTEMCTL: &str = "__ERR_SYSTEMCTL__";
const ERR_RC_SERVICE: &str = "__ERR_RC_SERVICE__";
const ERR_SERVICE_OP: &str = "__ERR_SERVICE_OP__";
const ERR_SUDO_NONINTERACTIVE: &str = "__ERR_SUDO_NONINTERACTIVE__";
const ERR_NO_SUDO: &str = "__ERR_NO_SUDO__";
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
    ssh_exec_async(server, &restart_cmd).await.map_err(map_restart_error)?;
    Ok(())
}

pub async fn get_docker_info(server_id: String, state: State<'_, AppState>) -> AppResult<DockerEngineInfo> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, "/info").await?;
    let v: SystemInfo = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("system.info_parse_failed", "解析 Docker 信息失败").with_source(e))?;
    Ok(DockerEngineInfo {
        containers: v.containers.unwrap_or(0),
        containers_running: v.containers_running.unwrap_or(0),
        containers_paused: v.containers_paused.unwrap_or(0),
        containers_stopped: v.containers_stopped.unwrap_or(0),
        images: v.images.unwrap_or(0),
        server_version: v.server_version.unwrap_or_default(),
        api_version: resolve_api_version_async(&server).await.unwrap_or_default(),
        name: v.name.unwrap_or_default(),
        ncpu: v.ncpu.unwrap_or(0),
        mem_total: v.mem_total.unwrap_or(0),
        os: v.os.unwrap_or_default(),
        os_version: v.os_version.unwrap_or_default(),
        kernel_version: v.kernel_version.unwrap_or_default(),
        architecture: v.architecture.unwrap_or_default(),
        storage_driver: v.storage_driver.unwrap_or_default(),
        warnings: v.warnings.as_ref().map(|a| a.len() as i64).unwrap_or(0),
    })
}

pub async fn check_docker_access(server_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    invalidate_api_version(&server);
    invalidate_docker_endpoint(&server);
    match resolve_api_version_async(&server).await {
        Ok(_) => Ok(()),
        Err(e) => {
            let endpoint = resolve_docker_endpoint(&server).await.ok();
            match endpoint {
                Some(DockerEndpoint::Unix { path }) => {
                    let diag = ssh_exec_async(
                        &server,
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
                    let diag = ssh_exec_async(
                        &server,
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
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(
        &server,
        &format!("/containers/{}/stats?stream=false&one-shot=true", container_id),
    )
    .await?;
    let raw: DockerStats = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("container.stats_parse_failed", "解析容器统计信息失败").with_source(e))?;
    Ok(compute_stats(raw))
}

pub async fn get_docker_daemon_settings(server_id: String, state: State<'_, AppState>) -> AppResult<DaemonSettings> {
    let server = get_server_config(&state, &server_id)?;
    let raw = ssh_exec_async(&server, DOCKER_READ_DAEMON_CONFIG_SH).await?;
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

    Ok(DaemonSettings {
        mirror_urls: mirror_url,
        log_rotation,
        log_max_size,
        log_max_file,
        live_restore: cfg.live_restore.unwrap_or(false),
        cgroup_driver,
        socket_path,
    })
}

pub async fn update_docker_daemon_settings(
    server_id: String,
    params: DaemonUpdate,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    invalidate_docker_endpoint(&server);
    let current_raw = ssh_exec_async(&server, DOCKER_READ_DAEMON_CONFIG_SH).await?;
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
    ssh_exec_async(&server, &write_cmd).await.map_err(map_restart_error)?;
    Ok(())
}

pub async fn restart_docker_daemon(
    server_id: String,
    sudo_password: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    restart_docker_service(&server, sudo_password).await
}
