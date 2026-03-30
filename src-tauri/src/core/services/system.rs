use tauri::State;

use serde::Deserialize;

use crate::core::docker::{
    docker_get, invalidate_api_version, resolve_api_version,
    stats::{compute_stats, RawStats},
};
use crate::core::models::{ContainerStats, DockerInfo};
use crate::core::ssh::ssh_exec;
use crate::core::state::{get_server_config, AppState};

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
