use tauri::State;

use crate::models::app::container::{Container, RunContainer};
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> Result<Vec<Container>, String> {
    services::containers::list_containers(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::containers::start_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> Result<(), String> {
    services::containers::stop_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn restart_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::containers::restart_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::containers::remove_container(server_id, container_id, force, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn inspect_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    services::containers::inspect_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_container(
    server_id: String,
    params: RunContainer,
    state: State<'_, AppState>,
) -> Result<String, String> {
    services::containers::run_container(server_id, params, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    services::containers::get_container_logs(server_id, container_id, tail, timestamps, state).await
}
