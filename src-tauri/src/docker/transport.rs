use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::client::conn::http1;
use hyper::header::{CONTENT_TYPE, HOST};
use hyper::{Method, Request, StatusCode};
use hyper_util::rt::TokioIo;
use log::{debug, warn};
use russh::{ChannelStream, client};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::contracts::docker_api::common::DockerError;
use crate::contracts::docker_api::system::DaemonConfig;
use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppErrorKind, AppResult};
use crate::scripts::DOCKER_READ_DAEMON_CONFIG_SH;
use crate::ssh::client::{SshClientHandler, connect, disconnect};
use crate::ssh::exec::ssh_exec_async;
use crate::ssh::pool;
use crate::state::lock_mutex;

const DEFAULT_DOCKER_HOST: &str = "unix:///var/run/docker.sock";
const ENDPOINT_CACHE_TTL: Duration = Duration::from_secs(300);
const HTTP_POOL_SIZE: usize = 3;

#[derive(Clone, Debug)]
pub(crate) enum DockerEndpoint {
    Unix { path: String },
    Tcp { host: String, port: u16 },
}

struct EndpointCacheEntry {
    value: DockerEndpoint,
    fetched_at: Instant,
}

struct PooledHttpConnection {
    sender: hyper::client::conn::http1::SendRequest<Full<Bytes>>,
    connection_task: tokio::task::JoinHandle<()>,
}

type HttpPoolEntry = Arc<tokio::sync::Mutex<Option<PooledHttpConnection>>>;

struct HttpPoolState {
    slots: Vec<HttpPoolEntry>,
    next: AtomicUsize,
}

