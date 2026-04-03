use tauri::{AppHandle, State};

use crate::models::app::image::Image;
use crate::services;
use crate::state::AppState;

#[tauri::command]
pub async fn list_images(server_id: String, state: State<'_, AppState>) -> Result<Vec<Image>, String> {
    services::images::list_images(server_id, state).await
}

#[tauri::command]
pub async fn inspect_image(server_id: String, image_id: String, state: State<'_, AppState>) -> Result<String, String> {
    services::images::inspect_image(server_id, image_id, state).await
}

#[tauri::command]
pub async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::images::remove_image(server_id, image_id, force, state).await
}

#[tauri::command]
pub fn start_image_pull(
    server_id: String,
    image: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    services::images::start_image_pull(server_id, image, state, app_handle)
}

#[tauri::command]
pub fn cancel_stream(stream_id: String, state: State<AppState>) {
    services::images::cancel_stream(stream_id, state)
}
