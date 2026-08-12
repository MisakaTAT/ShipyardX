use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use bollard::errors::Error as BollardError;
use bollard::{API_DEFAULT_VERSION, ClientVersion, Docker};
use log::debug;
use serde::Serialize;

use crate::config::timeouts::DOCKER_HTTP_REQUEST_TIMEOUT_SECS;
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppErrorKind, AppResult};
use crate::state::lock_mutex;

use super::transport;

fn api_version_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
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

pub fn invalidate_api_version(config: &ServerConfig) {
    debug!(
        target: "shipyardx_lib::docker::client",
        "invalidating docker api version cache; server_id={} host={} port={}",
        config.id,
        config.host,
        config.port
    );
    let _ = lock_mutex(api_version_cache(), "docker.api_version_cache_lock_failed")
        .map(|mut cache| cache.remove(&cache_key(config)));
}

pub fn invalidate_api_version_server_id(server_id: &str) {
    debug!(
        target: "shipyardx_lib::docker::client",
        "invalidating docker api version cache by server id; server_id={}",
        server_id
    );
    let _ = lock_mutex(api_version_cache(), "docker.api_version_cache_lock_failed")
        .map(|mut cache| cache.retain(|key, _| !key.starts_with(&format!("{server_id}|"))));
}

fn parse_client_version(raw: &str) -> Option<ClientVersion> {
    let (major, minor) = raw.split_once('.')?;
    Some(ClientVersion {
        major_version: major.parse().ok()?,
        minor_version: minor.parse().ok()?,
    })
}

fn build_docker(config: &ServerConfig, client_version: &ClientVersion) -> AppResult<Docker> {
    let config = config.clone();
    Docker::connect_with_custom_transport(
        move |req| {
            let config = config.clone();
            async move { transport::send_pooled_request(&config, req).await }
        },
        Some("http://localhost"),
        DOCKER_HTTP_REQUEST_TIMEOUT_SECS,
        client_version,
    )
    .map_err(map_bollard_error)
}

fn build_dedicated_docker(config: &ServerConfig, client_version: &ClientVersion) -> AppResult<Docker> {
    let config = config.clone();
    Docker::connect_with_custom_transport(
        move |req| {
            let config = config.clone();
            async move { transport::send_dedicated_request(&config, req).await }
        },
        Some("http://localhost"),
        DOCKER_HTTP_REQUEST_TIMEOUT_SECS,
        client_version,
    )
    .map_err(map_bollard_error)
}

pub async fn resolve_api_version(config: &ServerConfig) -> AppResult<String> {
    if let Some(version) = lock_mutex(api_version_cache(), "docker.api_version_cache_lock_failed")?
        .get(&cache_key(config))
        .cloned()
    {
        return Ok(version);
    }

    debug!(
        target: "shipyardx_lib::docker::client",
        "resolving docker api version; server_id={} host={} port={}",
        config.id,
        config.host,
        config.port
    );
    let docker = build_docker(config, API_DEFAULT_VERSION)?;
    let version = docker.version().await.map_err(map_bollard_error)?;
    let version = version
        .api_version
        .ok_or_else(|| AppError::internal("docker.version_missing"))?;
    lock_mutex(api_version_cache(), "docker.api_version_cache_lock_failed")?.insert(cache_key(config), version.clone());
    Ok(version)
}

pub async fn docker(config: &ServerConfig) -> AppResult<Docker> {
    let version = resolve_api_version(config).await?;
    let client_version = parse_client_version(&version).unwrap_or(*API_DEFAULT_VERSION);
    build_docker(config, &client_version)
}

pub async fn docker_streaming(config: &ServerConfig) -> AppResult<Docker> {
    let version = resolve_api_version(config).await?;
    let client_version = parse_client_version(&version).unwrap_or(*API_DEFAULT_VERSION);
    build_dedicated_docker(config, &client_version)
}

pub fn pretty_json<T: Serialize>(value: &T) -> AppResult<String> {
    serde_json::to_string_pretty(value)
        .map_err(|e| AppError::wrap("docker.response_format_failed", AppErrorKind::Internal, e))
}

/// HTTP 状态码原先直接拼进 code，会产生无法穷举的词条 key；按类别归三个固定 code，
/// 具体状态码以 param 形式带给文案。
fn docker_api_code(status_code: u16) -> &'static str {
    match status_code {
        400..=499 => "docker.api_client_error",
        500..=599 => "docker.api_server_error",
        _ => "docker.api_request_failed",
    }
}

fn docker_api_kind(status_code: u16) -> AppErrorKind {
    match status_code {
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

/// Docker HTTP 错误的统一构造：bollard 和自建 transport 两条路径都走这里，
/// 否则状态码分类、retryable 规则会各写一份、改的时候漏一处。
pub(crate) fn docker_api_error(status_code: u16, detail: Option<String>) -> AppError {
    AppError::new(docker_api_code(status_code), docker_api_kind(status_code))
        .param("status", status_code)
        .with_detail(detail.unwrap_or_else(|| format!("HTTP {status_code}")))
        .retryable(status_code >= 500 || status_code == 429)
}

pub fn map_bollard_error(error: BollardError) -> AppError {
    match error {
        BollardError::DockerResponseServerError { status_code, message } => {
            docker_api_error(status_code, (!message.trim().is_empty()).then_some(message))
        }
        BollardError::RequestTimeoutError => AppError::timeout("docker.request_timeout").retryable(true),
        BollardError::DockerStreamError { error } => AppError::unavailable("docker.stream_error")
            .with_detail(error)
            .retryable(true),
        other => AppError::unavailable("docker.request_failed")
            .with_detail(other.to_string())
            .retryable(true),
    }
}
