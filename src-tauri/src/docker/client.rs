use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use hyper::Method;
use log::debug;
use serde::Serialize;
use tokio::io::AsyncRead;

use crate::contracts::docker_api::common::DockerVersion;
use crate::contracts::frontend::server::ServerConfig;
use crate::docker::transport::{
    open_hijack, open_stream, request_empty, request_json_body_text, request_stream_body_text, request_text,
};
use crate::error::{AppError, AppResult};
use crate::state::lock_mutex;

const API_VERSION_CACHE_TTL: Duration = Duration::from_secs(300);

struct CacheEntry {
    value: String,
    fetched_at: Instant,
}

fn api_version_cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(config: &ServerConfig) -> String {
    format!("{}@{}:{}", config.username, config.host, config.port)
}

pub fn invalidate_api_version(config: &ServerConfig) {
    debug!(target: "shipyardx_lib::docker::client", "invalidating docker api version cache; server_id={} host={} port={}", config.id, config.host, config.port);
    let _ = lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "更新 Docker API 版本缓存失败",
    )
    .map(|mut cache| cache.remove(&cache_key(config)));
}

pub async fn resolve_api_version(config: &ServerConfig) -> AppResult<String> {
    let key = cache_key(config);
    if let Some(entry) = lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "读取 Docker API 版本缓存失败",
    )?
    .get(&key)
        && entry.fetched_at.elapsed() < API_VERSION_CACHE_TTL
    {
        debug!(target: "shipyardx_lib::docker::client", "docker api version cache hit; server_id={} api_version={}", config.id, entry.value);
        return Ok(entry.value.clone());
    }
    debug!(target: "shipyardx_lib::docker::client", "resolving docker api version; server_id={} host={} port={}", config.id, config.host, config.port);

    let resp = request_text(config, Method::GET, "/version").await?;
    let version: DockerVersion = serde_json::from_str(resp.trim()).map_err(|e| {
        AppError::wrap(
            "docker.version_parse_failed",
            crate::error::AppErrorKind::Internal,
            "解析 Docker 版本失败",
            e,
        )
    })?;

    let api_ver = version.api_version;
    lock_mutex(
        api_version_cache(),
        "docker.api_version_cache_lock_failed",
        "更新 Docker API 版本缓存失败",
    )?
    .insert(
        key,
        CacheEntry {
            value: api_ver.clone(),
            fetched_at: Instant::now(),
        },
    );
    debug!(target: "shipyardx_lib::docker::client", "resolved docker api version; server_id={} api_version={}", config.id, api_ver);
    Ok(api_ver)
}

fn docker_api_path(ver: &str, path: &str) -> String {
    format!("/v{}{}", ver, path)
}

pub async fn docker_get(config: &ServerConfig, path: &str) -> AppResult<String> {
    let ver = resolve_api_version(config).await?;
    request_text(config, Method::GET, &docker_api_path(&ver, path)).await
}

pub async fn docker_post(config: &ServerConfig, path: &str) -> AppResult<()> {
    let ver = resolve_api_version(config).await?;
    request_empty(config, Method::POST, &docker_api_path(&ver, path)).await
}

pub async fn docker_post_json<T: Serialize>(config: &ServerConfig, path: &str, body: &T) -> AppResult<()> {
    let ver = resolve_api_version(config).await?;
    let body = serde_json::to_vec(body).map_err(|e| {
        AppError::wrap(
            "docker.request_body_serialize_failed",
            crate::error::AppErrorKind::Internal,
            "序列化 Docker 请求体失败",
            e,
        )
    })?;

    request_json_body_text(config, Method::POST, &docker_api_path(&ver, path), body)
        .await
        .map(|_| ())
}

pub async fn docker_post_json_response<T: Serialize>(config: &ServerConfig, path: &str, body: &T) -> AppResult<String> {
    let ver = resolve_api_version(config).await?;
    let body = serde_json::to_vec(body).map_err(|e| {
        AppError::wrap(
            "docker.request_body_serialize_failed",
            crate::error::AppErrorKind::Internal,
            "序列化 Docker 请求体失败",
            e,
        )
    })?;

    request_json_body_text(config, Method::POST, &docker_api_path(&ver, path), body).await
}

pub async fn docker_post_stream_body_text<R>(
    config: &ServerConfig,
    path: &str,
    content_type: &str,
    content_length: u64,
    reader: R,
) -> AppResult<String>
where
    R: AsyncRead + Send + Sync + Unpin + 'static,
{
    let ver = resolve_api_version(config).await?;
    request_stream_body_text(
        config,
        Method::POST,
        &docker_api_path(&ver, path),
        content_type,
        content_length,
        reader,
    )
    .await
}

pub async fn docker_delete(config: &ServerConfig, path: &str) -> AppResult<()> {
    let ver = resolve_api_version(config).await?;
    request_empty(config, Method::DELETE, &docker_api_path(&ver, path)).await
}

pub async fn docker_stream(
    config: &ServerConfig,
    path: &str,
) -> AppResult<crate::docker::transport::DockerStreamResponse> {
    let ver = resolve_api_version(config).await?;
    open_stream(config, Method::GET, &docker_api_path(&ver, path)).await
}

pub async fn docker_post_stream(
    config: &ServerConfig,
    path: &str,
) -> AppResult<crate::docker::transport::DockerStreamResponse> {
    let ver = resolve_api_version(config).await?;
    open_stream(config, Method::POST, &docker_api_path(&ver, path)).await
}

pub async fn docker_post_json_hijack<T: Serialize>(
    config: &ServerConfig,
    path: &str,
    body: &T,
) -> AppResult<crate::docker::transport::DockerHijackConnection> {
    let ver = resolve_api_version(config).await?;
    let body = serde_json::to_vec(body).map_err(|e| {
        AppError::wrap(
            "docker.request_body_serialize_failed",
            crate::error::AppErrorKind::Internal,
            "序列化 Docker 请求体失败",
            e,
        )
    })?;

    open_hijack(config, Method::POST, &docker_api_path(&ver, path), body).await
}

pub fn pretty_json_response(raw: &str) -> AppResult<String> {
    let v: serde_json::Value = serde_json::from_str(raw.trim()).map_err(|e| {
        AppError::wrap(
            "docker.response_parse_failed",
            crate::error::AppErrorKind::Internal,
            "解析 JSON 失败",
            e,
        )
    })?;
    serde_json::to_string_pretty(&v).map_err(|e| {
        AppError::wrap(
            "docker.response_format_failed",
            crate::error::AppErrorKind::Internal,
            "格式化 JSON 失败",
            e,
        )
    })
}
