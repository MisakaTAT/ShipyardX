use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_specta::Event;
use tokio::sync::watch;
use log::{debug, error, info, warn};

use crate::contracts::docker_api::container::ContainerSummary;
use crate::contracts::docker_api::image::{ImageHistoryItem, ImageSummary};
use crate::contracts::frontend::events::{DockerSshStreamChunk, DockerSshStreamDone};
use crate::contracts::frontend::image::Image;
use crate::contracts::frontend::server::ServerConfig;
use crate::docker::client::{docker_delete_async, docker_get_async, docker_post_stream_async, pretty_json_response};
use crate::docker::mapping::api_image_to_dto;
use crate::error::{AppError, AppResult};
use crate::ssh::client::spawn_on_runtime;
use crate::state::{AppState, StreamHandle, get_server_config, lock_mutex};
use crate::utils::id::generate_id;
use crate::utils::output::TextOutputBuffer;
use crate::utils::sort::sort_by_created_desc_then_id;

const PULL_OUTPUT_CHUNK_BYTES: usize = 4 * 1024;
const PULL_OUTPUT_MAX_BYTES: usize = 256 * 1024;
const PULL_OUTPUT_TRUNCATION_NOTICE: &str = "\n[输出已截断，后续拉取日志已省略]\n";

pub async fn list_images(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Image>> {
    debug!(target: "shipyardx_lib::services::images", "listing images; server_id={}", server_id);
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
    let images: Vec<Image> = api
        .into_iter()
        .map(|img| {
            let cnt = used_by.get(img.id.as_str()).copied().unwrap_or(0);
            api_image_to_dto(img, cnt)
        })
        .collect();
    info!(target: "shipyardx_lib::services::images", "listed images; server_id={} count={}", server_id, images.len());
    Ok(images)
}

pub async fn inspect_image(server_id: String, image_id: String, state: State<'_, AppState>) -> AppResult<String> {
    debug!(target: "shipyardx_lib::services::images", "inspecting image; server_id={} image_id={}", server_id, image_id);
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, &format!("/images/{}/json", image_id)).await?;
    pretty_json_response(&resp)
}

pub async fn get_image_history(
    server_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::contracts::frontend::image::ImageLayer>> {
    debug!(target: "shipyardx_lib::services::images", "fetching image history; server_id={} image_id={}", server_id, image_id);
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, &format!("/images/{}/history", image_id)).await?;
    let api: Vec<ImageHistoryItem> = serde_json::from_str(&resp)
        .map_err(|e| AppError::internal("image.history_parse_failed", "解析镜像历史失败").with_source(e))?;
    let layers: Vec<crate::contracts::frontend::image::ImageLayer> = api
        .into_iter()
        .map(|l| crate::contracts::frontend::image::ImageLayer {
            id: l.id,
            created_ts: l.created,
            size: l.size,
            command: l.created_by,
            comment: l.comment,
        })
        .collect();
    info!(target: "shipyardx_lib::services::images", "fetched image history; server_id={} image_id={} layers={}", server_id, image_id, layers.len());
    Ok(layers)
}

pub async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::images", "removing image; server_id={} image_id={} force={}", server_id, image_id, force);
    let server = get_server_config(&state, &server_id)?;
    docker_delete_async(&server, &format!("/images/{}?force={}", image_id, force)).await
}

async fn run_pull_task(
    config: ServerConfig,
    pull_id: String,
    image: String,
    mut stop_rx: watch::Receiver<bool>,
    ah: AppHandle,
) {
    let done_stream_id = pull_id.clone();
    let done_handle = ah.clone();
    info!(target: "shipyardx_lib::services::images", "image pull task started; pull_id={} server_id={} image={}", pull_id, config.id, image);
    let result = async {
        let path = format!("/images/create?fromImage={}", encode_query_component(&image));
        let mut stream = docker_post_stream_async(&config, &path).await.map_err(|e| {
            error!(
                target: "shipyardx_lib::services::images",
                "image pull stream open failed; pull_id={} server_id={} image={} code={} message={} detail={:?}",
                pull_id,
                config.id,
                image,
                e.code,
                e.message,
                e.detail
            );
            let _ = DockerSshStreamChunk {
                stream_id: pull_id.clone(),
                chunk: format!("连接 Docker API 失败: {}\n", e.message),
            }
            .emit(&ah);
            e
        })?;

        let mut buffer = String::new();
        let mut output_buffer = TextOutputBuffer::new(
            PULL_OUTPUT_CHUNK_BYTES,
            Some(PULL_OUTPUT_MAX_BYTES),
            PULL_OUTPUT_TRUNCATION_NOTICE,
        );
        loop {
            tokio::select! {
                changed = stop_rx.changed() => {
                    if changed.is_ok() && *stop_rx.borrow() {
                        warn!(target: "shipyardx_lib::services::images", "image pull cancelled; pull_id={} server_id={} image={}", pull_id, config.id, image);
                        stream.close().await;
                        return Err(AppError::conflict("image.pull_cancelled", "镜像拉取已取消"));
                    }
                }
                chunk = stream.next_chunk() => {
                    match chunk {
                        Ok(Some(chunk)) => {
                            buffer.push_str(&String::from_utf8_lossy(&chunk));
                            emit_pull_lines(&pull_id, &ah, &mut buffer, &mut output_buffer)?;
                        }
                        Ok(None) => {
                            emit_pull_tail(&pull_id, &ah, &mut buffer, &mut output_buffer)?;
                            flush_pull_output(&pull_id, &ah, &mut output_buffer);
                            info!(target: "shipyardx_lib::services::images", "image pull stream completed; pull_id={} server_id={} image={}", pull_id, config.id, image);
                            return Ok(());
                        }
                        Err(e) => {
                            error!(
                                target: "shipyardx_lib::services::images",
                                "image pull stream read failed; pull_id={} server_id={} image={} code={} message={} detail={:?}",
                                pull_id,
                                config.id,
                                image,
                                e.code,
                                e.message,
                                e.detail
                            );
                            return Err(e);
                        }
                    }
                }
            }
        }
    }
    .await;

    match &result {
        Ok(_) => info!(target: "shipyardx_lib::services::images", "image pull succeeded; pull_id={} server_id={} image={}", done_stream_id, config.id, image),
        Err(error) => warn!(
            target: "shipyardx_lib::services::images",
            "image pull finished with error; pull_id={} server_id={} image={} code={} message={} detail={:?}",
            done_stream_id,
            config.id,
            image,
            error.code,
            error.message,
            error.detail
        ),
    }

    let _ = DockerSshStreamDone {
        stream_id: done_stream_id,
        success: result.is_ok(),
        error: result.err(),
    }
    .emit(&done_handle);
}

