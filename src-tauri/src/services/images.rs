use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::task::{Context, Poll};

use bollard::models::{
    BuildPruneResponse, ContainerSummary, ImageHistoryResponseItem, ImageInspect, ImagePruneResponse, ImageSummary,
};
use bollard::query_parameters::{
    CreateImageOptionsBuilder, ImportImageOptionsBuilder, ListContainersOptionsBuilder, ListImagesOptions,
    PruneBuildOptionsBuilder, PruneImagesOptionsBuilder, RemoveImageOptionsBuilder,
};
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_specta::Event;
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncRead, AsyncWriteExt, ReadBuf};
use tokio::sync::watch;

use crate::docker::client::{docker, docker_streaming, map_bollard_error, pretty_json};
use crate::docker::mapping::api_image_to_dto;
use crate::dto::cleanup::CleanupResult;
use crate::dto::events::{DockerSshStreamChunk, DockerSshStreamDone, ImageExportProgress, ImageImportProgress};
use crate::dto::image::Image;
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::ssh::client::spawn_on_runtime;
use crate::state::{AppState, StreamHandle, get_server_config, lock_mutex};
use crate::utils::formatting::{format_bytes_i64, format_bytes_u64, format_unix_seconds};
use crate::utils::id::generate_id;
use crate::utils::output::TextOutputBuffer;
use crate::utils::sort::sort_by_created_desc_then_id;

const PULL_OUTPUT_CHUNK_BYTES: usize = 4 * 1024;
const PULL_OUTPUT_MAX_BYTES: usize = 256 * 1024;
const PULL_OUTPUT_TRUNCATION_NOTICE: &str = "\n[输出已截断，后续拉取日志已省略]\n";
const EXPORT_PROGRESS_EMIT_BYTES: u64 = 512 * 1024;

async fn resolve_image_size_hint(server: &ServerConfig, image_id: &str) -> AppResult<Option<u64>> {
    let api: Vec<ImageSummary> = docker(server)
        .await?
        .list_images(None::<ListImagesOptions>)
        .await
        .map_err(map_bollard_error)?;
    Ok(api
        .into_iter()
        .find(|img| img.id == image_id)
        .and_then(|img| u64::try_from(img.size).ok()))
}

