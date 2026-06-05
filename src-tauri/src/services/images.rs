use std::sync::mpsc;

use russh::ChannelMsg;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::contracts::docker_api::container::ContainerSummary;
use crate::contracts::docker_api::image::{ImageHistoryItem, ImageSummary};
use crate::contracts::frontend::events::{DockerSshStreamChunk, DockerSshStreamDone};
use crate::contracts::frontend::image::Image;
use crate::contracts::frontend::server::ServerConfig;
use crate::docker::client::{docker_delete_async, docker_get_async, pretty_json_response};
use crate::docker::mapping::api_image_to_dto;
use crate::error::{AppError, AppResult};
use crate::ssh::client::{block_on, connect, disconnect};
use crate::state::{AppState, StreamHandle, get_server_config};
use crate::utils::id::generate_id;
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_images(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Image>> {
    let server = get_server_config(&state, &server_id)?;
    let containers_resp = docker_get_async(&server, "/containers/json?all=1").await?;
    let containers: Vec<ContainerSummary> = serde_json::from_str(&containers_resp)
        .map_err(|e| AppError::internal("image.container_list_parse_failed", "解析容器列表失败").with_source(e))?;

    let mut used_by: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for c in containers {
        let id = c.image_id.trim();
        if id.is_empty() {
            continue;
        }
        *used_by.entry(id.to_string()).or_insert(0) += 1;
    }

    let resp = docker_get_async(&server, "/images/json").await?;
    let mut api: Vec<ImageSummary> = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("image.list_parse_failed", "解析镜像列表失败").with_source(e))?;
    sort_by_created_desc_then_id(&mut api, |x| x.created, |x| x.id.clone());
    Ok(api
        .into_iter()
        .map(|img| {
            let cnt = used_by.get(img.id.as_str()).copied().unwrap_or(0);
            api_image_to_dto(img, cnt)
        })
        .collect())
}

pub async fn inspect_image(server_id: String, image_id: String, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, &format!("/images/{}/json", image_id)).await?;
    pretty_json_response(&resp)
}

pub async fn get_image_history(
    server_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::contracts::frontend::image::ImageLayer>> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, &format!("/images/{}/history", image_id)).await?;
    let api: Vec<ImageHistoryItem> = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("image.history_parse_failed", "解析镜像历史失败").with_source(e))?;
    Ok(api
        .into_iter()
        .map(|l| crate::contracts::frontend::image::ImageLayer {
            id: l.id,
            created_ts: l.created,
            size: l.size,
            command: l.created_by,
            comment: l.comment,
        })
        .collect())
}

pub async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    docker_delete_async(&server, &format!("/images/{}?force={}", image_id, force)).await
}

fn run_pull_thread(config: ServerConfig, pull_id: String, image: String, rx: mpsc::Receiver<()>, ah: AppHandle) {
    let done_stream_id = pull_id.clone();
    let done_handle = ah.clone();
    let result = block_on(async move {
        let mut handle = match connect(&config).await {
            Ok(s) => s,
            Err(e) => {
                let _ = DockerSshStreamChunk {
                    stream_id: pull_id.clone(),
                    chunk: format!("连接失败: {}\n", e.message),
                }
                .emit(&ah);
                return Err(
                    AppError::unavailable("image.pull_connect_failed", "连接镜像仓库所在主机失败")
                        .with_detail(e.detail.unwrap_or(e.message)),
                );
            }
        };

        let mut channel = match handle.channel_open_session().await {
            Ok(c) => c,
            Err(e) => {
                let _ = DockerSshStreamChunk {
                    stream_id: pull_id.clone(),
                    chunk: format!("通道失败: {}\n", e),
                }
                .emit(&ah);
                disconnect(&mut handle).await;
                return Err(AppError::internal("image.pull_channel_failed", "创建镜像拉取通道失败").with_source(e));
            }
        };

        if let Err(e) = channel.exec(true, format!("docker pull {} 2>&1", image)).await {
            let _ = DockerSshStreamChunk {
                stream_id: pull_id.clone(),
                chunk: format!("执行失败: {}\n", e),
            }
            .emit(&ah);
            disconnect(&mut handle).await;
            return Err(AppError::internal("image.pull_exec_failed", "启动镜像拉取命令失败").with_source(e));
        }

        let mut exit_code = -1i32;
        let mut stderr = String::new();
        loop {
            match rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close().await;
                    disconnect(&mut handle).await;
                    return Err(AppError::conflict("image.pull_cancelled", "镜像拉取已取消"));
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            tokio::select! {
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { data }) => {
                            let text = String::from_utf8_lossy(&data).to_string();
                            let _ = DockerSshStreamChunk {
                                stream_id: pull_id.clone(),
                                chunk: text,
                            }.emit(&ah);
                        }
                        Some(ChannelMsg::ExtendedData { data, .. }) => {
                            let text = String::from_utf8_lossy(&data).to_string();
                            stderr.push_str(&text);
                            let _ = DockerSshStreamChunk {
                                stream_id: pull_id.clone(),
                                chunk: text,
                            }.emit(&ah);
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            exit_code = exit_status as i32;
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            disconnect(&mut handle).await;
                            if exit_code == 0 {
                                return Ok(());
                            }
                            let detail = stderr.trim();
                            return Err(
                                AppError::unavailable("image.pull_failed", "镜像拉取失败")
                                    .with_detail(if detail.is_empty() {
                                        format!("docker pull 退出码: {}", exit_code)
                                    } else {
                                        detail.to_string()
                                    })
                            );
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
        success: result.is_ok(),
        error: result.err(),
    }
    .emit(&done_handle);
}

pub fn start_image_pull(
    server_id: String,
    image: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
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
