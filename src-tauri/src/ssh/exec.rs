use crate::dto::server::ServerConfig;
use crate::error::AppResult;
use log::debug;

use super::pool;

pub async fn ssh_exec_streaming<F>(config: &ServerConfig, command: &str, on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    debug!(target: "shipyardx_lib::ssh::exec", "running ssh streaming command; server_id={} command_bytes={}", config.id, command.len());
    pool::exec_streaming(config, command, on_chunk).await
}

pub async fn ssh_exec(config: &ServerConfig, command: &str) -> AppResult<String> {
    debug!(target: "shipyardx_lib::ssh::exec", "running ssh command; server_id={} command_bytes={}", config.id, command.len());
    pool::exec(config, command.trim()).await
}
