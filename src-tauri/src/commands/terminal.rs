use tauri::{AppHandle, State};

use crate::dto::terminal::{ContainerExecTerminalParams, TerminalSession};
use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<TerminalSession> {
    Ok(services::terminal::open_terminal(server_id, cols, rows, state, app_handle).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn open_container_exec_terminal(
    server_id: String,
    params: ContainerExecTerminalParams,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<TerminalSession> {
    Ok(services::terminal::open_container_exec_terminal(server_id, params, state, app_handle).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn close_terminal(session_id: String, state: State<'_, AppState>) -> AppResult<()> {
    Ok(services::terminal::close_terminal(session_id, state).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn save_terminal_export(path: String, content: String) -> AppResult<()> {
    Ok(services::terminal::save_terminal_export(path, content).await?)
}
