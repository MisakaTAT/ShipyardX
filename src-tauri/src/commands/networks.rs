use tauri::State;

use crate::core::models::DockerNetwork;
use crate::core::services;
use crate::core::state::AppState;

#[tauri::command]
pub async fn list_networks(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DockerNetwork>, String> {
    services::networks::list_networks(server_id, state).await
}

#[tauri::command]
pub async fn remove_network(
    server_id: String,
    network_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::networks::remove_network(server_id, network_id, state).await
}

