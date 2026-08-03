use tauri::State;

use crate::dto::server::{HostKeyPrompt, KnownHostEntry, ServerConfig};
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_servers(state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    services::servers::get_servers(state).await
}

#[tauri::command]
#[specta::specta]
pub async fn add_server(server: ServerConfig, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    services::servers::add_server(server, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_server(server: ServerConfig, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    services::servers::update_server(server, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_server(id: String, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    services::servers::delete_server(id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_pending_host_key() -> AppResult<Option<HostKeyPrompt>> {
    services::servers::get_pending_host_key().await
}

#[tauri::command]
#[specta::specta]
pub async fn trust_host_key(host: String, port: u16, fingerprint: String) -> AppResult<()> {
    services::servers::trust_host_key(host, port, fingerprint).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_known_hosts() -> AppResult<Vec<KnownHostEntry>> {
    services::servers::list_known_hosts().await
}

#[tauri::command]
#[specta::specta]
pub async fn forget_host_key(host: String, port: u16) -> AppResult<bool> {
    services::servers::forget_host_key(host, port).await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_known_hosts() -> AppResult<u32> {
    services::servers::clear_known_hosts().await
}

#[tauri::command]
#[specta::specta]
pub async fn probe_host_key(host: String, port: u16) -> AppResult<String> {
    services::servers::probe_host_key(host, port).await
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection(server_id: String, state: State<'_, AppState>) -> AppResult<String> {
    services::servers::test_connection(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn test_server_connection(server_id: String, state: State<'_, AppState>) -> AppResult<String> {
    services::servers::test_server_connection(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn test_connection_direct(server: ServerConfig) -> AppResult<String> {
    services::servers::test_connection_direct(server).await
}

#[tauri::command]
#[specta::specta]
pub async fn test_server_connection_direct(server: ServerConfig) -> AppResult<String> {
    services::servers::test_server_connection_direct(server).await
}
