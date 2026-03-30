use tauri::State;

use crate::config::store::save_servers;
use crate::core::models::ServerConfig;
use crate::core::ssh::ssh_exec;
use crate::core::state::{get_server_config, AppState};
use crate::utils::id::generate_id;

const KEYRING_SERVICE: &str = "ShipyardX";

fn try_delete_password(id: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, id) {
        let _ = entry.delete_credential();
    }
}

pub fn get_servers(state: State<AppState>) -> Vec<ServerConfig> {
    state.servers.lock().unwrap().clone()
}

pub fn add_server(
    mut server: ServerConfig,
    state: State<AppState>,
) -> Result<Vec<ServerConfig>, String> {
    server.id = generate_id();
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    servers.push(server);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub fn update_server(
    server: ServerConfig,
    state: State<AppState>,
) -> Result<Vec<ServerConfig>, String> {
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    if let Some(existing) = servers.iter_mut().find(|s| s.id == server.id) {
        *existing = server;
    }
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub fn delete_server(id: String, state: State<AppState>) -> Result<Vec<ServerConfig>, String> {
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    servers.retain(|s| s.id != id);
    try_delete_password(&id);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub async fn test_connection(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        ssh_exec(
            &server,
            "docker version --format 'Server: {{.Server.Version}}'",
        )
        .map(|v| format!("连接成功！Docker {}", v.trim()))
    })
    .await
    .map_err(|e| e.to_string())?
}
