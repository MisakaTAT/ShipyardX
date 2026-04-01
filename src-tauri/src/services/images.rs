use std::io::Read;
use std::sync::mpsc;

use tauri::{AppHandle, Emitter, State};

use crate::docker::client::{docker_delete, docker_get};
use crate::docker::mapping::api_image_to_dto;
use crate::models::app::docker::DockerImage;
use crate::models::app::server::ServerConfig;
use crate::models::docker::engine::ImageSummary;
use crate::ssh::session::create_ssh_session;
use crate::state::{AppState, StreamHandle, get_server_config};
use crate::utils::id::generate_id;

pub async fn list_images(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerImage>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/images/json")?;
        let mut api: Vec<ImageSummary> = serde_json::from_str(&resp).map_err(|e| format!("解析镜像列表失败: {}", e))?;
        // 按创建时间倒序（最新在前）
        api.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(api.into_iter().map(api_image_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_delete(&server, &format!("/images/{}?force={}", image_id, force)))
        .await
        .map_err(|e| e.to_string())?
}

fn run_pull_thread(config: ServerConfig, pull_id: String, image: String, rx: mpsc::Receiver<()>, ah: AppHandle) {
    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            let _ = ah.emit(&format!("pull-data:{}", pull_id), format!("连接失败: {}\n", e));
            let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let _ = ah.emit(&format!("pull-data:{}", pull_id), format!("通道失败: {}\n", e));
            let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
            return;
        }
    };

    if let Err(e) = channel.exec(&format!("docker pull {} 2>&1", image)) {
        let _ = ah.emit(&format!("pull-data:{}", pull_id), format!("执行失败: {}\n", e));
        let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
        return;
    }

    sess.set_blocking(false);
    let mut buf = [0u8; 4096];

    loop {
        match rx.try_recv() {
            Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
                return;
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }
        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let _ = ah.emit(
                    &format!("pull-data:{}", pull_id),
                    String::from_utf8_lossy(&buf[..n]).to_string(),
                );
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(_) => break,
        }
        if channel.eof() {
            break;
        }
    }

    channel.wait_close().ok();
    let success = channel.exit_status().unwrap_or(-1) == 0;
    let _ = ah.emit(&format!("pull-done:{}", pull_id), success);
}

pub fn start_image_pull(
    server_id: String,
    image: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    let pull_id = generate_id();
    let (tx, rx) = mpsc::channel::<()>();

    let pid = pull_id.clone();
    let img = image.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_pull_thread(server, pid, img, rx, ah));

    state
        .streams
        .lock()
        .unwrap()
        .insert(pull_id.clone(), StreamHandle { tx });
    Ok(pull_id)
}

pub fn cancel_stream(stream_id: String, state: State<AppState>) {
    if let Some(h) = state.streams.lock().unwrap().remove(&stream_id) {
        let _ = h.tx.send(());
    }
}
