use tauri::State;

use crate::models::app::network::{Network, NetworkCreate};
use crate::services;
use crate::state::AppState;

#[tauri::command]
pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> Result<Vec<Network>, String> {
    services::networks::list_networks(server_id, state).await
}

#[tauri::command]
pub async fn inspect_network(
    server_id: String,
    network_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    services::networks::inspect_network(server_id, network_id, state).await
}

#[tauri::command]
pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> Result<(), String> {
    services::networks::remove_network(server_id, network_id, state).await
}

#[tauri::command]
pub async fn create_network(
    server_id: String,
    params: NetworkCreate,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::networks::create_network(server_id, params, state).await
}
