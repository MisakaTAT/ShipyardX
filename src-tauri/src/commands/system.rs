use tauri::State;

use crate::models::app::system::{ContainerStats, DockerDaemonSettings, DockerDaemonUpdate, DockerInfo};
use crate::services;
use crate::core::state::AppState;

#[tauri::command]
pub async fn check_docker_access(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    services::system::check_docker_access(server_id, state).await
}

#[tauri::command]
pub async fn get_docker_info(server_id: String, state: State<'_, AppState>) -> Result<DockerInfo, String> {
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

#[tauri::command]
pub async fn get_docker_daemon_settings(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<DockerDaemonSettings, String> {
    services::system::get_docker_daemon_settings(server_id, state).await
}

#[tauri::command]
pub async fn update_docker_daemon_settings(
    req: DockerDaemonUpdate,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::system::update_docker_daemon_settings(req, state).await
}

#[tauri::command]
pub async fn restart_docker_daemon(
    server_id: String,
    sudo_password: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::system::restart_docker_daemon(server_id, sudo_password, state).await
}
