use tauri::{AppHandle, State};

use crate::services;
use crate::core::state::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn start_event_stream(
    server_id: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    services::docker_events::start_event_stream(server_id, state, app_handle)
}

#[tauri::command(rename_all = "snake_case")]
pub fn stop_event_stream(server_id: String, state: State<AppState>) {
    services::docker_events::stop_event_stream(server_id, state)
}
