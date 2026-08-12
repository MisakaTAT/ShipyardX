use std::path::PathBuf;

use log::warn;
use tauri::State;

use crate::config::store::save_servers;
use crate::docker::client::invalidate_api_version_server_id;
use crate::docker::transport::invalidate_pooled_http_server_id;
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::ssh::pool;
use crate::state::{AppState, lock_mutex, lock_read, lock_write};
use crate::utils::id::generate_id;

fn current_servers_and_data_file(state: &State<'_, AppState>) -> AppResult<(Vec<ServerConfig>, PathBuf)> {
    let data_file = lock_mutex(&state.data_file, "servers.data_file_lock_failed")?.clone();
    let servers = lock_read(&state.servers, "servers.list_lock_failed")?.clone();
    Ok((servers, data_file))
}

fn save_and_replace(
    state: &State<'_, AppState>,
    data_file: PathBuf,
    servers: Vec<ServerConfig>,
    code: &'static str,
) -> AppResult<Vec<ServerConfig>> {
    save_servers(&data_file, &servers)?;
    *lock_write(&state.servers, code)? = servers.clone();
    Ok(servers)
}

async fn invalidate_server(server_id: &str) -> AppResult<()> {
    invalidate_api_version_server_id(server_id);
    invalidate_pooled_http_server_id(server_id).await;
    pool::invalidate_server_id(server_id).await;
    Ok(())
}

pub(crate) fn list_servers(state: &State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    Ok(lock_read(&state.servers, "servers.list_lock_failed")?.clone())
}

pub(crate) fn add_server(state: &State<'_, AppState>, mut server: ServerConfig) -> AppResult<Vec<ServerConfig>> {
    let _store_guard = lock_mutex(&state.server_store, "servers.store_lock_failed")?;
    let (mut servers, data_file) = current_servers_and_data_file(state)?;
    server.id = generate_id();
    servers.push(server);
    save_and_replace(state, data_file, servers, "servers.add_lock_failed")
}

pub(crate) async fn update_server(state: &State<'_, AppState>, server: ServerConfig) -> AppResult<Vec<ServerConfig>> {
    let _store_guard = lock_mutex(&state.server_store, "servers.store_lock_failed")?;
    let server_id = server.id.clone();
    let (mut servers, data_file) = current_servers_and_data_file(state)?;
    let existing = servers
        .iter_mut()
        .find(|item| item.id == server_id)
        .ok_or_else(|| AppError::not_found("server.not_found"))?;
    *existing = server;
    let updated = save_and_replace(state, data_file, servers, "servers.update_lock_failed")?;
    drop(_store_guard);
    invalidate_server(&server_id).await?;
    Ok(updated)
}

pub(crate) async fn delete_server(state: &State<'_, AppState>, server_id: String) -> AppResult<Vec<ServerConfig>> {
    let _store_guard = lock_mutex(&state.server_store, "servers.store_lock_failed")?;
    let (servers, data_file) = current_servers_and_data_file(state)?;
    if !servers.iter().any(|server| server.id == server_id) {
        warn!(target: "shipyardx_lib::services::server_store", "delete requested for missing server; server_id={}", server_id);
        return Err(AppError::not_found("server.not_found"));
    }
    let updated_servers: Vec<ServerConfig> = servers.into_iter().filter(|server| server.id != server_id).collect();
    let updated = save_and_replace(state, data_file, updated_servers, "servers.delete_lock_failed")?;
    drop(_store_guard);
    invalidate_server(&server_id).await?;
    Ok(updated)
}
