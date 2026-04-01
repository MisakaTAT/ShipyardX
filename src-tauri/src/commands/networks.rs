use tauri::State;

use crate::models::app::docker::DockerNetwork;
use crate::models::app::network::NetworkCreate;
use crate::services;
use crate::state::AppState;

#[tauri::command]
pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerNetwork>, String> {
    services::networks::list_networks(server_id, state).await
}

#[tauri::command]
pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> Result<(), String> {
    services::networks::remove_network(server_id, network_id, state).await
}

#[tauri::command]
pub async fn create_network(req: NetworkCreate, state: State<'_, AppState>) -> Result<(), String> {
    services::networks::create_network(req, state).await
}
