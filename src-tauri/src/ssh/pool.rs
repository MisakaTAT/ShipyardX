use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use log::{debug, warn};
use russh::{Channel, ChannelMsg, client};

use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::utils::output::floor_char_boundary;

use super::client::{SshClientHandler, connect};

const MAX_CAPTURE_BYTES: usize = 128 * 1024;
/// 每台服务器的连接数，单连接会让通道创建互相排队
const SSH_POOL_SIZE: usize = 3;
const SSH_POOL_IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

struct PooledConnection {
    handle: Option<Arc<client::Handle<SshClientHandler>>>,
    last_used: Instant,
}

type PoolEntry = Arc<tokio::sync::Mutex<PooledConnection>>;

struct SshPoolState {
    slots: Vec<PoolEntry>,
    next: AtomicUsize,
    connect_guard: tokio::sync::Mutex<()>,
}

fn pool() -> &'static Mutex<HashMap<String, Arc<SshPoolState>>> {
    static POOL: OnceLock<Mutex<HashMap<String, Arc<SshPoolState>>>> = OnceLock::new();
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Copy)]
enum PoolPurpose {
    Control,
    PortForward,
}

fn pool_key(config: &ServerConfig, purpose: PoolPurpose) -> String {
    format!(
        "{}|{}|{}@{}:{}|{}|{}",
        config.id,
        match purpose {
            PoolPurpose::Control => "control",
            PoolPurpose::PortForward => "port-forward",
        },
        config.username,
        config.host,
        config.port,
        config.auth_type,
        config.key_path.as_deref().unwrap_or_default()
    )
}

fn get_entry(config: &ServerConfig, purpose: PoolPurpose) -> (PoolEntry, Arc<SshPoolState>) {
    let key = pool_key(config, purpose);
    let state = {
        let mut guard = pool().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .entry(key)
            .or_insert_with(|| {
                Arc::new(SshPoolState {
                    slots: (0..SSH_POOL_SIZE)
                        .map(|_| {
                            Arc::new(tokio::sync::Mutex::new(PooledConnection {
                                handle: None,
                                last_used: Instant::now(),
                            }))
                        })
                        .collect(),
                    next: AtomicUsize::new(0),
                    connect_guard: tokio::sync::Mutex::new(()),
                })
            })
            .clone()
    };
    let index = state.next.fetch_add(1, Ordering::Relaxed) % state.slots.len();
    (state.slots[index].clone(), state)
}

pub async fn invalidate_server_id(server_id: &str) {
    debug!(target: "shipyardx_lib::ssh::pool", "invalidating ssh pool entries; server_id={}", server_id);
    let states: Vec<Arc<SshPoolState>> = {
        let mut guard = pool().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let keys: Vec<String> = guard
            .keys()
            .filter(|key| key.starts_with(&format!("{server_id}|")))
            .cloned()
            .collect();
        keys.into_iter().filter_map(|key| guard.remove(&key)).collect()
    };

    for state in states {
        for entry in &state.slots {
            entry.lock().await.handle.take();
        }
    }
}

/// 丢弃池对长期闲置连接的引用；活跃桥仍持有 `Arc`，不会被中途断开。
pub async fn reap_idle() {
    let states: Vec<Arc<SshPoolState>> = {
        let guard = pool().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.values().cloned().collect()
    };
    let now = Instant::now();
    for state in states {
        for entry in &state.slots {
            let mut pooled = entry.lock().await;
            if pooled.handle.is_some() && now.duration_since(pooled.last_used) >= SSH_POOL_IDLE_TIMEOUT {
                debug!(target: "shipyardx_lib::ssh::pool", "reaping idle pooled ssh connection");
                pooled.handle.take();
            }
        }
    }
}

fn missing_pooled_handle_error() -> AppError {
    AppError::internal("ssh.pool_handle_missing").retryable(true)
}

pub async fn warm_up(config: &ServerConfig) -> AppResult<()> {
    let (entry, state) = get_entry(config, PoolPurpose::PortForward);
    let _ = pooled_handle(entry, state, config).await?;
    Ok(())
}

async fn pooled_handle(
    entry: PoolEntry,
    state: Arc<SshPoolState>,
    config: &ServerConfig,
) -> AppResult<Arc<client::Handle<SshClientHandler>>> {
    {
        let mut pooled = entry.lock().await;
        if let Some(handle) = pooled.handle.as_ref().filter(|handle| !handle.is_closed()) {
            let handle = Arc::clone(handle);
            pooled.last_used = Instant::now();
            return Ok(handle);
        }
    }

    // 同一服务/用途只允许一个首连；等待者会复用第一个建好的 handle。
    let _connect_guard = state.connect_guard.lock().await;
    for candidate in &state.slots {
        let mut pooled = candidate.lock().await;
        if let Some(handle) = pooled.handle.as_ref().filter(|handle| !handle.is_closed()) {
            let handle = Arc::clone(handle);
            pooled.last_used = Instant::now();
            return Ok(handle);
        }
    }

    let mut pooled = entry.lock().await;
    if pooled.handle.as_ref().map(|handle| handle.is_closed()).unwrap_or(true) {
        debug!(target: "shipyardx_lib::ssh::pool", "opening pooled ssh connection; server_id={}", config.id);
        pooled.handle = Some(Arc::new(connect(config).await?));
    }
    pooled.last_used = Instant::now();
    pooled.handle.clone().ok_or_else(missing_pooled_handle_error)
}