pub async fn list_images(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Image>> {
    debug!(target: "shipyardx_lib::services::images", "listing images; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let docker = docker(&server).await?;
    let containers: Vec<ContainerSummary> = docker
        .list_containers(Some(ListContainersOptionsBuilder::default().all(true).build()))
        .await
        .map_err(map_bollard_error)?;

    let mut used_by: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for c in containers {
        let id = c.image_id.as_deref().unwrap_or_default().trim();
        if id.is_empty() {
            continue;
        }
        *used_by.entry(id.to_string()).or_insert(0) += 1;
    }

    let mut api: Vec<ImageSummary> = docker
        .list_images(None::<ListImagesOptions>)
        .await
        .map_err(map_bollard_error)?;
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
    let resp: ImageInspect = docker(&server)
        .await?
        .inspect_image(&image_id)
        .await
        .map_err(map_bollard_error)?;
    pretty_json(&resp)
}

pub async fn get_image_history(
    server_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::dto::image::ImageLayer>> {
    debug!(target: "shipyardx_lib::services::images", "fetching image history; server_id={} image_id={}", server_id, image_id);
    let server = get_server_config(&state, &server_id)?;
    let api: Vec<ImageHistoryResponseItem> = docker(&server)
        .await?
        .image_history(&image_id)
        .await
        .map_err(map_bollard_error)?;
    let layers: Vec<crate::dto::image::ImageLayer> = api
        .into_iter()
        .map(|l| crate::dto::image::ImageLayer {
            id: l.id,
            created_at: format_unix_seconds(l.created),
            size: format_bytes_i64(l.size),
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
    docker(&server)
        .await?
        .remove_image(
            &image_id,
            Some(RemoveImageOptionsBuilder::default().force(force).build()),
            None,
        )
        .await
        .map_err(map_bollard_error)
        .map(|_| ())
}

pub async fn prune_dangling_images(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    prune_images(server_id, true, state).await
}

pub async fn prune_unused_images(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    prune_images(server_id, false, state).await
}

pub async fn prune_builder_cache(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    info!(target: "shipyardx_lib::services::images", "pruning builder cache; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let response: BuildPruneResponse = docker(&server)
        .await?
        .prune_build(Some(PruneBuildOptionsBuilder::default().all(true).build()))
        .await
        .map_err(map_bollard_error)?;

    Ok(CleanupResult {
        deleted_count: response.caches_deleted.unwrap_or_default().len() as u32,
        reclaimed: format_bytes_u64(response.space_reclaimed.unwrap_or(0) as u64),
    })
}

pub async fn export_image(
    export_id: String,
    server_id: String,
    image_id: String,
    directory: String,
    file_name: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let directory = directory.trim();
    let file_name = file_name.trim();
    if directory.is_empty() {
        return Err(AppError::validation("image.export_dir_required", "请选择导出目录"));
    }
    if file_name.is_empty() {
        return Err(AppError::validation("image.export_name_required", "请输入导出文件名"));
    }
    if !is_valid_export_name(file_name) {
        return Err(AppError::validation(
            "image.export_name_invalid",
            "文件名包含非法字符，请重新命名",
        ));
    }

    let export_dir = PathBuf::from(directory);
    ensure_export_directory(&export_dir)?;

    let export_name = ensure_tar_extension(file_name);
    let export_path = export_dir.join(&export_name);
    info!(
        target: "shipyardx_lib::services::images",
        "exporting image; export_id={} server_id={} image_id={} path={}",
        export_id,
        server_id,
        image_id,
        export_path.display()
    );

    let server = get_server_config(&state, &server_id)?;
    let total_bytes = resolve_image_size_hint(&server, &image_id).await?;
    let mut created_export_file = false;
    let result = async {
        let docker = docker_streaming(&server).await?;
        let mut file = create_export_file(&export_path).await?;
        created_export_file = true;
        let mut stream = docker.export_image(&image_id);

        let mut transferred_bytes = 0_u64;
        let mut emitted_bytes = 0_u64;
        emit_export_progress(&app_handle, &export_id, &image_id, transferred_bytes, total_bytes);

        loop {
            match stream.next().await {
                Some(Ok(chunk)) => {
                    file.write_all(&chunk).await.map_err(|e| {
                        AppError::internal("image.export_write_failed", "写入镜像导出文件失败").with_source(e)
                    })?;
                    transferred_bytes = transferred_bytes.saturating_add(chunk.len() as u64);
                    if transferred_bytes.saturating_sub(emitted_bytes) >= EXPORT_PROGRESS_EMIT_BYTES {
                        emitted_bytes = transferred_bytes;
                        emit_export_progress(&app_handle, &export_id, &image_id, transferred_bytes, total_bytes);
                    }
                }
                Some(Err(error)) => return Err(map_bollard_error(error)),
                None => break,
            }
        }

        file.flush()
            .await
            .map_err(|e| AppError::internal("image.export_flush_failed", "保存镜像导出文件失败").with_source(e))?;
        emit_export_progress(&app_handle, &export_id, &image_id, transferred_bytes, total_bytes);
        Ok::<(), AppError>(())
    }
    .await;

    if let Err(error) = result {
        if created_export_file {
            let _ = tokio::fs::remove_file(&export_path).await;
        }
        return Err(error);
    }

    info!(
        target: "shipyardx_lib::services::images",
        "exported image; export_id={} server_id={} image_id={} path={}",
        export_id,
        server_id,
        image_id,
        export_path.display()
    );
    Ok(())
}

pub async fn import_image(
    import_id: String,
    server_id: String,
    file_path: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let file_path = file_path.trim();
    if file_path.is_empty() {
        return Err(AppError::validation("image.import_file_required", "请选择镜像文件"));
    }

    let import_path = PathBuf::from(file_path);
    let file_name = import_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| AppError::validation("image.import_name_invalid", "无法识别镜像文件名"))?;

    let total_bytes = ensure_import_file(&import_path).await?;
    let server = get_server_config(&state, &server_id)?;
    info!(
        target: "shipyardx_lib::services::images",
        "importing image; import_id={} server_id={} path={}",
        import_id,
        server_id,
        import_path.display()
    );

    let file = File::open(&import_path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => AppError::validation("image.import_file_missing", "所选镜像文件不存在"),
        ErrorKind::PermissionDenied => AppError::permission("image.import_file_denied", "没有权限读取所选镜像文件"),
        _ => AppError::internal("image.import_open_failed", "打开镜像文件失败").with_source(e),
    })?;

    emit_import_progress(&app_handle, &import_id, &file_name, 0, Some(total_bytes));
    let progress_app_handle = app_handle.clone();
    let progress_import_id = import_id.clone();
    let progress_file_name = file_name.clone();
    let progress_reader = ProgressReader::new(file, EXPORT_PROGRESS_EMIT_BYTES, move |transferred| {
        emit_import_progress(
            &progress_app_handle,
            &progress_import_id,
            &progress_file_name,
            transferred,
            Some(total_bytes),
        );
    });

    let docker = docker_streaming(&server).await?;
    let mut stream = docker.import_image_stream(
        ImportImageOptionsBuilder::default().quiet(true).build(),
        tokio_util::io::ReaderStream::new(progress_reader),
        None,
    );
    let mut output = String::new();
    while let Some(item) = stream.next().await {
        match item {
            Ok(item) => output.push_str(&format!("{item:?}\n")),
            Err(error) => return Err(map_bollard_error(error)),
        }
    }
    let output = output.trim();
    if !output.is_empty() {
        debug!(
            target: "shipyardx_lib::services::images",
            "image import output; import_id={} server_id={} output={}",
            import_id,
            server_id,
            output
        );
    }

    info!(
        target: "shipyardx_lib::services::images",
        "imported image; import_id={} server_id={} path={}",
        import_id,
        server_id,
        import_path.display()
    );
    Ok(())
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
        let docker = docker_streaming(&config).await.map_err(|e| {
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
        let mut stream = docker.create_image(
            Some(CreateImageOptionsBuilder::default().from_image(&image).build()),
            None,
            None,
        );

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
                        return Err(AppError::conflict("image.pull_cancelled", "镜像拉取已取消"));
                    }
                }
                item = stream.next() => {
                    match item {
                        Some(Ok(chunk)) => {
                            buffer.push_str(&format!("{}\n", serde_json::to_string(&chunk)?));
                            emit_pull_lines(&pull_id, &ah, &mut buffer, &mut output_buffer)?;
                        }
                        Some(Err(e)) => {
                            let e = map_bollard_error(e);
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
                        None => {
                            emit_pull_tail(&pull_id, &ah, &mut buffer, &mut output_buffer)?;
                            flush_pull_output(&pull_id, &ah, &mut output_buffer);
                            info!(target: "shipyardx_lib::services::images", "image pull stream completed; pull_id={} server_id={} image={}", pull_id, config.id, image);
                            return Ok(());
                        }
                    }
                }
            }
        }
    }
    .await;

    match &result {
        Ok(_) => {
            info!(target: "shipyardx_lib::services::images", "image pull succeeded; pull_id={} server_id={} image={}", done_stream_id, config.id, image)
        }
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

async fn prune_images(server_id: String, dangling_only: bool, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    let action = if dangling_only { "dangling" } else { "unused" };
    info!(target: "shipyardx_lib::services::images", "pruning images; server_id={} action={}", server_id, action);
    let server = get_server_config(&state, &server_id)?;
    let docker = docker(&server).await?;
    let filters = if dangling_only {
        std::collections::HashMap::from([(String::from("dangling"), vec![String::from("true")])])
    } else {
        std::collections::HashMap::from([(String::from("dangling"), vec![String::from("false")])])
    };
    let response: ImagePruneResponse = docker
        .prune_images(Some(PruneImagesOptionsBuilder::default().filters(&filters).build()))
        .await
        .map_err(map_bollard_error)?;

    Ok(CleanupResult {
        deleted_count: response
            .images_deleted
            .unwrap_or_default()
            .iter()
            .filter(|item| item.deleted.is_some() || item.untagged.is_some())
            .count() as u32,
        reclaimed: format_bytes_u64(response.space_reclaimed.unwrap_or(0) as u64),
    })
}

fn ensure_export_directory(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::validation("image.export_dir_missing", "所选目录不存在"));
    }
    if !path.is_dir() {
        return Err(AppError::validation("image.export_dir_invalid", "所选路径不是文件夹"));
    }
    Ok(())
}

async fn ensure_import_file(path: &Path) -> AppResult<u64> {
    let metadata = tokio::fs::metadata(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => AppError::validation("image.import_file_missing", "所选镜像文件不存在"),
        ErrorKind::PermissionDenied => AppError::permission("image.import_file_denied", "没有权限读取所选镜像文件"),
        _ => AppError::internal("image.import_stat_failed", "读取镜像文件信息失败").with_source(e),
    })?;
    if !metadata.is_file() {
        return Err(AppError::validation("image.import_file_invalid", "所选路径不是文件"));
    }
    Ok(metadata.len())
}

fn ensure_tar_extension(file_name: &str) -> String {
    if file_name.to_ascii_lowercase().ends_with(".tar") {
        file_name.to_string()
    } else {
        format!("{file_name}.tar")
    }
}

fn is_valid_export_name(file_name: &str) -> bool {
    if matches!(file_name, "." | "..") {
        return false;
    }

    !file_name.is_empty()
        && !file_name
            .bytes()
            .any(|b| b < 32 || matches!(b, b'<' | b'>' | b':' | b'"' | b'/' | b'\\' | b'|' | b'?' | b'*'))
}

async fn create_export_file(path: &Path) -> AppResult<tokio::fs::File> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await
        .map_err(|e| match e.kind() {
            ErrorKind::AlreadyExists => AppError::conflict("image.export_exists", "目标文件已存在，请更换名称"),
            ErrorKind::PermissionDenied => {
                AppError::permission("image.export_permission_denied", "没有权限写入所选目录")
            }
            _ => AppError::internal("image.export_open_failed", "创建镜像导出文件失败").with_source(e),
        })
}

