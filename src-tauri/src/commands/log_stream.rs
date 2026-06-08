use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::services;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<AppState>,
    app_handle: AppHandle,
) -> AppResult<String> {
    Ok(services::log_stream::start_log_stream(
        server_id,
        container_id,
        tail,
        timestamps,
        state,
        app_handle,
    )?)
}

#[tauri::command]
#[specta::specta]
pub fn stop_log_stream(stream_id: String, state: State<AppState>) -> AppResult<()> {
    Ok(services::log_stream::stop_log_stream(stream_id, state)?)
}
