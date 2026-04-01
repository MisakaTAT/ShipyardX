use tauri::State;

use crate::models::app::docker::DockerContainer;
use crate::services;
use crate::core::state::AppState;

#[tauri::command(rename_all = "snake_case")]
pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerContainer>, String> {
    services::containers::list_containers(server_id, state).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn start_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::containers::start_container(server_id, container_id, state).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> Result<(), String> {
    services::containers::stop_container(server_id, container_id, state).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn restart_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::containers::restart_container(server_id, container_id, state).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::containers::remove_container(server_id, container_id, force, state).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    services::containers::get_container_logs(server_id, container_id, tail, timestamps, state).await
}
