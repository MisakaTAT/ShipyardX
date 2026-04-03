use tauri::State;

use crate::models::app::port_forward::{LocalAddress, PortForward, PortForwardCreate};
use crate::services::port_forward;
use crate::state::AppState;

#[tauri::command]
pub fn list_local_addresses() -> Result<Vec<LocalAddress>, String> {
    port_forward::list_local_addresses()
}

#[tauri::command]
pub fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> Result<Vec<PortForward>, String> {
    port_forward::list_port_forwards(server_id, state)
}

#[tauri::command]
pub fn create_port_forward_rule(
    server_id: String,
    params: PortForwardCreate,
    state: State<'_, AppState>,
) -> Result<PortForward, String> {
    port_forward::create_port_forward_rule(server_id, params, state)
}

#[tauri::command]
pub fn set_port_forward_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    port_forward::set_port_forward_enabled(id, enabled, state)
}

#[tauri::command]
pub fn delete_port_forward(id: String, state: State<'_, AppState>) -> Result<(), String> {
    port_forward::delete_port_forward(id, state)
}

#[tauri::command]
pub fn start_all_enabled(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    port_forward::start_all_enabled(server_id, state)
}

#[tauri::command]
pub fn stop_port_forward(id: String, state: State<'_, AppState>) -> Result<(), String> {
    port_forward::stop_port_forward(id, state)
}

#[tauri::command]
pub fn list_port_forwards_all(state: State<'_, AppState>) -> Result<Vec<PortForward>, String> {
    port_forward::list_all_port_forwards(state)
}

#[tauri::command]
pub fn start_all_enabled_global(state: State<'_, AppState>) -> Result<(), String> {
    port_forward::start_all_enabled_global(state)
}

#[tauri::command]
pub fn stop_all_global(state: State<'_, AppState>) -> Result<(), String> {
    port_forward::stop_all_global(state)
}
