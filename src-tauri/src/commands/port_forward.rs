use tauri::{AppHandle, State};

use crate::dto::port_forward::{LocalAddress, PortForward, PortForwardCreate};
use crate::error::AppResult;
use crate::services::port_forward;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_local_addresses() -> AppResult<Vec<LocalAddress>> {
    port_forward::list_local_addresses().await
}

#[tauri::command]
#[specta::specta]
pub async fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    port_forward::list_port_forwards(server_id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_port_forward_rule(
    server_id: String,
    params: PortForwardCreate,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<PortForward> {
    port_forward::create_port_forward_rule(server_id, params, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_port_forward_enabled(
    id: String,
    enabled: bool,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    port_forward::set_port_forward_enabled(id, enabled, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_port_forwards_enabled(
    ids: Vec<String>,
    enabled: bool,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    port_forward::set_port_forwards_enabled(ids, enabled, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    port_forward::delete_port_forward(id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_all_enabled(server_id: String, app_handle: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    port_forward::start_all_enabled(server_id, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_port_forward(id: String, app_handle: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    port_forward::start_port_forward(id, app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    port_forward::stop_port_forward(id, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_port_forwards_all(state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    port_forward::list_all_port_forwards(state).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_all_enabled_global(app_handle: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    port_forward::start_all_enabled_global(app_handle, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_all_global(state: State<'_, AppState>) -> AppResult<()> {
    port_forward::stop_all_global(state).await
}