fn endpoint_cache() -> &'static Mutex<HashMap<String, EndpointCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, EndpointCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn http_pool() -> &'static Mutex<HashMap<String, Arc<HttpPoolState>>> {
    static POOL: OnceLock<Mutex<HashMap<String, Arc<HttpPoolState>>>> = OnceLock::new();
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(config: &ServerConfig) -> String {
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

pub(crate) async fn invalidate_docker_endpoint(config: &ServerConfig) {
    debug!(target: "shipyardx_lib::docker::transport", "invalidating docker endpoint cache; server_id={} host={} port={}", config.id, config.host, config.port);
    let _ = lock_mutex(
        endpoint_cache(),
        "docker.endpoint_cache_lock_failed",
        "更新 Docker endpoint 缓存失败",
    )
    .map(|mut cache| cache.remove(&cache_key(config)));
    invalidate_pooled_http(config).await;
}

pub(crate) async fn invalidate_pooled_http(config: &ServerConfig) {
    debug!(target: "shipyardx_lib::docker::transport", "invalidating pooled docker http connections; server_id={}", config.id);
    let state = lock_mutex(
        http_pool(),
        "docker.http_pool_lock_failed",
        "更新 Docker HTTP 连接池失败",
    )
    .ok()
    .and_then(|mut pool| pool.remove(&cache_key(config)));
    if let Some(state) = state {
        for slot in &state.slots {
            let mut pooled = slot.lock().await;
            if let Some(connection) = pooled.take() {
                connection.connection_task.abort();
            }
        }
    }
}

pub(crate) async fn invalidate_pooled_http_server_id(server_id: &str) {
    debug!(target: "shipyardx_lib::docker::transport", "invalidating pooled docker http connections by server id; server_id={}", server_id);
    let states: Vec<Arc<HttpPoolState>> = {
        let mut guard = match lock_mutex(
            http_pool(),
            "docker.http_pool_lock_failed",
            "更新 Docker HTTP 连接池失败",
        ) {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let keys: Vec<String> = guard
            .keys()
            .filter(|key| key.starts_with(&format!("{server_id}|")))
            .cloned()
            .collect();
        keys.into_iter().filter_map(|key| guard.remove(&key)).collect()
    };

    for state in states {
        for slot in &state.slots {
            let mut pooled = slot.lock().await;
            if let Some(connection) = pooled.take() {
                connection.connection_task.abort();
            }
        }
    }
}

fn parse_docker_host(raw: &str) -> AppResult<DockerEndpoint> {
    if let Some(path) = raw.strip_prefix("unix://") {
        let path = path.trim();
        if path.is_empty() {
            return Err(AppError::validation(
                "docker.host_invalid",
                "Docker Unix Socket 路径不能为空",
            ));
        }
        return Ok(DockerEndpoint::Unix { path: path.to_string() });
    }

    if let Some(target) = raw.strip_prefix("tcp://") {
        let target = target.trim();
        let (host, port_str) = target
            .rsplit_once(':')
            .ok_or_else(|| AppError::validation("docker.host_invalid", format!("无效的 Docker TCP Host: {raw}")))?;
        let host = host.trim_matches('[').trim_matches(']').trim();
        let port = port_str
            .parse::<u16>()
            .map_err(|_| AppError::validation("docker.host_invalid", format!("无效的 Docker TCP 端口: {raw}")))?;
        let host = match host {
            "" | "0.0.0.0" => "127.0.0.1".to_string(),
            "::" => "::1".to_string(),
            other => other.to_string(),
        };
        return Ok(DockerEndpoint::Tcp { host, port });
    }

    if raw == "fd://" {
        return Ok(DockerEndpoint::Unix {
            path: "/var/run/docker.sock".to_string(),
        });
    }

    Err(AppError::validation(
        "docker.host_unsupported",
        format!("暂不支持的 Docker Host: {raw}"),
    ))
}

pub(crate) async fn resolve_docker_endpoint(config: &ServerConfig) -> AppResult<DockerEndpoint> {
    let key = cache_key(config);
    if let Some(entry) = lock_mutex(
        endpoint_cache(),
        "docker.endpoint_cache_lock_failed",
        "读取 Docker endpoint 缓存失败",
    )?
    .get(&key)
        && entry.fetched_at.elapsed() < ENDPOINT_CACHE_TTL
    {
        debug!(target: "shipyardx_lib::docker::transport", "docker endpoint cache hit; server_id={} endpoint={:?}", config.id, entry.value);
        return Ok(entry.value.clone());
    }
    debug!(target: "shipyardx_lib::docker::transport", "resolving docker endpoint; server_id={} host={} port={}", config.id, config.host, config.port);

    let raw = match pool::exec(config, DOCKER_READ_DAEMON_CONFIG_SH).await {
        Ok(raw) => raw,
        Err(_) => ssh_exec_async(config, DOCKER_READ_DAEMON_CONFIG_SH).await?,
    };
    let cfg: DaemonConfig = serde_json::from_str(raw.trim()).unwrap_or_default();
    let host = cfg
        .hosts
        .as_deref()
        .and_then(|hosts| hosts.iter().find(|host| !host.trim().is_empty()))
        .map(|host| host.as_str())
        .unwrap_or(DEFAULT_DOCKER_HOST);
    let endpoint = parse_docker_host(host)?;
    lock_mutex(
        endpoint_cache(),
        "docker.endpoint_cache_lock_failed",
        "更新 Docker endpoint 缓存失败",
    )?
    .insert(
        key,
        EndpointCacheEntry {
            value: endpoint.clone(),
            fetched_at: Instant::now(),
        },
    );
    debug!(target: "shipyardx_lib::docker::transport", "resolved docker endpoint; server_id={} endpoint={:?}", config.id, endpoint);
    Ok(endpoint)
}

pub(crate) struct DockerStreamResponse {
    body: Incoming,
    connection_task: tokio::task::JoinHandle<()>,
    ssh_handle: Option<client::Handle<SshClientHandler>>,
}

impl DockerStreamResponse {
    pub async fn next_chunk(&mut self) -> AppResult<Option<Bytes>> {
        loop {
            let Some(frame) = self.body.frame().await else {
                self.finish().await;
                return Ok(None);
            };

            let frame = frame.map_err(|e| {
                AppError::unavailable("docker.stream_read_failed", "读取 Docker 流失败")
                    .with_detail(e.to_string())
                    .retryable(true)
            })?;

            if let Ok(data) = frame.into_data() {
                return Ok(Some(data));
            }
        }
    }

    pub async fn close(&mut self) {
        self.finish().await;
    }

    async fn finish(&mut self) {
        if let Some(mut handle) = self.ssh_handle.take() {
            disconnect(&mut handle).await;
        }
        self.connection_task.abort();
        let _ = (&mut self.connection_task).await;
    }
}

impl Drop for DockerStreamResponse {
    fn drop(&mut self) {
        self.connection_task.abort();
    }
}

pub(crate) struct DockerHijackConnection {
    io: ChannelStream<client::Msg>,
    pending: Vec<u8>,
    ssh_handle: Option<client::Handle<SshClientHandler>>,
}

impl DockerHijackConnection {
    pub async fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if !self.pending.is_empty() {
            let n = self.pending.len().min(buf.len());
            buf[..n].copy_from_slice(&self.pending[..n]);
            self.pending.drain(..n);
            return Ok(n);
        }
        self.io.read(buf).await
    }

    pub async fn write_all(&mut self, buf: &[u8]) -> std::io::Result<()> {
        self.io.write_all(buf).await
    }

    pub async fn close(&mut self) {
        let _ = self.io.shutdown().await;
        if let Some(mut handle) = self.ssh_handle.take() {
            disconnect(&mut handle).await;
        }
    }
}

impl Drop for DockerHijackConnection {
    fn drop(&mut self) {}
}

struct DockerRawResponse {
    status: StatusCode,
    body: Bytes,
}

fn map_http_status(status: StatusCode) -> AppErrorKind {
    match status.as_u16() {
        400 => AppErrorKind::Validation,
        401 => AppErrorKind::Auth,
        403 => AppErrorKind::Permission,
        404 => AppErrorKind::NotFound,
        409 => AppErrorKind::Conflict,
        408 | 504 => AppErrorKind::Timeout,
        500..=599 => AppErrorKind::Unavailable,
        _ => AppErrorKind::Internal,
    }
}

fn map_transport_error(code: &'static str, message: &'static str, error: impl std::fmt::Display) -> AppError {
    AppError::unavailable(code, message)
        .with_detail(error.to_string())
        .retryable(true)
}

fn docker_api_error(status: StatusCode, body: &[u8]) -> AppError {
    let detail_text = String::from_utf8_lossy(body).trim().to_string();
    let docker_message = serde_json::from_slice::<DockerError>(body)
        .ok()
        .and_then(|error| error.message)
        .filter(|message| !message.trim().is_empty());

    AppError::new(
        format!("docker.api_http_{}", status.as_u16()),
        map_http_status(status),
        if status.is_client_error() {
            "Docker API 请求无效"
        } else if status.is_server_error() {
            "Docker 服务暂时不可用"
        } else {
            "Docker API 请求失败"
        },
    )
    .with_detail(
        docker_message
            .or_else(|| (!detail_text.is_empty()).then_some(detail_text))
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16())),
    )
    .retryable(status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS)
}

