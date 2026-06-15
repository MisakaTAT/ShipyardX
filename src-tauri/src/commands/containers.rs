use tauri::State;

use crate::dto::cleanup::CleanupResult;
use crate::dto::container::{Container, RunContainer};
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Container>> {
    services::containers::list_containers(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    services::containers::start_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    services::containers::stop_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn restart_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    services::containers::restart_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    services::containers::remove_container(server_id, container_id, force, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn prune_stopped_containers(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    services::containers::prune_stopped_containers(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn inspect_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    services::containers::inspect_container(server_id, container_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_container(server_id: String, params: RunContainer, state: State<'_, AppState>) -> AppResult<String> {
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
) -> AppResult<String> {
    services::containers::get_container_logs(server_id, container_id, tail, timestamps, state).await
}
