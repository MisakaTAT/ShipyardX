use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use hyper::Method;
use serde::Serialize;

use crate::docker::transport::{open_stream, request_empty, request_json_body_text, request_text};
use crate::error::{AppError, AppResult};
use crate::models::app::server::ServerConfig;
use crate::models::docker::common::DockerVersion;

fn api_version_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(config: &ServerConfig) -> String {
    format!("{}@{}:{}", config.username, config.host, config.port)
}

pub fn invalidate_api_version(config: &ServerConfig) {
    api_version_cache().lock().unwrap().remove(&cache_key(config));
}

pub async fn resolve_api_version_async(config: &ServerConfig) -> AppResult<String> {
    let key = cache_key(config);
    if let Some(ver) = api_version_cache().lock().unwrap().get(&key) {
        return Ok(ver.clone());
    }

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
    api_version_cache().lock().unwrap().insert(key, api_ver.clone());
    Ok(api_ver)
}

fn docker_api_path(ver: &str, path: &str) -> String {
    format!("/v{}{}", ver, path)
}

pub async fn docker_get_async(config: &ServerConfig, path: &str) -> AppResult<String> {
    let ver = resolve_api_version_async(config).await?;
    request_text(config, Method::GET, &docker_api_path(&ver, path)).await
}

pub async fn docker_post_async(config: &ServerConfig, path: &str) -> AppResult<()> {
    let ver = resolve_api_version_async(config).await?;
    request_empty(config, Method::POST, &docker_api_path(&ver, path)).await
}

pub async fn docker_post_json_async<T: Serialize>(config: &ServerConfig, path: &str, body: &T) -> AppResult<()> {
    let ver = resolve_api_version_async(config).await?;
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

pub async fn docker_post_json_response_async<T: Serialize>(
    config: &ServerConfig,
    path: &str,
    body: &T,
) -> AppResult<String> {
    let ver = resolve_api_version_async(config).await?;
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

pub async fn docker_delete_async(config: &ServerConfig, path: &str) -> AppResult<()> {
    let ver = resolve_api_version_async(config).await?;
    request_empty(config, Method::DELETE, &docker_api_path(&ver, path)).await
}

pub async fn docker_stream_async(
    config: &ServerConfig,
    path: &str,
) -> AppResult<crate::docker::transport::DockerStreamResponse> {
    let ver = resolve_api_version_async(config).await?;
    open_stream(config, Method::GET, &docker_api_path(&ver, path)).await
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
