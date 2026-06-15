use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    services::log_stream::start_log_stream(server_id, container_id, tail, timestamps, state, app_handle).await
}

#[tauri::command]
#[specta::specta]
pub async fn stop_log_stream(stream_id: String, state: State<'_, AppState>) -> AppResult<()> {
    services::log_stream::stop_log_stream(stream_id, state).await
}