#[derive(Deserialize)]
struct ImagePullEvent {
    status: Option<String>,
    progress: Option<String>,
    id: Option<String>,
    error: Option<String>,
    #[serde(rename = "errorDetail")]
    error_detail: Option<ImagePullErrorDetail>,
}

#[derive(Deserialize)]
struct ImagePullErrorDetail {
    message: Option<String>,
}

fn encode_query_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn emit_pull_lines(
    stream_id: &str,
    app: &AppHandle,
    buffer: &mut String,
    output_buffer: &mut TextOutputBuffer,
) -> AppResult<()> {
    while let Some(pos) = buffer.find('\n') {
        let line = buffer[..pos].trim_end_matches('\r').to_string();
        buffer.drain(..=pos);
        emit_pull_line(stream_id, app, &line, output_buffer)?;
    }
    Ok(())
}

fn emit_pull_tail(
    stream_id: &str,
    app: &AppHandle,
    buffer: &mut String,
    output_buffer: &mut TextOutputBuffer,
) -> AppResult<()> {
    let line = buffer.trim();
    if !line.is_empty() {
        emit_pull_line(stream_id, app, line, output_buffer)?;
    }
    buffer.clear();
    Ok(())
}

fn emit_pull_line(stream_id: &str, app: &AppHandle, line: &str, output_buffer: &mut TextOutputBuffer) -> AppResult<()> {
    if line.trim().is_empty() {
        return Ok(());
    }

    let event: ImagePullEvent = serde_json::from_str(line)
        .map_err(|e| AppError::internal("image.pull_event_parse_failed", "解析镜像拉取进度失败").with_source(e))?;

    let error = event
        .error_detail
        .as_ref()
        .and_then(|detail| detail.message.as_deref())
        .or(event.error.as_deref())
        .filter(|message| !message.trim().is_empty())
        .map(str::to_string);
    if let Some(error) = error {
        return Err(AppError::unavailable("image.pull_failed", "镜像拉取失败").with_detail(error));
    }

    if let Some(text) = format_pull_event(event) {
        emit_pull_output(stream_id, app, output_buffer, &text);
    }
    Ok(())
}

fn emit_pull_output(stream_id: &str, app: &AppHandle, output_buffer: &mut TextOutputBuffer, text: &str) {
    for chunk in output_buffer.push(text) {
        let _ = DockerSshStreamChunk {
            stream_id: stream_id.to_string(),
            chunk,
        }
        .emit(app);
    }
}

fn flush_pull_output(stream_id: &str, app: &AppHandle, output_buffer: &mut TextOutputBuffer) {
    for chunk in output_buffer.finish() {
        let _ = DockerSshStreamChunk {
            stream_id: stream_id.to_string(),
            chunk,
        }
        .emit(app);
    }
}

fn format_pull_event(event: ImagePullEvent) -> Option<String> {
    let status = event.status?;
    let prefix = event.id.map(|id| format!("{id}: ")).unwrap_or_default();
    let progress = event.progress.filter(|value| !value.trim().is_empty());
    Some(match progress {
        Some(progress) => format!("{prefix}{status} {progress}\n"),
        None => format!("{prefix}{status}\n"),
    })
}

pub fn start_image_pull(
    server_id: String,
    image: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let pull_id = generate_id();
    let (stop_tx, stop_rx) = watch::channel(false);
    info!(target: "shipyardx_lib::services::images", "starting image pull; pull_id={} server_id={} image={}", pull_id, server_id, image);

    let pid = pull_id.clone();
    let img = image.clone();
    let ah = app_handle.clone();
    spawn_on_runtime(async move {
        run_pull_task(server, pid, img, stop_rx, ah).await;
    })?;

    state
        .streams
        .lock()
        .map_err(|e| AppError::internal("image.pull_streams_lock_failed", "记录镜像拉取状态失败").with_detail(e.to_string()))?
        .insert(pull_id.clone(), StreamHandle { stop_tx });
    Ok(pull_id)
}

pub fn cancel_stream(stream_id: String, state: State<AppState>) -> AppResult<()> {
    if let Some(h) = lock_mutex(&state.streams, "image.pull_streams_lock_failed", "取消镜像拉取失败")?.remove(&stream_id) {
        info!(target: "shipyardx_lib::services::images", "cancelling image pull; pull_id={}", stream_id);
        let _ = h.stop_tx.send(true);
    } else {
        warn!(target: "shipyardx_lib::services::images", "cancel requested for missing image pull; pull_id={}", stream_id);
    }
    Ok(())
}
