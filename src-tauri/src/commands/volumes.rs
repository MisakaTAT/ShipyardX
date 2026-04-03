use tauri::State;

use crate::models::app::volume::Volume;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_volumes(server_id: String, state: State<'_, AppState>) -> Result<Vec<Volume>, String> {
    services::volumes::list_volumes(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn inspect_volume(server_id: String, name: String, state: State<'_, AppState>) -> Result<String, String> {
    services::volumes::inspect_volume(server_id, name, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_volume(server_id: String, name: String, state: State<'_, AppState>) -> Result<(), String> {
    services::volumes::remove_volume(server_id, name, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_volume(
    server_id: String,
    name: String,
    driver: Option<String>,
    driver_opts: Option<std::collections::HashMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::volumes::create_volume(server_id, name, driver, driver_opts, state).await
}
