use tauri::State;

use crate::dto::server::ServerConfig;
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_servers(state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    Ok(services::servers::get_servers(state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn add_server(server: ServerConfig, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    Ok(services::servers::add_server(server, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn update_server(server: ServerConfig, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    Ok(services::servers::update_server(server, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_server(id: String, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    Ok(services::servers::delete_server(id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection(server_id: String, state: State<'_, AppState>) -> AppResult<String> {
    Ok(services::servers::test_connection(server_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection_direct(server: ServerConfig) -> AppResult<String> {
    Ok(services::servers::test_connection_direct(server).await?)
}
