use tauri::State;

use crate::contracts::frontend::port_forward::{LocalAddress, PortForward, PortForwardCreate};
use crate::error::AppResult;
use crate::services::port_forward;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn list_local_addresses() -> AppResult<Vec<LocalAddress>> {
    Ok(port_forward::list_local_addresses()?)
}

#[tauri::command]
#[specta::specta]
pub fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    Ok(port_forward::list_port_forwards(server_id, state)?)
}

#[tauri::command]
#[specta::specta]
pub fn create_port_forward_rule(
    server_id: String,
    params: PortForwardCreate,
    state: State<'_, AppState>,
) -> AppResult<PortForward> {
    Ok(port_forward::create_port_forward_rule(server_id, params, state)?)
}

#[tauri::command]
#[specta::specta]
pub fn set_port_forward_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    Ok(port_forward::set_port_forward_enabled(id, enabled, state)?)
}

#[tauri::command]
#[specta::specta]
pub fn delete_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    Ok(port_forward::delete_port_forward(id, state)?)
}

#[tauri::command]
#[specta::specta]
pub fn start_all_enabled(server_id: String, state: State<'_, AppState>) -> AppResult<()> {
    Ok(port_forward::start_all_enabled(server_id, state)?)
}

#[tauri::command]
#[specta::specta]
pub fn stop_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    Ok(port_forward::stop_port_forward(id, state)?)
}

#[tauri::command]
#[specta::specta]
pub fn list_port_forwards_all(state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    Ok(port_forward::list_all_port_forwards(state)?)
}

#[tauri::command]
#[specta::specta]
pub fn start_all_enabled_global(state: State<'_, AppState>) -> AppResult<()> {
    Ok(port_forward::start_all_enabled_global(state)?)
}

#[tauri::command]
#[specta::specta]
pub fn stop_all_global(state: State<'_, AppState>) -> AppResult<()> {
    Ok(port_forward::stop_all_global(state)?)
}
