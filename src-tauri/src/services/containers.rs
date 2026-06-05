use std::collections::HashMap;

use tauri::State;

use crate::contracts::docker_api::container::{
    ContainerCreate, ContainerCreateHostConfig, ContainerCreatePortBinding, ContainerCreateResponse,
    ContainerCreateRestartPolicy, ContainerNetworkingConfig, ContainerSummary, EndpointIpamConfig, EndpointSettings,
};
use crate::contracts::frontend::container::{Container, RunContainer};
use crate::docker::client::{
    docker_delete_async, docker_get_async, docker_post_async, docker_post_json_response_async, docker_stream_async,
    pretty_json_response,
};
use crate::docker::mapping::api_container_to_dto;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, get_server_config};
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Container>> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, "/containers/json?all=1").await?;
    let mut api: Vec<ContainerSummary> = serde_json::from_str(&resp).map_err(|e| {
        AppError::internal("container.list_parse_failed", "解析容器列表失败").with_detail(format!(
            "{} — 原始响应: {}",
            e,
            &resp[..resp.len().min(200)]
        ))
    })?;
    sort_by_created_desc_then_id(&mut api, |x| x.created, |x| x.id.clone());
    Ok(api.into_iter().map(api_container_to_dto).collect())
}

pub async fn start_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    docker_post_async(&server, &format!("/containers/{}/start", container_id)).await
}

pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    docker_post_async(&server, &format!("/containers/{}/stop", container_id)).await
}

pub async fn restart_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    docker_post_async(&server, &format!("/containers/{}/restart", container_id)).await
}

pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let server = get_server_config(&state, &server_id)?;
    docker_delete_async(&server, &format!("/containers/{}?force={}", container_id, force)).await
}

pub async fn inspect_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let resp = docker_get_async(&server, &format!("/containers/{}/json", container_id)).await?;
    pretty_json_response(&resp)
}

pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let ts = if timestamps { "&timestamps=1" } else { "" };
    let path = format!(
        "/containers/{}/logs?stdout=1&stderr=1&tail={}&follow=0{}",
        container_id, tail, ts
    );
    let mut stream = docker_stream_async(&server, &path).await?;
    let mut raw = Vec::new();
    while let Some(chunk) = stream.next_chunk().await? {
        raw.extend_from_slice(&chunk);
    }
    Ok(demux_log_stream(&raw))
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

fn labels_lines_to_map(lines: &[String]) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for line in lines {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let Some(eq) = t.find('=') else {
            continue;
        };
        let k = t[..eq].trim();
        if k.is_empty() {
            continue;
        }
        m.insert(k.to_string(), t[eq + 1..].trim().to_string());
    }
    m
}

fn build_run_container_body(params: &RunContainer) -> ContainerCreate {
    let image = params.image.trim().to_string();

    let env: Vec<String> = params
        .env
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let labels = labels_lines_to_map(&params.labels);

    let ipv4 = params.ipv4_address.trim();
    let ipv6 = params.ipv6_address.trim();

    let net = params.network.trim();
    let is_user_defined_network = !net.is_empty() && !matches!(net, "bridge" | "host" | "none" | "default");

    let mut exposed_ports: HashMap<String, serde_json::Value> = HashMap::new();
    let mut port_bindings: HashMap<String, Vec<ContainerCreatePortBinding>> = HashMap::new();

    for p in &params.ports {
        let proto = p.protocol.trim().to_lowercase();
        let key = format!("{}/{}", p.container_port, proto);
        exposed_ports.insert(key.clone(), serde_json::json!({}));
        let host_port_str = match p.host_port {
            None | Some(0) => String::new(),
            Some(hp) => hp.to_string(),
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
        let bind = if v.read_only {
            format!("{host}:{ctr}:ro")
        } else {
            format!("{host}:{ctr}")
        };
        binds.push(bind);
    }

    let rp = params.restart_policy.trim().to_lowercase().replace('_', "-");
    let max_retry = if rp == "on-failure" {
        params.restart_max_retry.unwrap_or(0)
    } else {
        0
    };
    let policy_name = if rp.is_empty() { "no".to_string() } else { rp };

    let cmd = if params.command.is_empty() {
        None
    } else {
        Some(params.command.clone())
    };
    let entrypoint = if params.entrypoint.is_empty() {
        None
    } else {
        Some(params.entrypoint.clone())
    };

    let mut nano_cpus: i64 = 0;
    if params.cpu_quota_cores > 0.0 {
        let n = (params.cpu_quota_cores * 1_000_000_000f64).round() as i64;
        if n > 0 {
            nano_cpus = n;
        }
    }

    let memory: i64 = if params.memory_mb > 0 {
        (params.memory_mb as i64).saturating_mul(1024 * 1024)
    } else {
        0
    };

    let cpu_shares: i64 = if params.cpu_shares > 0 {
        params.cpu_shares as i64
    } else {
        0
    };

    let networking_config = if is_user_defined_network {
        let ipam = if ipv4.is_empty() && ipv6.is_empty() {
            None
        } else {
            Some(EndpointIpamConfig {
                ipv4_address: ipv4.to_string(),
                ipv6_address: ipv6.to_string(),
            })
        };
        let mut endpoints = HashMap::new();
        endpoints.insert(net.to_string(), EndpointSettings { ipam_config: ipam });
        Some(ContainerNetworkingConfig {
            endpoints_config: endpoints,
        })
    } else {
        None
    };

    ContainerCreate {
        image,
        env,
        cmd,
        entrypoint,
        tty: params.tty,
        open_stdin: params.open_stdin,
        attach_stdin: params.open_stdin,
        attach_stdout: true,
        attach_stderr: true,
        labels,
        exposed_ports,
        host_config: ContainerCreateHostConfig {
            port_bindings,
            publish_all_ports: params.publish_all_ports,
            binds,
            network_mode: net.to_string(),
            restart_policy: ContainerCreateRestartPolicy {
                name: policy_name,
                maximum_retry_count: max_retry,
            },
            auto_remove: params.auto_remove,
            privileged: params.privileged,
            cpu_shares,
            nano_cpus,
            memory,
        },
        networking_config,
    }
}

pub async fn run_container(server_id: String, params: RunContainer, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let body = build_run_container_body(&params);
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

    let raw = docker_post_json_response_async(&server, &path, &body).await?;

    let created: ContainerCreateResponse = serde_json::from_str(&raw).map_err(|e| {
        AppError::internal("container.create_response_parse_failed", "解析创建容器响应失败").with_detail(format!(
            "{} — {}",
            e,
            &raw.chars().take(120).collect::<String>()
        ))
    })?;

    let id = created.id.trim();
    if id.is_empty() {
        return Err(AppError::internal(
            "container.id_missing",
            "创建容器成功但未返回容器 ID",
        ));
    }

    docker_post_async(&server, &format!("/containers/{id}/start")).await?;

    Ok(id.to_string())
}
