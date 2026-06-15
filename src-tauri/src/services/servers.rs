use tauri::State;

use bollard::models::SystemVersion;
use log::info;

use crate::docker::client::map_bollard_error;
use crate::dto::server::ServerConfig;
use crate::error::AppResult;
use crate::services::{server_store, support::ServerContext};
use crate::state::AppState;

pub async fn get_servers(state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    let servers = server_store::list_servers(&state)?;
    info!(target: "shipyardx_lib::services::servers", "listed servers; count={}", servers.len());
    Ok(servers)
}

pub async fn add_server(server: ServerConfig, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    let servers = server_store::add_server(&state, server)?;
    info!(target: "shipyardx_lib::services::servers", "server added; count={}", servers.len());
    Ok(servers)
}

pub async fn update_server(server: ServerConfig, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    let server_id = server.id.clone();
    let updated = server_store::update_server(&state, server).await?;
    info!(target: "shipyardx_lib::services::servers", "server updated; server_id={}", server_id);
    Ok(updated)
}

pub async fn delete_server(id: String, state: State<'_, AppState>) -> AppResult<Vec<ServerConfig>> {
    let updated = server_store::delete_server(&state, id.clone()).await?;
    info!(target: "shipyardx_lib::services::servers", "server deleted; server_id={}", id);
    Ok(updated)
}

pub async fn test_connection(server_id: String, state: State<'_, AppState>) -> AppResult<String> {
    let ctx = ServerContext::from_state(&state, &server_id)?;
    test_connection_with_context(ctx).await
}

pub async fn test_connection_direct(server: ServerConfig) -> AppResult<String> {
    test_connection_with_context(ServerContext::from_server(server)).await
}

async fn test_connection_with_context(ctx: ServerContext) -> AppResult<String> {
    info!(target: "shipyardx_lib::services::servers", "testing server connection; server_id={} host={} port={}", ctx.server().id, ctx.server().host, ctx.server().port);
    let version: SystemVersion = ctx.docker().await?.version().await.map_err(map_bollard_error)?;
    let display = if version.version.as_deref().unwrap_or_default().trim().is_empty() {
        version.api_version.unwrap_or_default()
    } else {
        version.version.unwrap_or_default()
    };
    info!(target: "shipyardx_lib::services::servers", "server connection succeeded; server_id={}", ctx.server_id());
    Ok(format!("连接成功！Docker {}", display.trim()))
}
