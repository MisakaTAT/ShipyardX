use tauri::State;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;

use crate::core::docker::{
    docker_get, invalidate_api_version, resolve_api_version,
    stats::{compute_stats, RawStats},
};
use crate::core::models::{ContainerStats, DockerDaemonSettings, DockerInfo};
use crate::core::ssh::ssh_exec;
use crate::core::state::{get_server_config, AppState};

const ERR_BAD_SUDO_PASSWORD: &str = "__ERR_BAD_SUDO_PASSWORD__";
const ERR_BAD_SU_PASSWORD: &str = "__ERR_BAD_SU_PASSWORD__";
const ERR_NO_MANAGER: &str = "__ERR_NO_MANAGER__";
const ERR_SYSTEMCTL: &str = "__ERR_SYSTEMCTL__";
const ERR_RC_SERVICE: &str = "__ERR_RC_SERVICE__";
const ERR_SERVICE_OP: &str = "__ERR_SERVICE_OP__";
const ERR_SUDO_NONINTERACTIVE: &str = "__ERR_SUDO_NONINTERACTIVE__";
const ERR_NO_SUDO: &str = "__ERR_NO_SUDO__";

fn map_restart_error(err: String) -> String {
    if err.contains(ERR_BAD_SUDO_PASSWORD) {
        return "提权失败：sudo 密码错误，请重新输入。".to_string();
    }
    if err.contains(ERR_BAD_SU_PASSWORD) {
        return "提权失败：root 密码错误，请重新输入。".to_string();
    }
    if err.contains(ERR_NO_MANAGER) {
        return "重启失败：未检测到可用的服务管理器（systemctl / rc-service / service）。请在服务器上手动重启 Docker。"
            .to_string();
    }
    if err.contains(ERR_SUDO_NONINTERACTIVE) {
        return "重启失败：无法非交互使用 sudo（未配置 NOPASSWD）。请在服务器连接中填写 sudo 密码，或在 sudoers 中为该用户配置 docker/systemctl 的无密码规则。"
            .to_string();
    }
    if err.contains(ERR_NO_SUDO) {
        return "重启失败：当前用户非 root 且未找到 sudo，无法重启 Docker 服务。请使用 root 或具备 sudo 的账户。"
            .to_string();
    }
    if err.contains(ERR_SYSTEMCTL) {
        return "重启失败：systemctl 重启 docker 未成功（可能为权限、单元名或服务状态问题）。若本机可执行 systemctl restart docker.service，请尝试在连接中填写 sudo 密码。"
            .to_string();
    }
    if err.contains(ERR_RC_SERVICE) || err.contains(ERR_SERVICE_OP) {
        return "重启失败：已检测到服务管理器，但执行 docker restart 失败，请检查服务名称与权限。".to_string();
    }
    format!("重启失败：{}", err)
}

fn restart_docker_service(
    server: &crate::core::models::ServerConfig,
    sudo_password: Option<String>,
) -> Result<(), String> {
    let restart_cmd = if let Some(pwd) = sudo_password.filter(|s| !s.is_empty()) {
        let pwd_b64 = STANDARD.encode(pwd);
        format!(
            "PASS_B64='{}'; PASS=\"$(printf '%s' \"$PASS_B64\" | base64 -d)\"; has(){{ command -v \"$1\" >/dev/null 2>&1; }}; run(){{ if [ \"$(id -u)\" = \"0\" ]; then \"$@\"; elif has sudo; then if printf '%s\\n' \"$PASS\" | sudo -S -p '' -k -v >/dev/null 2>&1; then printf '%s\\n' \"$PASS\" | sudo -S -p '' \"$@\"; else echo \"{}\" 1>&2; return 1; fi; elif has su; then if printf '%s\\n' \"$PASS\" | su -c 'true' root >/dev/null 2>&1; then printf '%s\\n' \"$PASS\" | su -c \"$*\" root; else echo \"{}\" 1>&2; return 1; fi; else return 127; fi; }}; if has systemctl; then run systemctl restart docker.service || run systemctl restart docker || {{ echo \"{}\" 1>&2; exit 1; }}; elif has rc-service; then run rc-service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; elif has service; then run service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; else echo \"{}\" 1>&2; exit 1; fi",
            pwd_b64, ERR_BAD_SUDO_PASSWORD, ERR_BAD_SU_PASSWORD, ERR_SYSTEMCTL, ERR_RC_SERVICE, ERR_SERVICE_OP, ERR_NO_MANAGER
        )
    } else {
        format!(
            "has(){{ command -v \"$1\" >/dev/null 2>&1; }}; run(){{ if [ \"$(id -u)\" = \"0\" ]; then \"$@\"; elif has sudo; then if sudo -n true 2>/dev/null; then sudo -n \"$@\"; else echo \"{}\" 1>&2; exit 1; fi; else echo \"{}\" 1>&2; exit 1; fi; }}; if has systemctl; then run systemctl restart docker.service || run systemctl restart docker || {{ echo \"{}\" 1>&2; exit 1; }}; elif has rc-service; then run rc-service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; elif has service; then run service docker restart || {{ echo \"{}\" 1>&2; exit 1; }}; else echo \"{}\" 1>&2; exit 1; fi",
            ERR_SUDO_NONINTERACTIVE, ERR_NO_SUDO, ERR_SYSTEMCTL, ERR_RC_SERVICE, ERR_SERVICE_OP, ERR_NO_MANAGER
        )
    };
    ssh_exec(server, &restart_cmd).map_err(map_restart_error)?;
    Ok(())
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct DockerInfoResponse {
    #[serde(rename = "Containers")]
    containers: Option<i64>,
    #[serde(rename = "ContainersRunning")]
    containers_running: Option<i64>,
    #[serde(rename = "ContainersPaused")]
    containers_paused: Option<i64>,
    #[serde(rename = "ContainersStopped")]
    containers_stopped: Option<i64>,
    #[serde(rename = "Images")]
    images: Option<i64>,
    #[serde(rename = "ServerVersion")]
    server_version: Option<String>,
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "NCPU")]
    ncpu: Option<i64>,
    #[serde(rename = "MemTotal")]
    mem_total: Option<i64>,
    #[serde(rename = "OperatingSystem")]
    os: Option<String>,
    #[serde(rename = "OSVersion")]
    os_version: Option<String>,
    #[serde(rename = "KernelVersion")]
    kernel_version: Option<String>,
    #[serde(rename = "Architecture")]
    architecture: Option<String>,
    #[serde(rename = "Driver")]
    storage_driver: Option<String>,
    #[serde(rename = "Warnings")]
    warnings: Option<Vec<serde_json::Value>>,
}

