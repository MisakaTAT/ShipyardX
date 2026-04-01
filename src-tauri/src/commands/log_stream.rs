use tauri::{AppHandle, State};

use crate::services;
use crate::core::state::AppState;

#[tauri::command]
pub fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    services::log_stream::start_log_stream(server_id, container_id, tail, timestamps, state, app_handle)
}

#[tauri::command]
pub fn stop_log_stream(stream_id: String, state: State<AppState>) {
    services::log_stream::stop_log_stream(stream_id, state)
}
