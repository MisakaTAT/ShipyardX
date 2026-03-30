pub mod stats;

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;

use crate::core::models::{DockerContainer, DockerImage, ServerConfig};
use crate::core::ssh::ssh_exec;

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

pub fn resolve_api_version(config: &ServerConfig) -> Result<String, String> {
    let key = cache_key(config);
    if let Some(ver) = api_version_cache().lock().unwrap().get(&key) {
        return Ok(ver.clone());
    }
    let cmd = "curl -s --unix-socket /var/run/docker.sock 'http://localhost/version'";
    let resp = ssh_exec(config, cmd)?;
    let v: serde_json::Value = serde_json::from_str(resp.trim()).map_err(|e| format!("解析 Docker 版本失败: {}", e))?;
    let api_ver = v["ApiVersion"]
        .as_str()
        .ok_or_else(|| "无法获取 Docker API 版本".to_string())?
        .to_string();
    api_version_cache().lock().unwrap().insert(key, api_ver.clone());
    Ok(api_ver)
}

#[derive(Deserialize)]
pub(crate) struct ApiContainer {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Names")]
    pub names: Vec<String>,
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "State")]
    pub state: String,
    #[serde(rename = "Status")]
    pub status: String,
    #[serde(rename = "Ports")]
    pub ports: Vec<ApiPort>,
    #[serde(rename = "Created")]
    pub created: i64,
}

#[derive(Deserialize)]
pub(crate) struct ApiPort {
    #[serde(rename = "IP")]
    pub ip: Option<String>,
    #[serde(rename = "PrivatePort")]
    pub private_port: u16,
    #[serde(rename = "PublicPort")]
    pub public_port: Option<u16>,
    #[serde(rename = "Type")]
    pub port_type: String,
}

#[derive(Deserialize)]
pub(crate) struct ApiImage {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "RepoTags")]
    pub repo_tags: Option<Vec<String>>,
    #[serde(rename = "Size")]
    pub size: i64,
    #[serde(rename = "Created")]
    pub created: i64,
}

pub fn docker_get(config: &ServerConfig, path: &str) -> Result<String, String> {
    let ver = resolve_api_version(config)?;
    let cmd = format!(
        "curl -s --unix-socket /var/run/docker.sock 'http://localhost/v{}{}'",
        ver, path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)?;
    Ok(resp)
}

pub fn docker_post(config: &ServerConfig, path: &str) -> Result<(), String> {
    let ver = resolve_api_version(config)?;
    let cmd = format!(
        "curl -s -X POST --unix-socket /var/run/docker.sock 'http://localhost/v{}{}'",
        ver, path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

pub fn docker_delete(config: &ServerConfig, path: &str) -> Result<(), String> {
    let ver = resolve_api_version(config)?;
    let cmd = format!(
        "curl -s -X DELETE --unix-socket /var/run/docker.sock 'http://localhost/v{}{}'",
        ver, path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

pub fn check_docker_error(resp: &str) -> Result<(), String> {
    let trimmed = resp.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
            return Err(msg.to_string());
        }
    }
    Ok(())
}

pub fn format_ports(ports: &[ApiPort]) -> String {
    ports
        .iter()
        .filter_map(|p| {
            p.public_port.map(|pub_port| {
                let ip = p.ip.as_deref().unwrap_or("0.0.0.0");
                format!("{}:{}->{}/{}", ip, pub_port, p.private_port, p.port_type)
            })
        })
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn format_bytes(bytes: i64) -> String {
    const MB: f64 = 1_048_576.0;
    const GB: f64 = 1_073_741_824.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.1} MB", b / MB)
    } else {
        format!("{:.1} KB", b / 1024.0)
    }
}

pub fn api_container_to_dto(c: ApiContainer) -> DockerContainer {
    let name = c
        .names
        .first()
        .map(|n| n.trim_start_matches('/').to_string())
        .unwrap_or_default();
    DockerContainer {
        id: c.id[..12.min(c.id.len())].to_string(),
        name,
        image: c.image,
        state: c.state,
        status: c.status,
        ports: format_ports(&c.ports),
        created_ts: c.created,
    }
}

pub fn api_image_to_dto(img: ApiImage) -> DockerImage {
    let (repository, tag) = img
        .repo_tags
        .as_deref()
        .and_then(|tags| tags.iter().find(|t| *t != "<none>:<none>"))
        .map(|t| {
            t.rfind(':')
                .map(|i| (t[..i].to_string(), t[i + 1..].to_string()))
                .unwrap_or_else(|| (t.clone(), "latest".to_string()))
        })
        .unwrap_or_else(|| ("<none>".to_string(), "<none>".to_string()));

    DockerImage {
        id: img.id.clone(),
        repository,
        tag,
        size: format_bytes(img.size),
        created_ts: img.created,
    }
}
