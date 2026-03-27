pub mod stats;

use serde::Deserialize;

use crate::core::models::{DockerContainer, DockerImage, ServerConfig};
use crate::core::ssh::ssh_exec;

// ── Docker REST API 内部类型 ──────────────────────────────────

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

// ── Docker API 辅助函数 ──────────────────────────────────────

pub fn docker_get(config: &ServerConfig, path: &str) -> Result<String, String> {
    let cmd = format!(
        "curl -s --unix-socket /var/run/docker.sock 'http://localhost{}'",
        path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)?;
    Ok(resp)
}

pub fn docker_post(config: &ServerConfig, path: &str) -> Result<(), String> {
    let cmd = format!(
        "curl -s -X POST --unix-socket /var/run/docker.sock 'http://localhost{}'",
        path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

pub fn docker_delete(config: &ServerConfig, path: &str) -> Result<(), String> {
    let cmd = format!(
        "curl -s -X DELETE --unix-socket /var/run/docker.sock 'http://localhost{}'",
        path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

/// 解析 Docker API 结构化错误 `{"message": "..."}`
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

// ── 格式化工具 ──────────────────────────────────────────────

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

pub fn time_ago(ts: i64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let diff = now.saturating_sub(ts);
    match diff {
        0..=59 => "刚刚".to_string(),
        60..=3599 => format!("{} 分钟前", diff / 60),
        3600..=86399 => format!("{} 小时前", diff / 3600),
        86400..=2591999 => format!("{} 天前", diff / 86400),
        _ => format!("{} 个月前", diff / 2592000),
    }
}

// ── DTO 转换 ───────────────────────────────────────────────

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
        created_at: time_ago(c.created),
        running_for: time_ago(c.created),
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
        created_at: time_ago(img.created),
        created_since: time_ago(img.created),
    }
}
