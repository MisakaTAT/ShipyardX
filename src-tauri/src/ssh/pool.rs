use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use russh::{Channel, ChannelMsg, client};
use tokio::io::{AsyncRead, AsyncWriteExt};

use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppResult};

use super::client::{SshClientHandler, connect, disconnect};

const MAX_CAPTURE_BYTES: usize = 128 * 1024;

struct PooledConnection {
    handle: Option<client::Handle<SshClientHandler>>,
}

type PoolEntry = Arc<tokio::sync::Mutex<PooledConnection>>;

fn pool() -> &'static Mutex<HashMap<String, PoolEntry>> {
    static POOL: OnceLock<Mutex<HashMap<String, PoolEntry>>> = OnceLock::new();
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn pool_key(config: &ServerConfig) -> String {
    format!(
        "{}|{}@{}:{}|{}|{}",
        config.id,
        config.username,
        config.host,
        config.port,
        config.auth_type,
        config.key_path.as_deref().unwrap_or_default()
    )
}

fn get_entry(config: &ServerConfig) -> PoolEntry {
    let key = pool_key(config);
    let mut guard = pool().lock().unwrap();
    guard
        .entry(key)
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(PooledConnection { handle: None })))
        .clone()
}

pub async fn invalidate_server_id(server_id: &str) {
    let entries: Vec<PoolEntry> = {
        let mut guard = pool().lock().unwrap();
        let keys: Vec<String> = guard
            .keys()
            .filter(|key| key.starts_with(&format!("{server_id}|")))
            .cloned()
            .collect();
        keys.into_iter().filter_map(|key| guard.remove(&key)).collect()
    };

    for entry in entries {
        let mut pooled = entry.lock().await;
        if let Some(mut handle) = pooled.handle.take() {
            disconnect(&mut handle).await;
        }
    }
}

pub async fn open_direct_streamlocal(
    config: &ServerConfig,
    path: String,
) -> AppResult<Result<Channel<client::Msg>, russh::Error>> {
    let entry = get_entry(config);
    let mut pooled = entry.lock().await;

    let needs_connect = pooled.handle.as_ref().map(|handle| handle.is_closed()).unwrap_or(true);
    if needs_connect {
        pooled.handle = Some(connect(config).await?);
    }

    let handle = pooled.handle.as_ref().expect("pooled SSH handle must exist");
    let result = handle.channel_open_direct_streamlocal(path).await;
    if result.is_err() {
        if let Some(mut handle) = pooled.handle.take() {
            disconnect(&mut handle).await;
        }
    }
    Ok(result)
}

pub async fn open_direct_tcpip(
    config: &ServerConfig,
    host: String,
    port: u16,
) -> AppResult<Result<Channel<client::Msg>, russh::Error>> {
    let entry = get_entry(config);
    let mut pooled = entry.lock().await;

    let needs_connect = pooled.handle.as_ref().map(|handle| handle.is_closed()).unwrap_or(true);
    if needs_connect {
        pooled.handle = Some(connect(config).await?);
    }

    let handle = pooled.handle.as_ref().expect("pooled SSH handle must exist");
    let result = handle
        .channel_open_direct_tcpip(host, port as u32, "127.0.0.1", 0)
        .await;
    if result.is_err() {
        if let Some(mut handle) = pooled.handle.take() {
            disconnect(&mut handle).await;
        }
    }
    Ok(result)
}

pub async fn exec(config: &ServerConfig, command: &str) -> AppResult<String> {
    exec_internal(config, command, |_| {}).await
}

pub async fn exec_streaming<F>(config: &ServerConfig, command: &str, mut on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    exec_internal(config, command, |chunk| on_chunk(chunk)).await
}

