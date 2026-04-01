use tauri::State;

use crate::models::app::docker::DockerVolume;
use crate::services;
use crate::core::state::AppState;

#[tauri::command]
pub async fn list_volumes(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerVolume>, String> {
    services::volumes::list_volumes(server_id, state).await
}

#[tauri::command]
pub async fn remove_volume(server_id: String, name: String, state: State<'_, AppState>) -> Result<(), String> {
    services::volumes::remove_volume(server_id, name, state).await
}

#[tauri::command]
pub async fn create_volume(
    server_id: String,
    name: String,
    driver: Option<String>,
    driver_opts: Option<std::collections::HashMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::volumes::create_volume(server_id, name, driver, driver_opts, state).await
}
