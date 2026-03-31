use tauri::State;

use crate::models::server::ServerConfig;
use crate::services;
use crate::core::state::AppState;

#[tauri::command]
pub fn get_servers(state: State<AppState>) -> Vec<ServerConfig> {
    services::servers::get_servers(state)
}

#[tauri::command]
pub fn add_server(server: ServerConfig, state: State<AppState>) -> Result<Vec<ServerConfig>, String> {
    services::servers::add_server(server, state)
}

#[tauri::command]
pub fn update_server(server: ServerConfig, state: State<AppState>) -> Result<Vec<ServerConfig>, String> {
    services::servers::update_server(server, state)
}

#[tauri::command]
pub fn delete_server(id: String, state: State<AppState>) -> Result<Vec<ServerConfig>, String> {
    services::servers::delete_server(id, state)
}

#[tauri::command]
pub async fn test_connection(server_id: String, state: State<'_, AppState>) -> Result<String, String> {
    services::servers::test_connection(server_id, state).await
}

#[tauri::command]
pub async fn test_connection_direct(server: ServerConfig) -> Result<String, String> {
    services::servers::test_connection_direct(server).await
}