pub async fn exec_with_stdin_reader<R>(config: &ServerConfig, command: &str, reader: &mut R) -> AppResult<String>
where
    R: AsyncRead + Unpin + Send,
{
    let entry = get_entry(config);
    let mut pooled = entry.lock().await;

    let needs_connect = pooled.handle.as_ref().map(|handle| handle.is_closed()).unwrap_or(true);
    if needs_connect {
        pooled.handle = Some(connect(config).await?);
    }

    let channel = {
        let handle = pooled.handle.as_ref().expect("pooled SSH handle must exist");
        handle.channel_open_session().await
    };
    let channel = match channel {
        Ok(channel) => channel,
        Err(error) => {
            if let Some(mut handle) = pooled.handle.take() {
                disconnect(&mut handle).await;
            }
            return Err(AppError::internal("ssh.channel_open_failed", "创建 SSH 通道失败").with_source(error));
        }
    };
    drop(pooled);

    channel
        .exec(true, command)
        .await
        .map_err(|e| AppError::internal("ssh.exec_failed", "执行远程命令失败").with_source(e))?;

    {
        let mut writer = channel.make_writer();
        tokio::io::copy(reader, &mut writer)
            .await
            .map_err(|e| AppError::internal("ssh.stdin_copy_failed", "上传远程命令输入流失败").with_source(e))?;
        writer
            .shutdown()
            .await
            .map_err(|e| AppError::internal("ssh.stdin_close_failed", "关闭远程命令输入流失败").with_source(e))?;
    }

    collect_exec_output(channel).await
}

fn push_limited(buf: &mut String, chunk: &str) {
    let remaining = MAX_CAPTURE_BYTES.saturating_sub(buf.len());
    if remaining == 0 {
        return;
    }
    if chunk.len() <= remaining {
        buf.push_str(chunk);
    } else {
        buf.push_str(&chunk[..remaining]);
    }
}

async fn exec_internal<F>(config: &ServerConfig, command: &str, mut on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    let entry = get_entry(config);
    let mut pooled = entry.lock().await;

    let needs_connect = pooled.handle.as_ref().map(|handle| handle.is_closed()).unwrap_or(true);
    if needs_connect {
        pooled.handle = Some(connect(config).await?);
    }

    let channel = {
        let handle = pooled.handle.as_ref().expect("pooled SSH handle must exist");
        handle.channel_open_session().await
    };
    let channel = match channel {
        Ok(channel) => channel,
        Err(error) => {
            if let Some(mut handle) = pooled.handle.take() {
                disconnect(&mut handle).await;
            }
            return Err(AppError::internal("ssh.channel_open_failed", "创建 SSH 通道失败").with_source(error));
        }
    };
    drop(pooled);

    channel
        .exec(true, command)
        .await
        .map_err(|e| AppError::internal("ssh.exec_failed", "执行远程命令失败").with_source(e))?;

    collect_exec_output_with(channel, |chunk| on_chunk(chunk)).await
}

async fn collect_exec_output(channel: Channel<client::Msg>) -> AppResult<String> {
    collect_exec_output_with(channel, |_| {}).await
}

async fn collect_exec_output_with<F>(mut channel: Channel<client::Msg>, mut on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code = None;

    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => {
                let chunk = String::from_utf8_lossy(&data).to_string();
                on_chunk(&chunk);
                push_limited(&mut stdout, &chunk);
            }
            ChannelMsg::ExtendedData { data, .. } => {
                let chunk = String::from_utf8_lossy(&data);
                push_limited(&mut stderr, &chunk);
            }
            ChannelMsg::ExitStatus { exit_status: code } => exit_code = Some(code as i32),
            ChannelMsg::ExitSignal { error_message, .. } if !error_message.is_empty() => {
                push_limited(&mut stderr, &error_message)
            }
            _ => {}
        }
    }

    if exit_code.unwrap_or(-1) != 0 {
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("命令失败，退出码: {}", exit_code.unwrap_or(-1))
        };
        return Err(AppError::internal("ssh.command_failed", "远程命令执行失败").with_detail(detail));
    }

    Ok(stdout)
}
