use std::io::Read;
use std::sync::mpsc;

use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::docker::client::{docker_delete, docker_get, pretty_json_response};
use crate::docker::mapping::api_image_to_dto;
use crate::models::app::events::{DockerSshStreamChunk, DockerSshStreamDone};
use crate::models::app::image::Image;
use crate::models::app::server::ServerConfig;
use crate::models::docker::image::ImageSummary;
use crate::ssh::session::create_ssh_session;
use crate::state::{AppState, StreamHandle, get_server_config};
use crate::utils::id::generate_id;
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_images(server_id: String, state: State<'_, AppState>) -> Result<Vec<Image>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/images/json")?;
        let mut api: Vec<ImageSummary> = serde_json::from_str(&resp).map_err(|e| format!("解析镜像列表失败: {}", e))?;
        sort_by_created_desc_then_id(&mut api, |x| x.created, |x| x.id.clone());
        Ok(api.into_iter().map(api_image_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn inspect_image(server_id: String, image_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, &format!("/images/{}/json", image_id))?;
        pretty_json_response(&resp)
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
            let _ = DockerSshStreamChunk {
                stream_id: pull_id.clone(),
                chunk: format!("连接失败: {}\n", e),
            }
            .emit(&ah);
            let _ = DockerSshStreamDone {
                stream_id: pull_id.clone(),
                success: false,
            }
            .emit(&ah);
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let _ = DockerSshStreamChunk {
                stream_id: pull_id.clone(),
                chunk: format!("通道失败: {}\n", e),
            }
            .emit(&ah);
            let _ = DockerSshStreamDone {
                stream_id: pull_id.clone(),
                success: false,
            }
            .emit(&ah);
            return;
        }
    };

    if let Err(e) = channel.exec(&format!("docker pull {} 2>&1", image)) {
        let _ = DockerSshStreamChunk {
            stream_id: pull_id.clone(),
            chunk: format!("执行失败: {}\n", e),
        }
        .emit(&ah);
        let _ = DockerSshStreamDone {
            stream_id: pull_id.clone(),
            success: false,
        }
        .emit(&ah);
        return;
    }

    sess.set_blocking(false);
    let mut buf = [0u8; 4096];

    loop {
        match rx.try_recv() {
            Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                let _ = DockerSshStreamDone {
                    stream_id: pull_id.clone(),
                    success: false,
                }
                .emit(&ah);
                return;
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }
        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let _ = DockerSshStreamChunk {
                    stream_id: pull_id.clone(),
                    chunk: String::from_utf8_lossy(&buf[..n]).to_string(),
                }
                .emit(&ah);
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
    let _ = DockerSshStreamDone {
        stream_id: pull_id.clone(),
        success,
    }
    .emit(&ah);
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
