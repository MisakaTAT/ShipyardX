use std::sync::mpsc;

use russh::ChannelMsg;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::docker::client::{docker_delete, docker_get, pretty_json_response};
use crate::docker::mapping::api_image_to_dto;
use crate::models::app::events::{DockerSshStreamChunk, DockerSshStreamDone};
use crate::models::app::image::Image;
use crate::models::app::server::ServerConfig;
use crate::models::docker::container::ContainerSummary;
use crate::models::docker::image::{ImageHistoryItem, ImageSummary};
use crate::ssh::client::{block_on, connect, disconnect, map_error};
use crate::state::{AppState, StreamHandle, get_server_config};
use crate::utils::id::generate_id;
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_images(server_id: String, state: State<'_, AppState>) -> Result<Vec<Image>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let containers_resp = docker_get(&server, "/containers/json?all=1")?;
        let containers: Vec<ContainerSummary> =
            serde_json::from_str(&containers_resp).map_err(|e| format!("解析容器列表失败: {}", e))?;

        let mut used_by: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for c in containers {
            let id = c.image_id.trim();
            if id.is_empty() {
                continue;
            }
            *used_by.entry(id.to_string()).or_insert(0) += 1;
        }

        let resp = docker_get(&server, "/images/json")?;
        let mut api: Vec<ImageSummary> = serde_json::from_str(&resp).map_err(|e| format!("解析镜像列表失败: {}", e))?;
        sort_by_created_desc_then_id(&mut api, |x| x.created, |x| x.id.clone());
        Ok(api
            .into_iter()
            .map(|img| {
                let cnt = used_by.get(img.id.as_str()).copied().unwrap_or(0);
                api_image_to_dto(img, cnt)
            })
            .collect())
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

pub async fn get_image_history(
    server_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<crate::models::app::image::ImageLayer>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, &format!("/images/{}/history", image_id))?;
        let api: Vec<ImageHistoryItem> = serde_json::from_str(&resp).map_err(|e| format!("解析镜像历史失败: {}", e))?;
        Ok(api
            .into_iter()
            .map(|l| crate::models::app::image::ImageLayer {
                id: l.id,
                created_ts: l.created,
                size: l.size,
                command: l.created_by,
                comment: l.comment,
            })
            .collect())
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
    let done_stream_id = pull_id.clone();
    let done_handle = ah.clone();
    let success = block_on(async move {
        let mut handle = match connect(&config).await {
            Ok(s) => s,
            Err(e) => {
                let _ = DockerSshStreamChunk {
                    stream_id: pull_id.clone(),
                    chunk: format!("连接失败: {}\n", e),
                }
                .emit(&ah);
                return false;
            }
        };

        let mut channel = match handle.channel_open_session().await {
            Ok(c) => c,
            Err(e) => {
                let _ = DockerSshStreamChunk {
                    stream_id: pull_id.clone(),
                    chunk: format!("通道失败: {}\n", map_error("通道失败", e)),
                }
                .emit(&ah);
                disconnect(&mut handle).await;
                return false;
            }
        };

        if let Err(e) = channel.exec(true, format!("docker pull {} 2>&1", image)).await {
            let _ = DockerSshStreamChunk {
                stream_id: pull_id.clone(),
                chunk: format!("执行失败: {}\n", map_error("执行失败", e)),
            }
            .emit(&ah);
            disconnect(&mut handle).await;
            return false;
        }

        let mut exit_code = -1i32;
        loop {
            match rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close().await;
                    disconnect(&mut handle).await;
                    return false;
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            tokio::select! {
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                            let _ = DockerSshStreamChunk {
                                stream_id: pull_id.clone(),
                                chunk: String::from_utf8_lossy(&data).to_string(),
                            }.emit(&ah);
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            exit_code = exit_status as i32;
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            disconnect(&mut handle).await;
                            return exit_code == 0;
                        }
                        _ => {}
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(20)) => {}
            }
        }
    });

    let _ = DockerSshStreamDone {
        stream_id: done_stream_id,
        success,
    }
    .emit(&done_handle);
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
