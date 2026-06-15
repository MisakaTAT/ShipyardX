use tauri::{AppHandle, Manager, State};

use crate::dto::container::ContainerStats;
use crate::dto::daemon::{DaemonSettings, DaemonUpdate};
use crate::dto::info::DockerEngineInfo;
use crate::error::{AppError, AppResult};
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_system_fonts() -> AppResult<Vec<String>> {
    services::system::list_system_fonts().await
}

#[tauri::command]
#[specta::specta]
pub async fn check_docker_access(server_id: String, state: State<'_, AppState>) -> AppResult<DockerEngineInfo> {
    Ok(services::system::check_docker_access(server_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_docker_info(server_id: String, state: State<'_, AppState>) -> AppResult<DockerEngineInfo> {
    Ok(services::system::get_docker_info(server_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_container_stats(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> AppResult<ContainerStats> {
    Ok(services::system::get_container_stats(server_id, container_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_docker_daemon_settings(server_id: String, state: State<'_, AppState>) -> AppResult<DaemonSettings> {
    Ok(services::system::get_docker_daemon_settings(server_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn update_docker_daemon_settings(
    server_id: String,
    params: DaemonUpdate,
    state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(services::system::update_docker_daemon_settings(server_id, params, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn restart_docker_daemon(
    server_id: String,
    sudo_password: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    Ok(services::system::restart_docker_daemon(server_id, sudo_password, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn open_devtools(app: AppHandle) -> AppResult<()> {
    let webview = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::not_found("app.main_window_missing", "未找到主窗口"))?;

    webview.open_devtools();
    Ok(())
}
