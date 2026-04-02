use tauri::{AppHandle, State};

use crate::models::app::terminal::TerminalSession;
use crate::services;
use crate::state::AppState;

#[tauri::command]
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
pub fn open_container_exec_terminal(
    server_id: String,
    container_id: String,
    user: Option<String>,
    shell: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<TerminalSession, String> {
    services::terminal::open_container_exec_terminal(
        server_id,
        container_id,
        user,
        shell,
        cols,
        rows,
        state,
        app_handle,
    )
}

#[tauri::command]
pub fn write_terminal(session_id: String, data: Vec<u8>, state: State<AppState>) -> Result<(), String> {
    services::terminal::write_terminal(session_id, data, state)
}

#[tauri::command]
pub fn resize_terminal(session_id: String, cols: u32, rows: u32, state: State<AppState>) -> Result<(), String> {
    services::terminal::resize_terminal(session_id, cols, rows, state)
}

#[tauri::command]
pub fn close_terminal(session_id: String, state: State<AppState>) -> Result<(), String> {
    services::terminal::close_terminal(session_id, state)
}