async fn open_http_sender(
    config: &ServerConfig,
) -> AppResult<(
    client::Handle<SshClientHandler>,
    hyper::client::conn::http1::SendRequest<Full<Bytes>>,
    tokio::task::JoinHandle<()>,
)> {
    debug!(target: "shipyardx_lib::docker::transport", "opening docker http sender; server_id={}", config.id);
    let handle = connect(config).await?;
    let endpoint = resolve_docker_endpoint(config).await?;
    let channel = match endpoint {
        DockerEndpoint::Unix { path } => handle
            .channel_open_direct_streamlocal(path)
            .await
            .map_err(|e| map_transport_error("docker.socket_open_failed", "打开 Docker Socket 通道失败", e))?,
        DockerEndpoint::Tcp { host, port } => handle
            .channel_open_direct_tcpip(host, port as u32, "127.0.0.1", 0)
            .await
            .map_err(|e| map_transport_error("docker.tcp_open_failed", "打开 Docker TCP 通道失败", e))?,
    };

    let stream = TokioIo::new(channel.into_stream());
    let (sender, connection) = http1::Builder::new()
        .handshake(stream)
        .await
        .map_err(|e| map_transport_error("docker.http_handshake_failed", "建立 Docker HTTP 连接失败", e))?;

    let connection_task = tokio::spawn(async move {
        let _ = connection.await;
    });

    Ok((handle, sender, connection_task))
}

