use tauri::State;

use crate::core::services;
use crate::core::models::{ContainerStats, DockerInfo};
use crate::core::state::AppState;

#[tauri::command]
pub async fn get_docker_info(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<DockerInfo, String> {
    services::system::get_docker_info(server_id, state).await
}

#[tauri::command]
pub async fn get_container_stats(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<ContainerStats, String> {
    services::system::get_container_stats(server_id, container_id, state).await
}
