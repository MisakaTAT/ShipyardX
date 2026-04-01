use tauri::{AppHandle, State};

use crate::services;
use crate::state::AppState;

#[tauri::command]
pub fn start_event_stream(server_id: String, state: State<AppState>, app_handle: AppHandle) -> Result<String, String> {
    services::docker_events::start_event_stream(server_id, state, app_handle)
}

#[tauri::command]
pub fn stop_event_stream(server_id: String, state: State<AppState>) {
    services::docker_events::stop_event_stream(server_id, state)
}
