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
    let _ = lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "更新 Docker API 版本缓存失败",
    )
    .map(|mut cache| cache.remove(&cache_key(config)));
}

pub fn invalidate_api_version_server_id(server_id: &str) {
    debug!(
        target: "shipyardx_lib::docker::client",
        "invalidating docker api version cache by server id; server_id={}",
        server_id
    );
    let _ = lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "更新 Docker API 版本缓存失败",
    )
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
    if let Some(version) = lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "读取 Docker API 版本缓存失败",
    )?
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
        .ok_or_else(|| AppError::internal("docker.version_missing", "Docker 未返回 API 版本信息"))?;
    lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "更新 Docker API 版本缓存失败",
    )?
    .insert(cache_key(config), version.clone());
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
    serde_json::to_string_pretty(value).map_err(|e| {
        AppError::wrap(
            "docker.response_format_failed",
            AppErrorKind::Internal,
            "格式化 JSON 失败",
            e,
        )
    })
}

pub fn map_bollard_error(error: BollardError) -> AppError {
    match error {
        BollardError::DockerResponseServerError { status_code, message } => AppError::new(
            format!("docker.api_http_{status_code}"),
            match status_code {
                400 => AppErrorKind::Validation,
                401 => AppErrorKind::Auth,
                403 => AppErrorKind::Permission,
                404 => AppErrorKind::NotFound,
                409 => AppErrorKind::Conflict,
                408 | 504 => AppErrorKind::Timeout,
                500..=599 => AppErrorKind::Unavailable,
                _ => AppErrorKind::Internal,
            },
            if (400..500).contains(&status_code) {
                "Docker API 请求无效"
            } else if (500..600).contains(&status_code) {
                "Docker 服务暂时不可用"
            } else {
                "Docker API 请求失败"
            },
        )
        .with_detail(if message.trim().is_empty() {
            format!("HTTP {status_code}")
        } else {
            message
        })
        .retryable(status_code >= 500 || status_code == 429),
        BollardError::RequestTimeoutError => {
            AppError::timeout("docker.request_timeout", "Docker 请求超时").retryable(true)
        }
        BollardError::DockerStreamError { error } => {
            AppError::unavailable("docker.stream_error", "Docker 流式请求失败")
                .with_detail(error)
                .retryable(true)
        }
        other => AppError::unavailable("docker.request_failed", "Docker 请求失败")
            .with_detail(other.to_string())
            .retryable(true),
    }
}
