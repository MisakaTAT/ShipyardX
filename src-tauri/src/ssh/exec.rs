use crate::contracts::frontend::server::ServerConfig;
use crate::error::AppResult;
use tokio::io::AsyncRead;

use super::pool;

pub async fn ssh_exec_streaming_async<F>(config: &ServerConfig, command: &str, on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    pool::exec_streaming(config, command, on_chunk).await
}

pub async fn ssh_exec_async(config: &ServerConfig, command: &str) -> AppResult<String> {
    pool::exec(config, command.trim()).await
}

pub async fn ssh_exec_with_stdin_reader_async<R>(
    config: &ServerConfig,
    command: &str,
    reader: &mut R,
) -> AppResult<String>
where
    R: AsyncRead + Unpin + Send,
{
    pool::exec_with_stdin_reader(config, command.trim(), reader).await
}
