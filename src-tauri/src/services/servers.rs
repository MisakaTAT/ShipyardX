use tauri::State;

use log::info;

use crate::dto::server::{HostKeyPrompt, KnownHostEntry, ServerConfig};
use crate::error::AppResult;
use crate::services::{server_store, support::ServerContext};
use crate::ssh::client;
use crate::ssh::client::{connect, disconnect};
use crate::ssh::known_hosts;
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

/// 返回最近一次未通过校验的主机密钥
pub async fn get_pending_host_key() -> AppResult<Option<HostKeyPrompt>> {
    Ok(known_hosts::pending())
}

pub async fn trust_host_key(host: String, port: u16, fingerprint: String) -> AppResult<()> {
    known_hosts::trust(&host, port, &fingerprint)?;
    info!(target: "shipyardx_lib::services::servers", "host key trusted; host={} port={}", host, port);
    Ok(())
}

pub async fn list_known_hosts() -> AppResult<Vec<KnownHostEntry>> {
    let entries = known_hosts::list()?;
    info!(target: "shipyardx_lib::services::servers", "listed known hosts; count={}", entries.len());
    Ok(entries)
}

pub async fn forget_host_key(host: String, port: u16) -> AppResult<bool> {
    known_hosts::forget(&host, port)
}

pub async fn clear_known_hosts() -> AppResult<u32> {
    Ok(known_hosts::clear()? as u32)
}

pub async fn probe_host_key(host: String, port: u16) -> AppResult<String> {
    client::probe_host_key(&host, port).await
}

pub async fn test_server_connection(server_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let ctx = ServerContext::from_state(&state, &server_id)?;
    test_server_connection_with_context(ctx).await
}

pub async fn test_server_connection_direct(server: ServerConfig) -> AppResult<()> {
    test_server_connection_with_context(ServerContext::from_server(server)).await
}

async fn test_server_connection_with_context(ctx: ServerContext) -> AppResult<()> {
    info!(
        target: "shipyardx_lib::services::servers",
        "testing ssh connection; server_id={} host={} port={}",
        ctx.server().id,
        ctx.server().host,
        ctx.server().port
    );
    let mut handle = connect(ctx.server()).await?;
    disconnect(&mut handle).await;
    info!(
        target: "shipyardx_lib::services::servers",
        "ssh connection succeeded; server_id={}",
        ctx.server_id()
    );
    Ok(())
}
