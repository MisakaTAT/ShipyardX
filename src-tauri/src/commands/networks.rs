use tauri::State;

use crate::models::docker::DockerNetwork;
use crate::services;
use crate::core::state::AppState;

#[tauri::command]
pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> Result<Vec<DockerNetwork>, String> {
    services::networks::list_networks(server_id, state).await
}

#[tauri::command]
pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> Result<(), String> {
    services::networks::remove_network(server_id, network_id, state).await
}

#[tauri::command]
pub async fn create_network(
    server_id: String,
    name: String,
    driver: Option<String>,
    subnet: Option<String>,
    gateway: Option<String>,
    internal: bool,
    attachable: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    services::networks::create_network(server_id, name, driver, subnet, gateway, internal, attachable, state).await
}
