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

pub async fn ssh_exec_with_stdin(config: &ServerConfig, command: &str, stdin: Vec<u8>) -> AppResult<String> {
    debug!(target: "shipyardx_lib::ssh::exec", "running ssh command with stdin; server_id={} command_bytes={} stdin_bytes={}", config.id, command.len(), stdin.len());
    pool::exec_with_stdin(config, command.trim(), stdin).await
}
