use tauri::State;

use crate::contracts::frontend::network::{Network, NetworkCreate};
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_networks(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Network>> {
    Ok(services::networks::list_networks(server_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn inspect_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<String> {
    Ok(services::networks::inspect_network(server_id, network_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_network(server_id: String, network_id: String, state: State<'_, AppState>) -> AppResult<()> {
    Ok(services::networks::remove_network(server_id, network_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn create_network(server_id: String, params: NetworkCreate, state: State<'_, AppState>) -> AppResult<()> {
    Ok(services::networks::create_network(server_id, params, state).await?)
}
