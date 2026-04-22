use tauri::{AppHandle, State};

use crate::models::app::terminal::{ContainerExecTerminalParams, TerminalSession};
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<TerminalSession, String> {
    services::terminal::open_terminal(server_id, cols, rows, state, app_handle)
}

#[tauri::command]
#[specta::specta]
pub fn open_container_exec_terminal(
    server_id: String,
    params: ContainerExecTerminalParams,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<TerminalSession, String> {
    services::terminal::open_container_exec_terminal(server_id, params, state, app_handle)
}

#[tauri::command]
#[specta::specta]
pub fn close_terminal(session_id: String, state: State<AppState>) -> Result<(), String> {
    services::terminal::close_terminal(session_id, state)
}