pub async fn get_docker_info(server_id: String, state: State<'_, AppState>) -> Result<DockerInfo, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/info")?;
        let v: DockerInfoResponse = serde_json::from_str(&resp).map_err(|e| format!("解析失败: {}", e))?;
        Ok(DockerInfo {
            containers: v.containers.unwrap_or(0),
            containers_running: v.containers_running.unwrap_or(0),
            containers_paused: v.containers_paused.unwrap_or(0),
            containers_stopped: v.containers_stopped.unwrap_or(0),
            images: v.images.unwrap_or(0),
            server_version: v.server_version.unwrap_or_default(),
            api_version: resolve_api_version(&server).unwrap_or_default(),
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
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn check_docker_access(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        invalidate_api_version(&server);
        match resolve_api_version(&server) {
            Ok(_) => Ok(()),
            Err(e) => {
                let diag = ssh_exec(
                    &server,
                    "if [ ! -S /var/run/docker.sock ]; then echo 'no_docker'; elif [ ! -r /var/run/docker.sock ]; then echo 'no_permission'; else echo 'ok'; fi",
                )
                .unwrap_or_else(|_| "ok".to_string());
                match diag.trim() {
                    "no_docker" => Err("no_docker".to_string()),
                    "no_permission" => Err("no_permission".to_string()),
                    _ => Err(e),
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn get_container_stats(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<ContainerStats, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(
            &server,
            &format!("/containers/{}/stats?stream=false&one-shot=true", container_id),
        )?;
        let raw: RawStats = serde_json::from_str(&resp).map_err(|e| format!("解析 stats 失败: {}", e))?;
        Ok(compute_stats(raw))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Default, Deserialize, serde::Serialize)]
#[serde(default)]
struct DockerDaemonConfig {
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

pub async fn get_docker_daemon_settings(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<DockerDaemonSettings, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let cmd = "if [ -r /etc/docker/daemon.json ]; then cat /etc/docker/daemon.json; else echo '{}'; fi";
        let raw = ssh_exec(&server, cmd)?;
        let cfg: DockerDaemonConfig = serde_json::from_str(raw.trim()).unwrap_or_default();

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

        Ok(DockerDaemonSettings {
            mirror_urls: mirror_url,
            log_rotation,
            log_max_size,
            log_max_file,
            live_restore: cfg.live_restore.unwrap_or(false),
            cgroup_driver,
            socket_path,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[allow(clippy::too_many_arguments)]
pub async fn update_docker_daemon_settings(
    server_id: String,
    mirror_urls: Vec<String>,
    log_rotation: bool,
    log_max_size: String,
    log_max_file: String,
    live_restore: bool,
    cgroup_driver: String,
    socket_path: String,
    sudo_password: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let read_cmd = "if [ -r /etc/docker/daemon.json ]; then cat /etc/docker/daemon.json; else echo '{}'; fi";
        let current_raw = ssh_exec(&server, read_cmd)?;
        let mut cfg: DockerDaemonConfig = serde_json::from_str(current_raw.trim()).unwrap_or_default();

        let mirrors: Vec<String> = mirror_urls
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        cfg.registry_mirrors = if mirrors.is_empty() {
            None
        } else {
            Some(mirrors)
        };
        cfg.live_restore = if live_restore { Some(true) } else { None };

        let cgroup = cgroup_driver.trim();
        cfg.exec_opts = if cgroup.is_empty() {
            None
        } else {
            Some(vec![format!("native.cgroupdriver={}", cgroup)])
        };

        let socket = socket_path.trim();
        cfg.hosts = if socket.is_empty() { None } else { Some(vec![socket.to_string()]) };

        if log_rotation {
            cfg.log_driver = Some("json-file".to_string());
            let mut opts = std::collections::HashMap::new();
            let max_size = if log_max_size.trim().is_empty() {
                "10m".to_string()
            } else {
                log_max_size.trim().to_string()
            };
            let max_file = if log_max_file.trim().is_empty() {
                "3".to_string()
            } else {
                log_max_file.trim().to_string()
            };
            opts.insert("max-size".to_string(), max_size);
            opts.insert("max-file".to_string(), max_file);
            cfg.log_opts = Some(opts);
        } else {
            cfg.log_driver = None;
            cfg.log_opts = None;
        }

        let json = serde_json::to_string_pretty(&cfg).map_err(|e| format!("序列化 daemon 配置失败: {}", e))?;
        let b64 = STANDARD.encode(json);
        let write_cmd = if let Some(pwd) = sudo_password.clone().filter(|s| !s.is_empty()) {
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
        ssh_exec(&server, &write_cmd).map_err(map_restart_error)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn restart_docker_daemon(
    server_id: String,
    sudo_password: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        restart_docker_service(&server, sudo_password)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
