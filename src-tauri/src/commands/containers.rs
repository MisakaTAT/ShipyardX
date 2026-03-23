use tauri::State;

use crate::docker::{api_container_to_dto, docker_delete, docker_get, docker_post, ApiContainer};
use crate::models::DockerContainer;
use crate::ssh::ssh_exec;
use crate::state::{get_server_config, AppState};

#[tauri::command]
pub async fn list_containers(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DockerContainer>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/v1.41/containers/json?all=1")?;
        let api: Vec<ApiContainer> = serde_json::from_str(&resp).map_err(|e| {
            format!("解析容器列表失败: {} — 原始响应: {}", e, &resp[..resp.len().min(200)])
        })?;
        Ok(api.into_iter().map(api_container_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn start_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_post(&server, &format!("/v1.41/containers/{}/start", container_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stop_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_post(&server, &format!("/v1.41/containers/{}/stop", container_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn restart_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_post(&server, &format!("/v1.41/containers/{}/restart", container_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_delete(
            &server,
            &format!("/v1.41/containers/{}?force={}", container_id, force),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let cmd = format!(
            "curl -s --unix-socket /var/run/docker.sock \
            'http://localhost/v1.41/containers/{}/logs?stdout=1&stderr=1&tail={}&follow=0' | base64",
            container_id, tail
        );
        let b64 = ssh_exec(&server, &cmd)?;
        let raw = base64_decode(b64.trim())?;
        Ok(demux_log_stream(&raw))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── 日志流解码工具（静态日志专用）────────────────────────────

/// Docker multiplexed log stream 帧：[stream_type(1)][padding(3)][size_be(4)][payload]
fn demux_log_stream(data: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0usize;
    while i + 8 <= data.len() {
        let stream_type = data[i];
        let size =
            u32::from_be_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]) as usize;
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

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [255u8; 256];
    for (i, &c) in CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let clean: Vec<u8> = input
        .bytes()
        .filter(|&b| b != b'\n' && b != b'\r' && b != b' ')
        .collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &c in &clean {
        if c == b'=' {
            break;
        }
        let v = table[c as usize];
        if v == 255 {
            return Err(format!("无效的 base64 字符: {}", c as char));
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}