async fn open_pooled_http_sender(config: &ServerConfig) -> AppResult<PooledHttpConnection> {
    debug!(target: "shipyardx_lib::docker::transport", "opening pooled docker http sender; server_id={}", config.id);
    let endpoint = resolve_docker_endpoint(config).await?;
    let channel = match endpoint {
        DockerEndpoint::Unix { path } => pool::open_direct_streamlocal(config, path)
            .await?
            .map_err(|e| map_transport_error("docker.socket_open_failed", "打开 Docker Socket 通道失败", e))?,
        DockerEndpoint::Tcp { host, port } => pool::open_direct_tcpip(config, host, port)
            .await?
            .map_err(|e| map_transport_error("docker.tcp_open_failed", "打开 Docker TCP 通道失败", e))?,
    };

    let stream = TokioIo::new(channel.into_stream());
    let (sender, connection) = http1::Builder::new()
        .handshake(stream)
        .await
        .map_err(|e| map_transport_error("docker.http_handshake_failed", "建立 Docker HTTP 连接失败", e))?;

    let connection_task = tokio::spawn(async move {
        let _ = connection.await;
    });

    Ok(PooledHttpConnection {
        sender,
        connection_task,
    })
}

fn get_http_pool_state(config: &ServerConfig) -> Arc<HttpPoolState> {
    let key = cache_key(config);
    let mut guard = http_pool().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .entry(key)
        .or_insert_with(|| {
            Arc::new(HttpPoolState {
                slots: (0..HTTP_POOL_SIZE)
                    .map(|_| Arc::new(tokio::sync::Mutex::new(None)))
                    .collect(),
                next: AtomicUsize::new(0),
            })
        })
        .clone()
}

async fn send_pooled_request(config: &ServerConfig, request: Request<Full<Bytes>>) -> AppResult<DockerRawResponse> {
    let state = get_http_pool_state(config);
    let index = state.next.fetch_add(1, Ordering::Relaxed) % state.slots.len();
    debug!(target: "shipyardx_lib::docker::transport", "sending pooled docker request; server_id={} slot={} path={}", config.id, index, request.uri().path());
    let entry = state.slots[index].clone();
    let mut pooled = entry.lock().await;
    let needs_connect = pooled
        .as_ref()
        .map(|connection| connection.sender.is_closed() || connection.connection_task.is_finished())
        .unwrap_or(true);
    if needs_connect {
        debug!(target: "shipyardx_lib::docker::transport", "pooled docker connection refresh required; server_id={} slot={}", config.id, index);
        if let Some(connection) = pooled.take() {
            connection.connection_task.abort();
        }
        *pooled = Some(open_pooled_http_sender(config).await?);
    }

    let ready_result = {
        let connection = pooled.as_mut().ok_or_else(|| {
            AppError::internal(
                "docker.pooled_connection_missing",
                "Docker HTTP 连接池状态异常：连接缺失",
            )
            .retryable(true)
        })?;
        connection.sender.ready().await
    };
    if let Err(e) = ready_result {
        warn!(target: "shipyardx_lib::docker::transport", "docker pooled sender not ready; server_id={} slot={} error={}", config.id, index, e);
        if let Some(connection) = pooled.take() {
            connection.connection_task.abort();
        }
        return Err(map_transport_error(
            "docker.request_send_failed",
            "发送 Docker HTTP 请求失败",
            e,
        ));
    }

    let response = {
        let connection = pooled.as_mut().ok_or_else(|| {
            AppError::internal(
                "docker.pooled_connection_missing",
                "Docker HTTP 连接池状态异常：连接缺失",
            )
            .retryable(true)
        })?;
        connection.sender.send_request(request).await
    };
    let response = match response {
        Ok(response) => response,
        Err(e) => {
            warn!(target: "shipyardx_lib::docker::transport", "docker request send failed; server_id={} slot={} error={}", config.id, index, e);
            if let Some(connection) = pooled.take() {
                connection.connection_task.abort();
            }
            return Err(map_transport_error(
                "docker.request_send_failed",
                "发送 Docker HTTP 请求失败",
                e,
            ));
        }
    };

    let status = response.status();
    let body = match response.into_body().collect().await {
        Ok(body) => body.to_bytes(),
        Err(e) => {
            warn!(target: "shipyardx_lib::docker::transport", "docker response read failed; server_id={} slot={} error={}", config.id, index, e);
            if let Some(connection) = pooled.take() {
                connection.connection_task.abort();
            }
            return Err(map_transport_error(
                "docker.response_read_failed",
                "读取 Docker HTTP 响应失败",
                e,
            ));
        }
    };
    Ok(DockerRawResponse { status, body })
}

