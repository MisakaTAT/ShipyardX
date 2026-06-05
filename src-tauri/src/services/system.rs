use tauri::State;

use base64::{Engine as _, engine::general_purpose::STANDARD};

use crate::docker::client::{docker_get_async, invalidate_api_version, resolve_api_version_async};
use crate::docker::stats::compute_stats;
use crate::error::{AppError, AppResult};
use crate::models::app::container::ContainerStats;
use crate::models::app::daemon::{DaemonSettings, DaemonUpdate};
use crate::models::app::info::DockerEngineInfo;
use crate::models::app::server::ServerConfig;
use crate::models::docker::stats::DockerStats;
use crate::models::docker::system::{DaemonConfig, SystemInfo};
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
        format!(
            "PASS_B64='{}'; PASS=\"$(printf '%s' \"$PASS_B64\" | base64 -d)\"; has(){{ command -v \"$1\" >/dev/null 2>&1; }}; run(){{ if [ \"$(id -u)\" = \"0\" ]; then \"$@\"; elif has sudo; then if printf '%s\\n' \"$PASS\" | sudo -S -p '' -k -v >/dev/null 2>&1; then printf '%s\\n' \"$PASS\" | sudo -S -p '' \"$@\"; else echo \"{}\" 1>&2; return 1; fi; elif has su; then if printf '%s\\n' \"$PASS\" | su -c 'true' root >/dev/null 2>&1; then printf '%s\\n' \"$PASS\" | su -c \"$*\" root; else echo \"{}\" 1>&2; return 1; fi; else return 127; fi; }}; if has systemctl; then run systemctl restart docker.service || run systemctl restart docker || {{ echo \"{}\" 1>&2; exit 1; }}; elif has rc-service; then run rc-service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; elif has service; then run service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; else echo \"{}\" 1>&2; exit 1; fi",
            pwd_b64,
            ERR_BAD_SUDO_PASSWORD,
            ERR_BAD_SU_PASSWORD,
            ERR_SYSTEMCTL,
            ERR_RC_SERVICE,
            ERR_SERVICE_OP,
            ERR_NO_MANAGER
        )
    } else {
        format!(
            "has(){{ command -v \"$1\" >/dev/null 2>&1; }}; run(){{ if [ \"$(id -u)\" = \"0\" ]; then \"$@\"; elif has sudo; then if sudo -n true 2>/dev/null; then sudo -n \"$@\"; else echo \"{}\" 1>&2; exit 1; fi; else echo \"{}\" 1>&2; exit 1; fi; }}; if has systemctl; then run systemctl restart docker.service || run systemctl restart docker || {{ echo \"{}\" 1>&2; exit 1; }}; elif has rc-service; then run rc-service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; elif has service; then run service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; else echo \"{}\" 1>&2; exit 1; fi",
            ERR_SUDO_NONINTERACTIVE, ERR_NO_SUDO, ERR_SYSTEMCTL, ERR_RC_SERVICE, ERR_SERVICE_OP, ERR_NO_MANAGER
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
    match resolve_api_version_async(&server).await {
        Ok(_) => Ok(()),
        Err(e) => {
            let diag = ssh_exec_async(
                &server,
                "if [ ! -S /var/run/docker.sock ]; then echo 'no_docker'; elif [ ! -r /var/run/docker.sock ]; then echo 'no_permission'; else echo 'ok'; fi",
            )
            .await
            .unwrap_or_else(|_| "ok".to_string());
            match diag.trim() {
                "no_docker" => Err(AppError::unavailable(
                    "docker.unavailable",
                    "Docker 未安装、未运行，或 /var/run/docker.sock 不可用。",
                )),
                "no_permission" => Err(AppError::permission(
                    "docker.permission_denied",
                    "当前用户没有访问 Docker Socket 的权限。",
                )),
                _ => Err(AppError::unavailable("docker.connect_failed", "无法连接 Docker")
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
    let cmd = "if [ -r /etc/docker/daemon.json ]; then cat /etc/docker/daemon.json; else echo '{}'; fi";
    let raw = ssh_exec_async(&server, cmd).await?;
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
    let read_cmd = "if [ -r /etc/docker/daemon.json ]; then cat /etc/docker/daemon.json; else echo '{}'; fi";
    let current_raw = ssh_exec_async(&server, read_cmd).await?;
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
    cfg.hosts = if socket.is_empty() { None } else { Some(vec![socket.to_string()]) };

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
        format!(
            "CFG_B64='{}'; PASS_B64='{}'; PASS=\"$(printf '%s' \"$PASS_B64\" | base64 -d)\"; if [ \"$(id -u)\" = \"0\" ]; then printf '%s' \"$CFG_B64\" | base64 -d | tee /etc/docker/daemon.json >/dev/null; elif command -v sudo >/dev/null 2>&1; then if printf '%s\\n' \"$PASS\" | sudo -S -p '' -k -v >/dev/null 2>&1; then printf '%s\\n' \"$PASS\" | sudo -S -p '' sh -c \"printf '%s' '$CFG_B64' | base64 -d | tee /etc/docker/daemon.json >/dev/null\"; else echo \"{}\" 1>&2; exit 1; fi; elif command -v su >/dev/null 2>&1; then if printf '%s\\n' \"$PASS\" | su -c 'true' root >/dev/null 2>&1; then printf '%s\\n' \"$PASS\" | su -c \"printf '%s' '$CFG_B64' | base64 -d | tee /etc/docker/daemon.json >/dev/null\" root; else echo \"{}\" 1>&2; exit 1; fi; else exit 1; fi",
            b64, pwd_b64, ERR_BAD_SUDO_PASSWORD, ERR_BAD_SU_PASSWORD
        )
    } else {
        format!(
            "printf '%s' '{}' | base64 -d | (sudo -n tee /etc/docker/daemon.json >/dev/null || tee /etc/docker/daemon.json >/dev/null)",
            b64
        )
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
