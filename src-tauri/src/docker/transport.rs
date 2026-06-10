use std::collections::HashMap;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use bollard::BollardRequest;
use bollard::errors::Error as BollardError;
use bytes::Bytes;
use futures_util::Stream;
use http_body_util::{Full, StreamBody};
use hyper::Response;
use hyper::body::{Frame, Incoming};
use hyper::client::conn::http1;
use hyper::header::{HOST, HeaderValue};
use hyper::http::uri::PathAndQuery;
use hyper_util::rt::TokioIo;
use log::{debug, warn};
use russh::ChannelStream;

use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::scripts::DOCKER_READ_DAEMON_CONFIG_SH;
use crate::ssh::exec::ssh_exec;
use crate::ssh::pool;
use crate::state::lock_mutex;

const DEFAULT_DOCKER_HOST: &str = "unix:///var/run/docker.sock";
const HTTP_POOL_SIZE: usize = 3;

#[derive(Clone, Debug)]
pub(crate) enum DockerEndpoint {
    Unix { path: String },
    Tcp { host: String, port: u16 },
}

#[derive(Default, serde::Deserialize, serde::Serialize)]
#[serde(default)]
struct DaemonConfig {
    #[serde(rename = "hosts", skip_serializing_if = "Option::is_none")]
    hosts: Option<Vec<String>>,
}

type BollardBody = http_body_util::Either<
    Full<Bytes>,
    StreamBody<Pin<Box<dyn Stream<Item = Result<Frame<Bytes>, std::io::Error>> + Send>>>,
>;

struct PooledHttpConnection {
    sender: hyper::client::conn::http1::SendRequest<BollardBody>,
    connection_task: tokio::task::JoinHandle<()>,
}

type HttpPoolEntry = Arc<tokio::sync::Mutex<Option<PooledHttpConnection>>>;

struct HttpPoolState {
    slots: Vec<HttpPoolEntry>,
    next: AtomicUsize,
}

fn endpoint_cache() -> &'static Mutex<HashMap<String, DockerEndpoint>> {
    static CACHE: OnceLock<Mutex<HashMap<String, DockerEndpoint>>> = OnceLock::new();
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
    debug!(
        target: "shipyardx_lib::docker::transport",
        "invalidating docker endpoint state; server_id={} host={} port={}",
        config.id,
        config.host,
        config.port
    );
    let _ = lock_mutex(
        endpoint_cache(),
        "docker.endpoint_cache_lock_failed",
        "更新 Docker endpoint 缓存失败",
    )
    .map(|mut cache| cache.remove(&cache_key(config)));
    invalidate_pooled_http(config).await;
}

