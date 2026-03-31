use tauri::State;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

use crate::core::docker::{api_container_to_dto, docker_delete, docker_get, docker_post, resolve_api_version};
use crate::core::ssh::ssh_exec;
use crate::core::state::{get_server_config, AppState};
use crate::models::docker_api::ContainerResp;
use crate::models::docker::DockerContainer;

pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerContainer>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/containers/json?all=1")?;
        let mut api: Vec<ContainerResp> = serde_json::from_str(&resp)
            .map_err(|e| format!("解析容器列表失败: {} — 原始响应: {}", e, &resp[..resp.len().min(200)]))?;
        // 按创建时间倒序（最新在前）
        api.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(api.into_iter().map(api_container_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn start_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post(&server, &format!("/containers/{}/start", container_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post(&server, &format!("/containers/{}/stop", container_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn restart_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post(&server, &format!("/containers/{}/restart", container_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_delete(&server, &format!("/containers/{}?force={}", container_id, force))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let ver = resolve_api_version(&server)?;
        let ts = if timestamps { "&timestamps=1" } else { "" };
        let cmd = format!(
            "curl -s --unix-socket /var/run/docker.sock \
            'http://localhost/v{}/containers/{}/logs?stdout=1&stderr=1&tail={}&follow=0{}' | base64",
            ver, container_id, tail, ts
        );
        let b64 = ssh_exec(&server, &cmd)?;
        let raw = BASE64
            .decode(b64.trim())
            .map_err(|e| format!("base64 解码失败: {}", e))?;
        Ok(demux_log_stream(&raw))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn demux_log_stream(data: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0usize;
    while i + 8 <= data.len() {
        let stream_type = data[i];
        let size = u32::from_be_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]) as usize;
        i += 8;
        if i + size > data.len() {
            break;
        }
        if stream_type <= 2 {
            out.push_str(&String::from_utf8_lossy(&data[i..i + size]));
        }
        i += size;
    }
    if out.is_empty() && !data.is_empty() {
        out = String::from_utf8_lossy(data).to_string();
    }
    out
}

