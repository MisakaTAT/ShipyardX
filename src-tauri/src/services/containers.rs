use std::collections::HashMap;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tauri::State;

use crate::docker::client::{
    docker_delete, docker_get, docker_post, docker_post_json_response, pretty_json_response, resolve_api_version,
};
use crate::docker::mapping::api_container_to_dto;
use crate::models::app::container::{Container, RunContainer};
use crate::models::docker::container::{
    ContainerCreate, ContainerCreateHostConfig, ContainerCreatePortBinding, ContainerCreateResponse,
    ContainerCreateRestartPolicy, ContainerSummary,
};
use crate::ssh::exec::ssh_exec;
use crate::state::{AppState, get_server_config};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> Result<Vec<Container>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/containers/json?all=1")?;
        let mut api: Vec<ContainerSummary> = serde_json::from_str(&resp)
            .map_err(|e| format!("解析容器列表失败: {} — 原始响应: {}", e, &resp[..resp.len().min(200)]))?;
        sort_by_created_desc_then_id(&mut api, |x| x.created, |x| x.id.clone());
        Ok(api.into_iter().map(api_container_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn start_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post(&server, &format!("/containers/{}/start", container_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post(&server, &format!("/containers/{}/stop", container_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn restart_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || docker_post(&server, &format!("/containers/{}/restart", container_id)))
        .await
        .map_err(|e| e.to_string())?
}

pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_delete(&server, &format!("/containers/{}?force={}", container_id, force))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn inspect_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, &format!("/containers/{}/json", container_id))?;
        pretty_json_response(&resp)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let ver = resolve_api_version(&server)?;
        let ts = if timestamps { "&timestamps=1" } else { "" };
        let cmd = format!(
            "curl -s --unix-socket /var/run/docker.sock \
            'http://localhost/v{}/containers/{}/logs?stdout=1&stderr=1&tail={}&follow=0{}' | base64",
            ver, container_id, tail, ts
        );
        let b64 = ssh_exec(&server, &cmd)?;
        let clean: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
        let raw = BASE64.decode(clean).map_err(|e| format!("base64 解码失败: {}", e))?;
        Ok(demux_log_stream(&raw))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn demux_log_stream(data: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0usize;
    while i + 8 <= data.len() {
        let stream_type = data[i];
        let size = u32::from_be_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]) as usize;
        i += 8;
        if i + size > data.len() {
            break;
        }
        if stream_type <= 2 {
            out.push_str(&String::from_utf8_lossy(&data[i..i + size]));
        }
        i += size;
    }
    if out.is_empty() && !data.is_empty() {
        out = String::from_utf8_lossy(data).to_string();
    }
    out
}

fn validate_container_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("容器名称不能为空".to_string());
    }
    if name.len() > 255 {
        return Err("容器名称过长".to_string());
    }
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if !ok {
        return Err("容器名称仅允许字母、数字、下划线、连字符和点号".to_string());
    }
    Ok(())
}

fn build_run_container_body(params: &RunContainer) -> Result<ContainerCreate, String> {
    let image = params.image.trim();
    if image.is_empty() {
        return Err("镜像不能为空".to_string());
    }

    if let Some(ref n) = params.name {
        let t = n.trim();
        if !t.is_empty() {
            validate_container_name(t)?;
        }
    }

    let env: Vec<String> = params
        .env
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    for line in &env {
        if !line.contains('=') {
            return Err(format!("环境变量须为 KEY=value 格式: {}", line));
        }
    }

    let mut exposed_ports: HashMap<String, serde_json::Value> = HashMap::new();
    let mut port_bindings: HashMap<String, Vec<ContainerCreatePortBinding>> = HashMap::new();

    for p in &params.ports {
        if p.container_port == 0 {
            return Err("容器端口无效".to_string());
        }
        let proto = p.protocol.trim().to_lowercase();
        if proto != "tcp" && proto != "udp" {
            return Err("端口协议仅支持 tcp 或 udp".to_string());
        }
        let key = format!("{}/{}", p.container_port, proto);
        exposed_ports.insert(key.clone(), serde_json::json!({}));
        let host_port_str = match p.host_port {
            None | Some(0) => String::new(),
            Some(hp) => {
                if hp > 65535 {
                    return Err("主机端口无效".to_string());
                }
                hp.to_string()
            }
        };
        port_bindings.insert(
            key,
            vec![ContainerCreatePortBinding {
                host_ip: String::new(),
                host_port: host_port_str,
            }],
        );
    }

    let mut binds: Vec<String> = Vec::new();
    for v in &params.volumes {
        let host = v.host_path.trim();
        let ctr = v.container_path.trim();
        if host.is_empty() || ctr.is_empty() {
            return Err("卷挂载的主机路径与容器路径均不能为空".to_string());
        }
        let bind = if v.read_only {
            format!("{host}:{ctr}:ro")
        } else {
            format!("{host}:{ctr}")
        };
        binds.push(bind);
    }

    let rp = params.restart_policy.trim().to_lowercase().replace('_', "-");
    let (policy_name, max_retry) = match rp.as_str() {
        "" | "no" => ("no", 0u32),
        "always" => ("always", 0u32),
        "unless-stopped" => ("unless-stopped", 0u32),
        "on-failure" => ("on-failure", params.restart_max_retry.unwrap_or(0)),
        _ => {
            return Err(format!(
                "不支持的重启策略: {}（可选: no, always, unless-stopped, on-failure）",
                params.restart_policy
            ));
        }
    };

    Ok(ContainerCreate {
        image: image.to_string(),
        env,
        exposed_ports,
        host_config: ContainerCreateHostConfig {
            port_bindings,
            binds,
            restart_policy: ContainerCreateRestartPolicy {
                name: policy_name.to_string(),
                maximum_retry_count: max_retry,
            },
        },
    })
}

pub async fn run_container(
    server_id: String,
    params: RunContainer,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let body = build_run_container_body(&params)?;
        let path = match &params.name {
            Some(n) => {
                let t = n.trim();
                if t.is_empty() {
                    "/containers/create".to_string()
                } else {
                    format!("/containers/create?name={t}")
                }
            }
            None => "/containers/create".to_string(),
        };

        let raw = docker_post_json_response(&server, &path, &body)?;

        let created: ContainerCreateResponse = serde_json::from_str(&raw).map_err(|e| {
            format!(
                "解析创建容器响应失败: {} — {}",
                e,
                &raw.chars().take(120).collect::<String>()
            )
        })?;

        let id = created.id.trim();
        if id.is_empty() {
            return Err("未返回容器 ID".to_string());
        }

        docker_post(&server, &format!("/containers/{id}/start"))?;

        Ok(id.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
