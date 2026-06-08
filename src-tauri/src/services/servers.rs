use tauri::State;

use crate::config::store::save_servers;
use crate::contracts::docker_api::common::DockerVersion;
use crate::contracts::frontend::server::ServerConfig;
use crate::docker::client::docker_get_async;
use crate::docker::transport::invalidate_pooled_http_server_id;
use crate::error::AppResult;
use crate::ssh::{client::block_on, pool};
use crate::state::{AppState, get_server_config, lock_mutex};
use crate::utils::id::generate_id;

pub fn get_servers(state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    Ok(lock_mutex(&state.servers, "servers.list_lock_failed", "读取服务器列表失败")?.clone())
}

pub fn add_server(mut server: ServerConfig, state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    server.id = generate_id();
    let mut servers = lock_mutex(&state.servers, "servers.add_lock_failed", "写入服务器列表失败")?;
    let data_file = lock_mutex(&state.data_file, "servers.data_file_lock_failed", "读取服务器配置路径失败")?;
    servers.push(server);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

pub fn update_server(server: ServerConfig, state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    let server_id = server.id.clone();
    let updated = {
        let mut servers = lock_mutex(&state.servers, "servers.update_lock_failed", "写入服务器列表失败")?;
        let data_file = lock_mutex(&state.data_file, "servers.data_file_lock_failed", "读取服务器配置路径失败")?;
        if let Some(existing) = servers.iter_mut().find(|s| s.id == server.id) {
            *existing = server;
        }
        save_servers(&data_file, &servers)?;
        servers.clone()
    };
    block_on(invalidate_pooled_http_server_id(&server_id))?;
    block_on(pool::invalidate_server_id(&server_id))?;
    Ok(updated)
}

pub fn delete_server(id: String, state: State<AppState>) -> AppResult<Vec<ServerConfig>> {
    let updated = {
        let mut servers = lock_mutex(&state.servers, "servers.delete_lock_failed", "写入服务器列表失败")?;
        let data_file = lock_mutex(&state.data_file, "servers.data_file_lock_failed", "读取服务器配置路径失败")?;
        servers.retain(|s| s.id != id);
        save_servers(&data_file, &servers)?;
        servers.clone()
    };
    block_on(invalidate_pooled_http_server_id(&id))?;
    block_on(pool::invalidate_server_id(&id))?;
    Ok(updated)
}

pub async fn test_connection(server_id: String, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    test_connection_with_config(server).await
}

pub async fn test_connection_direct(server: ServerConfig) -> AppResult<String> {
    test_connection_with_config(server).await
}

async fn test_connection_with_config(server: ServerConfig) -> AppResult<String> {
    let version = docker_get_async(&server, "/version").await?;
    let version: DockerVersion = serde_json::from_str(version.trim())?;
    let display = if version.version.trim().is_empty() {
        version.api_version
    } else {
        version.version
    };
    Ok(format!("连接成功！Docker {}", display.trim()))
}