async fn invalidate_pooled_http(config: &ServerConfig) {
    debug!(
        target: "shipyardx_lib::docker::transport",
        "invalidating pooled docker http connections; server_id={}",
        config.id
    );
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
    debug!(
        target: "shipyardx_lib::docker::transport",
        "invalidating pooled docker http connections by server id; server_id={}",
        server_id
    );
    let _ = lock_mutex(
        endpoint_cache(),
        "docker.endpoint_cache_lock_failed",
        "更新 Docker endpoint 缓存失败",
    )
    .map(|mut cache| cache.retain(|key, _| !key.starts_with(&format!("{server_id}|"))));
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
    if let Some(endpoint) = lock_mutex(
        endpoint_cache(),
        "docker.endpoint_cache_lock_failed",
        "读取 Docker endpoint 缓存失败",
    )?
    .get(&cache_key(config))
    .cloned()
    {
        return Ok(endpoint);
    }

    debug!(
        target: "shipyardx_lib::docker::transport",
        "resolving docker endpoint; server_id={} host={} port={}",
        config.id,
        config.host,
        config.port
    );

    let raw = match pool::exec(config, DOCKER_READ_DAEMON_CONFIG_SH).await {
        Ok(raw) => raw,
        Err(_) => ssh_exec(config, DOCKER_READ_DAEMON_CONFIG_SH).await?,
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
    .insert(cache_key(config), endpoint.clone());
    debug!(
        target: "shipyardx_lib::docker::transport",
        "resolved docker endpoint; server_id={} endpoint={:?}",
        config.id,
        endpoint
    );
    Ok(endpoint)
}

async fn open_direct_channel(config: &ServerConfig) -> AppResult<ChannelStream<russh::client::Msg>> {
    let endpoint = resolve_docker_endpoint(config).await?;
    match endpoint {
        DockerEndpoint::Unix { path } => pool::open_direct_streamlocal(config, path)
            .await?
            .map(|channel| channel.into_stream())
            .map_err(|e| {
                AppError::unavailable("docker.socket_open_failed", "打开 Docker Socket 通道失败")
                    .with_detail(e.to_string())
                    .retryable(true)
            }),
        DockerEndpoint::Tcp { host, port } => pool::open_direct_tcpip(config, host, port)
            .await?
            .map(|channel| channel.into_stream())
            .map_err(|e| {
                AppError::unavailable("docker.tcp_open_failed", "打开 Docker TCP 通道失败")
                    .with_detail(e.to_string())
                    .retryable(true)
            }),
    }
}

async fn open_pooled_http_sender(config: &ServerConfig) -> AppResult<PooledHttpConnection> {
    debug!(
        target: "shipyardx_lib::docker::transport",
        "opening pooled docker http sender; server_id={}",
        config.id
    );
    let channel = open_direct_channel(config).await?;
    let stream = TokioIo::new(channel);
    let (sender, connection) = http1::handshake(stream).await.map_err(|e| {
        AppError::unavailable("docker.http_handshake_failed", "建立 Docker HTTP 连接失败")
            .with_detail(e.to_string())
            .retryable(true)
    })?;
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

fn as_bollard_error(error: AppError) -> BollardError {
    std::io::Error::other(error.detail.unwrap_or(error.message)).into()
}

fn normalize_request(mut request: BollardRequest) -> Result<BollardRequest, BollardError> {
    let path_and_query = request
        .uri()
        .path_and_query()
        .cloned()
        .unwrap_or_else(|| PathAndQuery::from_static("/"));
    *request.uri_mut() = path_and_query.into();
    request
        .headers_mut()
        .insert(HOST, HeaderValue::from_static("localhost"));
    Ok(request)
}

pub(crate) async fn send_dedicated_request(
    config: &ServerConfig,
    request: BollardRequest,
) -> Result<Response<Incoming>, BollardError> {
    let request = normalize_request(request)?;
    let channel = open_direct_channel(config).await.map_err(as_bollard_error)?;
    let stream = TokioIo::new(channel);
    let (mut sender, connection) = http1::handshake(stream).await?;
    tokio::spawn(async move {
        let _ = connection.await;
    });
    sender.send_request(request).await.map_err(Into::into)
}

pub(crate) async fn send_pooled_request(
    config: &ServerConfig,
    request: BollardRequest,
) -> Result<Response<Incoming>, BollardError> {
    let request = normalize_request(request)?;
    let state = get_http_pool_state(config);
    let index = state.next.fetch_add(1, Ordering::Relaxed) % state.slots.len();
    debug!(
        target: "shipyardx_lib::docker::transport",
        "sending pooled docker request; server_id={} slot={} path={}",
        config.id,
        index,
        request.uri().path()
    );
    let entry = state.slots[index].clone();
    let mut pooled = entry.lock().await;
    let needs_connect = pooled
        .as_ref()
        .map(|connection| connection.sender.is_closed() || connection.connection_task.is_finished())
        .unwrap_or(true);
    if needs_connect {
        debug!(
            target: "shipyardx_lib::docker::transport",
            "pooled docker connection refresh required; server_id={} slot={}",
            config.id,
            index
        );
        if let Some(connection) = pooled.take() {
            connection.connection_task.abort();
        }
        *pooled = Some(open_pooled_http_sender(config).await.map_err(as_bollard_error)?);
    }

    let ready_result = {
        let connection = pooled.as_mut().ok_or_else(|| {
            as_bollard_error(
                AppError::internal(
                    "docker.pooled_connection_missing",
                    "Docker HTTP 连接池状态异常：连接缺失",
                )
                .retryable(true),
            )
        })?;
        connection.sender.ready().await
    };
    if let Err(error) = ready_result {
        warn!(
            target: "shipyardx_lib::docker::transport",
            "docker pooled sender not ready; server_id={} slot={} error={}",
            config.id,
            index,
            error
        );
        if let Some(connection) = pooled.take() {
            connection.connection_task.abort();
        }
        return Err(error.into());
    }

    let response = {
        let connection = pooled.as_mut().ok_or_else(|| {
            as_bollard_error(
                AppError::internal(
                    "docker.pooled_connection_missing",
                    "Docker HTTP 连接池状态异常：连接缺失",
                )
                .retryable(true),
            )
        })?;
        connection.sender.send_request(request).await
    };
    match response {
        Ok(response) => Ok(response),
        Err(error) => {
            warn!(
                target: "shipyardx_lib::docker::transport",
                "docker request send failed; server_id={} slot={} error={}",
                config.id,
                index,
                error
            );
            if let Some(connection) = pooled.take() {
                connection.connection_task.abort();
            }
            Err(error.into())
        }
    }
}
