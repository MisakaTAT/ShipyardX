use tauri::State;

use crate::docker::{
    docker_get,
    stats::{compute_stats, RawStats},
};
use crate::models::{ContainerStats, DockerInfo};
use crate::state::{get_server_config, AppState};

#[tauri::command]
pub async fn get_docker_info(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<DockerInfo, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/v1.41/info")?;
        let v: serde_json::Value =
            serde_json::from_str(&resp).map_err(|e| format!("解析失败: {}", e))?;
        Ok(DockerInfo {
            containers: v["Containers"].as_i64().unwrap_or(0),
            containers_running: v["ContainersRunning"].as_i64().unwrap_or(0),
            containers_paused: v["ContainersPaused"].as_i64().unwrap_or(0),
            containers_stopped: v["ContainersStopped"].as_i64().unwrap_or(0),
            images: v["Images"].as_i64().unwrap_or(0),
            server_version: v["ServerVersion"].as_str().unwrap_or("").to_string(),
            name: v["Name"].as_str().unwrap_or("").to_string(),
            ncpu: v["NCPU"].as_i64().unwrap_or(0),
            mem_total: v["MemTotal"].as_i64().unwrap_or(0),
            os: v["OperatingSystem"].as_str().unwrap_or("").to_string(),
            os_version: v["OSVersion"].as_str().unwrap_or("").to_string(),
            kernel_version: v["KernelVersion"].as_str().unwrap_or("").to_string(),
            architecture: v["Architecture"].as_str().unwrap_or("").to_string(),
            storage_driver: v["Driver"].as_str().unwrap_or("").to_string(),
            warnings: v["Warnings"]
                .as_array()
                .map(|a| a.len() as i64)
                .unwrap_or(0),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_container_stats(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<ContainerStats, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(
            &server,
            &format!(
                "/v1.41/containers/{}/stats?stream=false&one-shot=true",
                container_id
            ),
        )?;
        let raw: RawStats =
            serde_json::from_str(&resp).map_err(|e| format!("解析 stats 失败: {}", e))?;
        Ok(compute_stats(raw))
    })
    .await
    .map_err(|e| e.to_string())?
}
