use tauri::{AppHandle, State};

use crate::contracts::frontend::image::Image;
use crate::contracts::frontend::image::ImageLayer;
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_images(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Image>> {
    Ok(services::images::list_images(server_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn inspect_image(server_id: String, image_id: String, state: State<'_, AppState>) -> AppResult<String> {
    Ok(services::images::inspect_image(server_id, image_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_image_history(
    server_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<ImageLayer>> {
    Ok(services::images::get_image_history(server_id, image_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(services::images::remove_image(server_id, image_id, force, state).await?)
}

#[tauri::command]
#[specta::specta]
pub fn start_image_pull(
    server_id: String,
    image: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    Ok(services::images::start_image_pull(server_id, image, state, app_handle)?)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_stream(stream_id: String, state: State<AppState>) -> AppResult<()> {
    Ok(services::images::cancel_stream(stream_id, state)?)
}