async fn send_request(
    config: &ServerConfig,
    method: Method,
    path: &str,
    content_type: Option<&str>,
    body: Bytes,
) -> AppResult<DockerRawResponse> {
    let mut builder = Request::builder().method(method).uri(path).header(HOST, "localhost");
    if let Some(content_type) = content_type {
        builder = builder.header(CONTENT_TYPE, content_type);
    }

    let request = builder.body(Full::new(body)).map_err(|e| {
        AppError::internal("docker.request_build_failed", "构建 Docker HTTP 请求失败").with_detail(e.to_string())
    })?;

    send_pooled_request(config, request).await
}

pub async fn request_text(config: &ServerConfig, method: Method, path: &str) -> AppResult<String> {
    let response = send_request(config, method, path, None, Bytes::new()).await?;
    if !response.status.is_success() {
        return Err(docker_api_error(response.status, &response.body));
    }
    Ok(String::from_utf8_lossy(&response.body).to_string())
}

pub async fn request_json_body_text(
    config: &ServerConfig,
    method: Method,
    path: &str,
    body: Vec<u8>,
) -> AppResult<String> {
    let response = send_request(config, method, path, Some("application/json"), Bytes::from(body)).await?;
    if !response.status.is_success() {
        return Err(docker_api_error(response.status, &response.body));
    }
    Ok(String::from_utf8_lossy(&response.body).to_string())
}

pub async fn request_empty(config: &ServerConfig, method: Method, path: &str) -> AppResult<()> {
    let response = send_request(config, method, path, None, Bytes::new()).await?;
    if !response.status.is_success() {
        return Err(docker_api_error(response.status, &response.body));
    }
    Ok(())
}