async fn discard_if_same(entry: &PoolEntry, handle: &Arc<client::Handle<SshClientHandler>>) {
    let mut pooled = entry.lock().await;
    if pooled
        .handle
        .as_ref()
        .is_some_and(|current| Arc::ptr_eq(current, handle))
    {
        pooled.handle.take();
    }
}

pub async fn open_direct_streamlocal(
    config: &ServerConfig,
    path: String,
) -> AppResult<Result<Channel<client::Msg>, russh::Error>> {
    let (entry, state) = get_entry(config, PoolPurpose::Control);
    let handle = pooled_handle(entry.clone(), state, config).await?;
    let result = handle.channel_open_direct_streamlocal(path).await;
    if result.is_err() {
        warn!(target: "shipyardx_lib::ssh::pool", "pooled streamlocal channel open failed; server_id={}", config.id);
        discard_if_same(&entry, &handle).await;
    }
    Ok(result)
}

pub async fn open_direct_tcpip(
    config: &ServerConfig,
    host: &str,
    port: u16,
) -> AppResult<Result<Channel<client::Msg>, russh::Error>> {
    let (entry, state) = get_entry(config, PoolPurpose::PortForward);
    let handle = pooled_handle(entry.clone(), state, config).await?;
    let result = handle
        .channel_open_direct_tcpip(host.to_string(), port as u32, "127.0.0.1", 0)
        .await;
    if result.is_err() {
        warn!(target: "shipyardx_lib::ssh::pool", "pooled tcpip channel open failed; server_id={}", config.id);
        discard_if_same(&entry, &handle).await;
    }
    Ok(result)
}

pub async fn exec(config: &ServerConfig, command: &str) -> AppResult<String> {
    exec_internal(config, command, None, |_| {}).await
}

/// 敏感数据走标准输入下发，不进远端命令行
pub async fn exec_with_stdin(config: &ServerConfig, command: &str, stdin: Vec<u8>) -> AppResult<String> {
    exec_internal(config, command, Some(stdin), |_| {}).await
}

pub async fn exec_streaming<F>(config: &ServerConfig, command: &str, mut on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    exec_internal(config, command, None, |chunk| on_chunk(chunk)).await
}

fn push_limited(buf: &mut String, chunk: &str) {
    let remaining = MAX_CAPTURE_BYTES.saturating_sub(buf.len());
    if remaining == 0 {
        return;
    }
    if chunk.len() <= remaining {
        buf.push_str(chunk);
    } else {
        buf.push_str(&chunk[..floor_char_boundary(chunk, remaining)]);
    }
}

async fn exec_internal<F>(
    config: &ServerConfig,
    command: &str,
    stdin: Option<Vec<u8>>,
    mut on_chunk: F,
) -> AppResult<String>
where
    F: FnMut(&str),
{
    debug!(target: "shipyardx_lib::ssh::pool", "executing pooled ssh command; server_id={} command_bytes={}", config.id, command.len());
    let (entry, state) = get_entry(config, PoolPurpose::Control);
    let handle = pooled_handle(entry.clone(), state, config).await?;
    let channel = handle.channel_open_session().await;
    let channel = match channel {
        Ok(channel) => channel,
        Err(error) => {
            warn!(target: "shipyardx_lib::ssh::pool", "ssh channel open failed for exec; server_id={} error={}", config.id, error);
            discard_if_same(&entry, &handle).await;
            return Err(AppError::internal("ssh.channel_open_failed").with_source(error));
        }
    };

    channel.exec(true, command).await.map_err(|e| {
        warn!(target: "shipyardx_lib::ssh::pool", "ssh exec start failed; server_id={} error={}", config.id, e);
        AppError::internal("ssh.exec_failed").with_source(e)
    })?;

    if let Some(stdin) = stdin {
        channel.data_bytes(stdin).await.map_err(|e| {
            warn!(target: "shipyardx_lib::ssh::pool", "ssh stdin write failed; server_id={} error={}", config.id, e);
            AppError::internal("ssh.stdin_write_failed").with_source(e)
        })?;
        channel.eof().await.map_err(|e| {
            warn!(target: "shipyardx_lib::ssh::pool", "ssh stdin close failed; server_id={} error={}", config.id, e);
            AppError::internal("ssh.stdin_close_failed").with_source(e)
        })?;
    }

    collect_exec_output_with(channel, |chunk| on_chunk(chunk)).await
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
        warn!(target: "shipyardx_lib::ssh::pool", "ssh command failed; exit_code={:?} stdout_bytes={} stderr_bytes={}", exit_code, stdout.len(), stderr.len());
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("exit code {}", exit_code.unwrap_or(-1))
        };
        return Err(AppError::internal("ssh.command_failed").with_detail(detail));
    }

    debug!(target: "shipyardx_lib::ssh::pool", "ssh command completed; stdout_bytes={}", stdout.len());
    Ok(stdout)
}
