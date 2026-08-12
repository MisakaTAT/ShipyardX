use std::collections::BTreeMap;
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
use crate::dto::events::{
    ImageExportProgress, ImageImportProgress, ImagePullDone, ImagePullLayerProgress, ImagePullProgress,
};
use crate::dto::image::Image;
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::services::support::{ServerContext, start_managed_stream, stop_managed_stream};
use crate::state::AppState;
use crate::utils::formatting::{format_bytes_i64, format_bytes_u64, format_unix_seconds};
use crate::utils::id::generate_id;
use crate::utils::sort::sort_by_created_desc_then_id;

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
    let docker = ServerContext::from_state(&state, &server_id)?.docker().await?;
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
    let resp: ImageInspect = ServerContext::from_state(&state, &server_id)?
        .docker()
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
    let api: Vec<ImageHistoryResponseItem> = ServerContext::from_state(&state, &server_id)?
        .docker()
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
    ServerContext::from_state(&state, &server_id)?
        .docker()
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
    let response: BuildPruneResponse = ServerContext::from_state(&state, &server_id)?
        .docker()
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

    let export_dir = PathBuf::from(directory);
    ensure_export_directory(&export_dir)?;

    ensure_plain_file_name(file_name)?;
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

    let ctx = ServerContext::from_state(&state, &server_id)?;
    let total_bytes = resolve_image_size_hint(ctx.server(), &image_id).await?;
    let mut created_export_file = false;
    let result = async {
        let docker = ctx.streaming().await?;
        let mut file = create_export_file(&export_path).await?;
        created_export_file = true;
        let mut stream = docker.export_image(&image_id);

        let mut transferred_bytes = 0_u64;
        let mut emitted_bytes = 0_u64;
        emit_export_progress(&app_handle, &export_id, &image_id, transferred_bytes, total_bytes);

        loop {
            match stream.next().await {
                Some(Ok(chunk)) => {
                    file.write_all(&chunk)
                        .await
                        .map_err(|e| AppError::internal("image.export_write_failed").with_source(e))?;
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
            .map_err(|e| AppError::internal("image.export_flush_failed").with_source(e))?;
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

    let import_path = PathBuf::from(file_path);
    let file_name = import_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| String::from("image archive"));

    let total_bytes = ensure_import_file(&import_path).await?;
    let ctx = ServerContext::from_state(&state, &server_id)?;
    info!(
        target: "shipyardx_lib::services::images",
        "importing image; import_id={} server_id={} path={}",
        import_id,
        server_id,
        import_path.display()
    );

    let file = File::open(&import_path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => AppError::validation("image.import_file_missing"),
        ErrorKind::PermissionDenied => AppError::permission("image.import_file_denied"),
        _ => AppError::internal("image.import_open_failed").with_source(e),
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

    let docker = ctx.streaming().await?;
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
    let mut tracker = PullProgressTracker::new(image.clone());
    tracker.emit(&pull_id, &ah);
    let result = async {
        let docker = docker_streaming(&config).await.map_err(|e| {
            error!(
                target: "shipyardx_lib::services::images",
                "image pull stream open failed; pull_id={} server_id={} image={} code={} message={} detail={:?}",
                pull_id,
                config.id,
                image,
                e.code,
                e,
                e.detail
            );
            tracker.summary_status = "image_pull.docker_connect_failed".to_string();
            tracker.summary_detail = Some(e.to_string());
            tracker.emit(&pull_id, &ah);
            e
        })?;
        let image_ref = parse_pull_image_reference(&image);
        let mut options = CreateImageOptionsBuilder::default().from_image(&image_ref.repository);
        if let Some(tag) = image_ref.tag.as_deref() {
            options = options.tag(tag);
        }
        let mut stream = docker.create_image(Some(options.build()), None, None);

        loop {
            tokio::select! {
                changed = stop_rx.changed() => {
                    if changed.is_ok() && *stop_rx.borrow() {
                        tracker.summary_status = "image_pull.cancelled".to_string();
                        tracker.summary_detail = Some("image_pull.cancelled_detail".to_string());
                        tracker.emit(&pull_id, &ah);
                        warn!(target: "shipyardx_lib::services::images", "image pull cancelled; pull_id={} server_id={} image={}", pull_id, config.id, image);
                        return Err(AppError::conflict("image.pull_cancelled"));
                    }
                }
                item = stream.next() => {
                    match item {
                        Some(Ok(chunk)) => {
                            let event: ImagePullEvent = serde_json::from_value(serde_json::to_value(chunk)?)
                                .map_err(|e| AppError::internal("image.pull_event_parse_failed").with_source(e))?;
                            tracker.apply_event(event)?;
                            tracker.emit(&pull_id, &ah);
                        }
                        Some(Err(e)) => {
                            let e = map_bollard_error(e);
                            tracker.summary_status = "image_pull.failed".to_string();
                            tracker.summary_detail = Some(e.to_string());
                            tracker.emit(&pull_id, &ah);
                            error!(
                                target: "shipyardx_lib::services::images",
                                "image pull stream read failed; pull_id={} server_id={} image={} code={} message={} detail={:?}",
                                pull_id,
                                config.id,
                                image,
                                e.code,
                                e,
                                e.detail
                            );
                            return Err(e);
                        }
                        None => {
                            tracker.finish_success();
                            tracker.emit(&pull_id, &ah);
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
            error,
            error.detail
        ),
    }

    let final_status = match &result {
        Ok(_) => Some("image_pull.done".to_string()),
        Err(error) => Some(error.to_string()),
    };

    let _ = ImagePullDone {
        stream_id: done_stream_id,
        success: result.is_ok(),
        error: result.err(),
        final_status,
    }
    .emit(&done_handle);
}

#[derive(Deserialize)]
struct ImagePullEvent {
    status: Option<String>,
    progress: Option<String>,
    id: Option<String>,
    #[serde(rename = "progressDetail")]
    progress_detail: Option<ImagePullProgressDetail>,
    error: Option<String>,
    #[serde(rename = "errorDetail")]
    error_detail: Option<ImagePullErrorDetail>,
}

#[derive(Deserialize)]
struct ImagePullProgressDetail {
    current: Option<u64>,
    total: Option<u64>,
}

#[derive(Deserialize)]
struct ImagePullErrorDetail {
    message: Option<String>,
}

#[derive(Clone)]
struct PullLayerState {
    status: String,
    current: Option<u64>,
    total: Option<u64>,
}

struct PullProgressTracker {
    image: String,
    summary_status: String,
    summary_detail: Option<String>,
    layers: BTreeMap<String, PullLayerState>,
}

struct PullImageReference {
    repository: String,
    tag: Option<String>,
}

fn parse_pull_image_reference(input: &str) -> PullImageReference {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return PullImageReference {
            repository: String::new(),
            tag: None,
        };
    }

    if trimmed.contains('@') {
        return PullImageReference {
            repository: trimmed.to_string(),
            tag: None,
        };
    }

    let slash_pos = trimmed.rfind('/');
    let colon_pos = trimmed.rfind(':');
    let has_explicit_tag =
        matches!((slash_pos, colon_pos), (_, Some(colon)) if slash_pos.is_none_or(|slash| colon > slash));

    if has_explicit_tag {
        let colon = colon_pos.expect("checked above");
        return PullImageReference {
            repository: trimmed[..colon].to_string(),
            tag: Some(trimmed[colon + 1..].to_string()),
        };
    }

    PullImageReference {
        repository: trimmed.to_string(),
        tag: Some("latest".to_string()),
    }
}

impl PullProgressTracker {
    fn new(image: String) -> Self {
        Self {
            image,
            summary_status: "image_pull.preparing".to_string(),
            summary_detail: None,
            layers: BTreeMap::new(),
        }
    }

    fn apply_event(&mut self, event: ImagePullEvent) -> AppResult<()> {
        let error = event
            .error_detail
            .as_ref()
            .and_then(|detail| detail.message.as_deref())
            .or(event.error.as_deref())
            .filter(|message| !message.trim().is_empty())
            .map(str::to_string);
        if let Some(error) = error {
            return Err(AppError::unavailable("image.pull_failed").with_detail(error));
        }

        let status = event
            .status
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let progress_text = event
            .progress
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        if let Some(layer_id) = event
            .id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            let layer = self.layers.entry(layer_id).or_insert(PullLayerState {
                status: String::new(),
                current: None,
                total: None,
            });

            if let Some(next_status) = status.clone() {
                layer.status = next_status;
            }

            if let Some(detail) = event.progress_detail {
                layer.current = detail.current;
                layer.total = detail.total;
            }
        } else if let Some(next_status) = status.clone() {
            self.summary_status = next_status;
        }

        if let Some(detail) = progress_text {
            self.summary_detail = Some(detail);
        } else if let Some(next_status) = status {
            self.summary_detail = Some(next_status);
        }

        Ok(())
    }

    fn finish_success(&mut self) {
        self.summary_status = "image_pull.done".to_string();
        self.summary_detail = Some("image_pull.done_detail".to_string());
        for layer in self.layers.values_mut() {
            if !matches!(layer.status.as_str(), "Pull complete" | "Already exists") {
                layer.status = "Pull complete".to_string();
            }
        }
    }

    fn emit(&self, stream_id: &str, app: &AppHandle) {
        let layers: Vec<ImagePullLayerProgress> = self
            .layers
            .iter()
            .map(|(id, state)| ImagePullLayerProgress {
                id: id.clone(),
                status: state.status.clone(),
                current: state.current.map(format_bytes_u64),
                total: state.total.map(format_bytes_u64),
                percent: match (state.current, state.total) {
                    (_, Some(0)) => Some(0.0),
                    (Some(current), Some(total)) if total > 0 => {
                        Some(((current as f64 / total as f64) * 100.0).clamp(0.0, 100.0))
                    }
                    _ if matches!(
                        state.status.as_str(),
                        "Pull complete" | "Already exists" | "Download complete"
                    ) =>
                    {
                        Some(100.0)
                    }
                    _ => None,
                },
            })
            .collect();

        let completed_layers = layers
            .iter()
            .filter(|layer| matches!(layer.status.as_str(), "Pull complete" | "Already exists"))
            .count() as u32;
        let total_layers = layers.len() as u32;

        let _ = ImagePullProgress {
            stream_id: stream_id.to_string(),
            image: self.image.clone(),
            status: self.summary_status.clone(),
            detail: self.summary_detail.clone(),
            layers,
            completed_layers,
            total_layers,
        }
        .emit(app);
    }
}

async fn prune_images(server_id: String, dangling_only: bool, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    let action = if dangling_only { "dangling" } else { "unused" };
    info!(target: "shipyardx_lib::services::images", "pruning images; server_id={} action={}", server_id, action);
    let docker = ServerContext::from_state(&state, &server_id)?.docker().await?;
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
        return Err(AppError::validation("image.export_dir_missing"));
    }
    if !path.is_dir() {
        return Err(AppError::validation("image.export_dir_invalid"));
    }
    Ok(())
}

async fn ensure_import_file(path: &Path) -> AppResult<u64> {
    let metadata = tokio::fs::metadata(path).await.map_err(|e| match e.kind() {
        ErrorKind::NotFound => AppError::validation("image.import_file_missing"),
        ErrorKind::PermissionDenied => AppError::permission("image.import_file_denied"),
        _ => AppError::internal("image.import_stat_failed").with_source(e),
    })?;
    if !metadata.is_file() {
        return Err(AppError::validation("image.import_file_invalid"));
    }
    Ok(metadata.len())
}

/// 文件名是表单里的自由文本，必须挡住路径分隔符和 `..`，否则能写到所选目录之外。
fn ensure_plain_file_name(file_name: &str) -> AppResult<()> {
    let invalid = file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains('\0');
    if invalid {
        return Err(AppError::validation("image.export_file_name_invalid"));
    }
    Ok(())
}

fn ensure_tar_extension(file_name: &str) -> String {
    if file_name.to_ascii_lowercase().ends_with(".tar") {
        file_name.to_string()
    } else {
        format!("{file_name}.tar")
    }
}

async fn create_export_file(path: &Path) -> AppResult<tokio::fs::File> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await
        .map_err(|e| match e.kind() {
            ErrorKind::AlreadyExists => AppError::conflict("image.export_exists"),
            ErrorKind::PermissionDenied => AppError::permission("image.export_permission_denied"),
            _ => AppError::internal("image.export_open_failed").with_source(e),
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

pub async fn start_image_pull(
    server_id: String,
    image: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    let server = ServerContext::from_state(&state, &server_id)?.server().clone();
    let pull_id = generate_id();
    let (stop_tx, stop_rx) = watch::channel(false);
    info!(target: "shipyardx_lib::services::images", "starting image pull; pull_id={} server_id={} image={}", pull_id, server_id, image);

    let pid = pull_id.clone();
    let img = image.clone();
    let ah = app_handle.clone();
    start_managed_stream(
        &state,
        pull_id,
        stop_tx,
        async move {
            run_pull_task(server, pid, img, stop_rx, ah).await;
        },
        "image.pull_streams_lock_failed",
    )
}

pub async fn cancel_stream(stream_id: String, state: State<'_, AppState>) -> AppResult<()> {
    if stop_managed_stream(&state, &stream_id, "image.pull_streams_lock_failed")? {
        info!(target: "shipyardx_lib::services::images", "cancelling image pull; pull_id={}", stream_id);
    } else {
        warn!(target: "shipyardx_lib::services::images", "cancel requested for missing image pull; pull_id={}", stream_id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_file_names_that_escape_the_directory() {
        assert!(ensure_plain_file_name("../evil").is_err());
        assert!(ensure_plain_file_name("a/b").is_err());
        assert!(ensure_plain_file_name("a\\b").is_err());
        assert!(ensure_plain_file_name("").is_err());
        assert!(ensure_plain_file_name("..").is_err());
    }

    #[test]
    fn accepts_plain_file_names() {
        assert!(ensure_plain_file_name("nginx.tar").is_ok());
        assert!(ensure_plain_file_name("my image 1").is_ok());
        assert_eq!(ensure_tar_extension("nginx"), "nginx.tar");
        assert_eq!(ensure_tar_extension("nginx.tar"), "nginx.tar");
    }
}
