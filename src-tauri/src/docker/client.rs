use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::models::app::server::ServerConfig;
use crate::models::docker::common::{DockerError, DockerVersion};
use crate::ssh::exec::ssh_exec;

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

pub fn resolve_api_version(config: &ServerConfig) -> AppResult<String> {
    let key = cache_key(config);
    if let Some(ver) = api_version_cache().lock().unwrap().get(&key) {
        return Ok(ver.clone());
    }
    let cmd = "curl -s --unix-socket /var/run/docker.sock 'http://localhost/version'";
    let resp = ssh_exec(config, cmd)?;
    let v: DockerVersion = serde_json::from_str(resp.trim()).map_err(|e| {
        AppError::wrap(
            "docker.version_parse_failed",
            crate::error::AppErrorKind::Internal,
            "解析 Docker 版本失败",
            e,
        )
    })?;
    let api_ver = v.api_version;
    api_version_cache().lock().unwrap().insert(key, api_ver.clone());
    Ok(api_ver)
}

#[derive(Clone, Copy)]
enum CurlMethod {
    Get,
    Post,
    Delete,
}

impl CurlMethod {
    fn curl_flag(self) -> &'static str {
        match self {
            Self::Get => "",
            Self::Post => "-X POST ",
            Self::Delete => "-X DELETE ",
        }
    }
}

fn docker_sock_url(ver: &str, path: &str) -> String {
    format!("http://localhost/v{}{}", ver, path)
}

fn check_docker_error(resp: &str) -> AppResult<()> {
    let trimmed = resp.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if let Ok(v) = serde_json::from_str::<DockerError>(trimmed)
        && let Some(msg) = v.message
    {
        return Err(AppError::unavailable("docker.api_error", "Docker API 请求失败")
            .with_detail(msg)
            .retryable(true));
    }
    Ok(())
}

fn docker_curl(config: &ServerConfig, path: &str, method: CurlMethod) -> AppResult<String> {
    let ver = resolve_api_version(config)?;
    let url = docker_sock_url(&ver, path);
    let cmd = format!(
        "curl -s {}--unix-socket /var/run/docker.sock '{}'",
        method.curl_flag(),
        url
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)?;
    Ok(resp)
}

pub fn docker_get(config: &ServerConfig, path: &str) -> AppResult<String> {
    docker_curl(config, path, CurlMethod::Get)
}

pub fn docker_post(config: &ServerConfig, path: &str) -> AppResult<()> {
    docker_curl(config, path, CurlMethod::Post).map(|_| ())
}

pub fn docker_post_json<T: Serialize>(config: &ServerConfig, path: &str, body: &T) -> AppResult<()> {
    let body_str = serde_json::to_string(body).map_err(|e| {
        AppError::wrap(
            "docker.request_body_serialize_failed",
            crate::error::AppErrorKind::Internal,
            "序列化 Docker 请求体失败",
            e,
        )
    })?;
    let ver = resolve_api_version(config)?;
    let url = docker_sock_url(&ver, path);
    let b64 = STANDARD.encode(body_str);
    let cmd = format!(
        "printf '%s' '{}' | base64 -d | curl -s -X POST -H 'Content-Type: application/json' --data-binary @- --unix-socket /var/run/docker.sock '{}'",
        b64, url
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

pub fn docker_post_json_response<T: Serialize>(config: &ServerConfig, path: &str, body: &T) -> AppResult<String> {
    let body_str = serde_json::to_string(body).map_err(|e| {
        AppError::wrap(
            "docker.request_body_serialize_failed",
            crate::error::AppErrorKind::Internal,
            "序列化 Docker 请求体失败",
            e,
        )
    })?;
    let ver = resolve_api_version(config)?;
    let url = docker_sock_url(&ver, path);
    let b64 = STANDARD.encode(body_str);
    let cmd = format!(
        "printf '%s' '{}' | base64 -d | curl -s -X POST -H 'Content-Type: application/json' --data-binary @- --unix-socket /var/run/docker.sock '{}'",
        b64, url
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)?;
    Ok(resp.trim().to_string())
}

pub fn docker_delete(config: &ServerConfig, path: &str) -> AppResult<()> {
    docker_curl(config, path, CurlMethod::Delete).map(|_| ())
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