fn emit_export_progress(
    app_handle: &AppHandle,
    export_id: &str,
    image_id: &str,
    transferred_bytes: u64,
    total_bytes: Option<u64>,
) {
    let _ = ImageExportProgress {
        export_id: export_id.to_string(),
        image_id: image_id.to_string(),
        transferred: format_bytes_u64(transferred_bytes),
        total: total_bytes.map(format_bytes_u64),
        percent: total_bytes.map(|total| {
            if total == 0 {
                0.0
            } else {
                ((transferred_bytes as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
            }
        }),
    }
    .emit(app_handle);
}

fn emit_import_progress(
    app_handle: &AppHandle,
    import_id: &str,
    file_name: &str,
    transferred_bytes: u64,
    total_bytes: Option<u64>,
) {
    let _ = ImageImportProgress {
        import_id: import_id.to_string(),
        file_name: file_name.to_string(),
        transferred: format_bytes_u64(transferred_bytes),
        total: total_bytes.map(format_bytes_u64),
        percent: total_bytes.map(|total| {
            if total == 0 {
                0.0
            } else {
                ((transferred_bytes as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
            }
        }),
    }
    .emit(app_handle);
}

struct ProgressReader<R, F> {
    inner: R,
    on_progress: F,
    transferred: u64,
    next_report_bytes: u64,
    report_every_bytes: u64,
    finished: bool,
}

impl<R, F> ProgressReader<R, F> {
    fn new(inner: R, report_every_bytes: u64, on_progress: F) -> Self {
        Self {
            inner,
            on_progress,
            transferred: 0,
            next_report_bytes: report_every_bytes,
            report_every_bytes,
            finished: false,
        }
    }
}

impl<R, F> AsyncRead for ProgressReader<R, F>
where
    R: AsyncRead + Unpin,
    F: FnMut(u64) + Unpin,
{
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let poll = Pin::new(&mut self.inner).poll_read(cx, buf);
        match poll {
            Poll::Ready(Ok(())) => {
                let filled = buf.filled().len();
                let read = filled.saturating_sub(before) as u64;
                if read == 0 {
                    if !self.finished {
                        self.finished = true;
                        let transferred = self.transferred;
                        let on_progress = &mut self.on_progress;
                        (on_progress)(transferred);
                    }
                    return Poll::Ready(Ok(()));
                }

                self.transferred = self.transferred.saturating_add(read);
                if self.transferred >= self.next_report_bytes {
                    self.next_report_bytes = self.transferred.saturating_add(self.report_every_bytes);
                    let transferred = self.transferred;
                    let on_progress = &mut self.on_progress;
                    (on_progress)(transferred);
                }
                Poll::Ready(Ok(()))
            }
            other => other,
        }
    }
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
        .map_err(|e| {
            AppError::internal("image.pull_streams_lock_failed", "记录镜像拉取状态失败").with_detail(e.to_string())
        })?
        .insert(pull_id.clone(), StreamHandle { stop_tx });
    Ok(pull_id)
}

pub fn cancel_stream(stream_id: String, state: State<AppState>) -> AppResult<()> {
    if let Some(h) =
        lock_mutex(&state.streams, "image.pull_streams_lock_failed", "取消镜像拉取失败")?.remove(&stream_id)
    {
        info!(target: "shipyardx_lib::services::images", "cancelling image pull; pull_id={}", stream_id);
        let _ = h.stop_tx.send(true);
    } else {
        warn!(target: "shipyardx_lib::services::images", "cancel requested for missing image pull; pull_id={}", stream_id);
    }
    Ok(())
}