pub(crate) async fn open_stream(config: &ServerConfig, method: Method, path: &str) -> AppResult<DockerStreamResponse> {
    debug!(target: "shipyardx_lib::docker::transport", "opening docker stream; server_id={} method={} path={}", config.id, method, path);
    let (handle, mut sender, connection_task) = open_http_sender(config).await?;
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header(HOST, "localhost")
        .body(Full::new(Bytes::new()))
        .map_err(|e| {
            AppError::internal("docker.request_build_failed", "构建 Docker HTTP 请求失败").with_detail(e.to_string())
        })?;

    let response = sender
        .send_request(request)
        .await
        .map_err(|e| map_transport_error("docker.request_send_failed", "发送 Docker HTTP 请求失败", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .into_body()
            .collect()
            .await
            .map_err(|e| map_transport_error("docker.response_read_failed", "读取 Docker HTTP 响应失败", e))?
            .to_bytes();
        drop(sender);
        connection_task.abort();
        let mut handle = handle;
        disconnect(&mut handle).await;
        return Err(docker_api_error(status, &body));
    }

    Ok(DockerStreamResponse {
        body: response.into_body(),
        connection_task,
        ssh_handle: Some(handle),
    })
}

pub(crate) async fn open_hijack(
    config: &ServerConfig,
    method: Method,
    path: &str,
    body: Vec<u8>,
) -> AppResult<DockerHijackConnection> {
    debug!(target: "shipyardx_lib::docker::transport", "opening docker hijack connection; server_id={} method={} path={} body_bytes={}", config.id, method, path, body.len());
    let mut handle = connect(config).await?;
    let endpoint = resolve_docker_endpoint(config).await?;
    let channel = match endpoint {
        DockerEndpoint::Unix { path } => handle
            .channel_open_direct_streamlocal(path)
            .await
            .map_err(|e| map_transport_error("docker.socket_open_failed", "打开 Docker Socket 通道失败", e))?,
        DockerEndpoint::Tcp { host, port } => handle
            .channel_open_direct_tcpip(host, port as u32, "127.0.0.1", 0)
            .await
            .map_err(|e| map_transport_error("docker.tcp_open_failed", "打开 Docker TCP 通道失败", e))?,
    };
    let mut io = channel.into_stream();
    let request_head = format!(
        "{} {} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: {}\r\n\r\n",
        method,
        path,
        body.len()
    );
    io.write_all(request_head.as_bytes())
        .await
        .map_err(|e| map_transport_error("docker.request_send_failed", "发送 Docker HTTP 请求失败", e))?;
    io.write_all(&body)
        .await
        .map_err(|e| map_transport_error("docker.request_send_failed", "发送 Docker HTTP 请求失败", e))?;
    io.flush()
        .await
        .map_err(|e| map_transport_error("docker.request_send_failed", "发送 Docker HTTP 请求失败", e))?;

    let (status, headers, pending) = read_hijack_response_head(&mut io).await?;
    if !status.is_success() && status != StatusCode::SWITCHING_PROTOCOLS {
        let body = read_hijack_error_body(&mut io, &headers, pending).await?;
        disconnect(&mut handle).await;
        return Err(docker_api_error(status, &body));
    }

    Ok(DockerHijackConnection {
        io,
        pending,
        ssh_handle: Some(handle),
    })
}

async fn read_hijack_response_head(io: &mut ChannelStream<client::Msg>) -> AppResult<(StatusCode, String, Vec<u8>)> {
    let mut received = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        if let Some(pos) = find_header_end(&received) {
            break pos;
        }
        let n = tokio::time::timeout(Duration::from_secs(15), io.read(&mut chunk))
            .await
            .map_err(|_| AppError::timeout("docker.hijack_timeout", "等待 Docker hijack 响应超时").retryable(true))?
            .map_err(|e| map_transport_error("docker.response_read_failed", "读取 Docker HTTP 响应失败", e))?;
        if n == 0 {
            return Err(AppError::unavailable("docker.hijack_closed", "Docker hijack 连接已关闭").retryable(true));
        }
        received.extend_from_slice(&chunk[..n]);
    };

    let pending = received.split_off(header_end + 4);
    let headers = String::from_utf8_lossy(&received[..header_end]).to_string();
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .and_then(|code| StatusCode::from_u16(code).ok())
        .ok_or_else(|| AppError::internal("docker.hijack_status_invalid", "解析 Docker hijack 状态失败"))?;

    Ok((status, headers, pending))
}

async fn read_hijack_error_body(
    io: &mut ChannelStream<client::Msg>,
    headers: &str,
    mut body: Vec<u8>,
) -> AppResult<Vec<u8>> {
    let Some(content_length) = header_value(headers, "content-length").and_then(|value| value.parse::<usize>().ok())
    else {
        return Ok(body);
    };
    let mut chunk = [0u8; 4096];
    while body.len() < content_length {
        let n = tokio::time::timeout(Duration::from_secs(2), io.read(&mut chunk))
            .await
            .map_err(|_| AppError::timeout("docker.hijack_error_timeout", "读取 Docker 错误响应超时").retryable(true))?
            .map_err(|e| map_transport_error("docker.response_read_failed", "读取 Docker HTTP 响应失败", e))?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(content_length);
    Ok(body)
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|window| window == b"\r\n\r\n")
}

fn header_value<'a>(headers: &'a str, name: &str) -> Option<&'a str> {
    headers.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name).then_some(value.trim())
    })
}
