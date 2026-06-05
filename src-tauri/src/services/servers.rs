use tauri::State;

use crate::config::store::save_servers;
use crate::error::{AppError, AppResult};
use crate::models::app::server::ServerConfig;
use crate::ssh::exec::ssh_exec;
use crate::state::{AppState, get_server_config};
use crate::utils::id::generate_id;

pub fn get_servers(state: State<AppState>) -> Vec<ServerConfig> {
    state.servers.lock().unwrap().clone()
}

pub fn add_server(mut server: ServerConfig, state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    server.id = generate_id();
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    servers.push(server);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub fn update_server(server: ServerConfig, state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    if let Some(existing) = servers.iter_mut().find(|s| s.id == server.id) {
        *existing = server;
    }
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub fn delete_server(id: String, state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    servers.retain(|s| s.id != id);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub async fn test_connection(server_id: String, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    test_connection_with_config(server).await
}

pub async fn test_connection_direct(server: ServerConfig) -> AppResult<String> {
    test_connection_with_config(server).await
}

async fn test_connection_with_config(server: ServerConfig) -> AppResult<String> {
    tokio::task::spawn_blocking(move || {
        ssh_exec(&server, "docker version --format 'Server: {{.Server.Version}}'")
            .map(|v| format!("连接成功！Docker {}", v.trim()))
    })
    .await
    .map_err(|e| AppError::internal("task.join", "测试连接任务执行失败").with_source(e))?
}
