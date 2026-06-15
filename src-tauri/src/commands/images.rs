use tauri::{AppHandle, State};

use crate::dto::cleanup::CleanupResult;
use crate::dto::image::{Image, ImageLayer};
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_images(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Image>> {
    services::images::list_images(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn inspect_image(server_id: String, image_id: String, state: State<'_, AppState>) -> AppResult<String> {
    services::images::inspect_image(server_id, image_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_image_history(
    server_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<ImageLayer>> {
    services::images::get_image_history(server_id, image_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    services::images::remove_image(server_id, image_id, force, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn prune_dangling_images(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    services::images::prune_dangling_images(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn prune_unused_images(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    services::images::prune_unused_images(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn prune_builder_cache(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    services::images::prune_builder_cache(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_image(
    export_id: String,
    server_id: String,
    image_id: String,
    directory: String,
    file_name: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    services::images::export_image(export_id, server_id, image_id, directory, file_name, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn import_image(
    import_id: String,
    server_id: String,
    file_path: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    services::images::import_image(import_id, server_id, file_path, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_image_pull(
    server_id: String,
    image: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    services::images::start_image_pull(server_id, image, state, app_handle).await
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_stream(stream_id: String, state: State<'_, AppState>) -> AppResult<()> {
    services::images::cancel_stream(stream_id, state).await
}
