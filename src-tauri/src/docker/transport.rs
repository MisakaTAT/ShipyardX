use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::client::conn::http1;
use hyper::header::{CONTENT_TYPE, HOST};
use hyper::{Method, Request, StatusCode};
use hyper_util::rt::TokioIo;
use russh::client;

use crate::error::{AppError, AppErrorKind, AppResult};
use crate::models::app::server::ServerConfig;
use crate::models::docker::common::DockerError;
use crate::models::docker::system::DaemonConfig;
use crate::ssh::client::{SshClientHandler, connect, disconnect};
use crate::ssh::exec::ssh_exec_async;

const DEFAULT_DOCKER_HOST: &str = "unix:///var/run/docker.sock";
const READ_DAEMON_CONFIG_CMD: &str =
    "if [ -r /etc/docker/daemon.json ]; then cat /etc/docker/daemon.json; else echo '{}'; fi";

#[derive(Clone, Debug)]
pub enum DockerEndpoint {
    Unix { path: String },
    Tcp { host: String, port: u16 },
}

fn endpoint_cache() -> &'static Mutex<HashMap<String, DockerEndpoint>> {
    static CACHE: OnceLock<Mutex<HashMap<String, DockerEndpoint>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(config: &ServerConfig) -> String {
    format!("{}@{}:{}", config.username, config.host, config.port)
}

pub fn invalidate_docker_endpoint(config: &ServerConfig) {
    endpoint_cache().lock().unwrap().remove(&cache_key(config));
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

pub async fn resolve_docker_endpoint(config: &ServerConfig) -> AppResult<DockerEndpoint> {
    let key = cache_key(config);
    if let Some(endpoint) = endpoint_cache().lock().unwrap().get(&key) {
        return Ok(endpoint.clone());
    }

    let raw = ssh_exec_async(config, READ_DAEMON_CONFIG_CMD).await?;
    let cfg: DaemonConfig = serde_json::from_str(raw.trim()).unwrap_or_default();
    let host = cfg
        .hosts
        .as_deref()
        .and_then(|hosts| hosts.iter().find(|host| !host.trim().is_empty()))
        .map(|host| host.as_str())
        .unwrap_or(DEFAULT_DOCKER_HOST);
    let endpoint = parse_docker_host(host)?;
    endpoint_cache().lock().unwrap().insert(key, endpoint.clone());
    Ok(endpoint)
}

pub struct DockerStreamResponse {
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

async fn send_request(
    config: &ServerConfig,
    method: Method,
    path: &str,
    content_type: Option<&str>,
    body: Bytes,
) -> AppResult<DockerRawResponse> {
    let (mut handle, mut sender, connection_task) = open_http_sender(config).await?;
    let mut builder = Request::builder().method(method).uri(path).header(HOST, "localhost");
    if let Some(content_type) = content_type {
        builder = builder.header(CONTENT_TYPE, content_type);
    }

    let request = builder.body(Full::new(body)).map_err(|e| {
        AppError::internal("docker.request_build_failed", "构建 Docker HTTP 请求失败").with_detail(e.to_string())
    })?;

    let response = sender
        .send_request(request)
        .await
        .map_err(|e| map_transport_error("docker.request_send_failed", "发送 Docker HTTP 请求失败", e))?;

    let status = response.status();
    let body = response
        .into_body()
        .collect()
        .await
        .map_err(|e| map_transport_error("docker.response_read_failed", "读取 Docker HTTP 响应失败", e))?
        .to_bytes();

    drop(sender);
    disconnect(&mut handle).await;
    connection_task.abort();

    Ok(DockerRawResponse { status, body })
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

pub async fn open_stream(config: &ServerConfig, method: Method, path: &str) -> AppResult<DockerStreamResponse> {
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
