use std::collections::HashMap;
use std::str::FromStr;

use bollard::container::LogOutput;
use bollard::models::{
    ContainerCreateBody, EndpointIpamConfig, EndpointSettings, HostConfig, NetworkingConfig, RestartPolicy,
    RestartPolicyNameEnum,
};
use bollard::query_parameters::{
    CreateContainerOptionsBuilder, InspectContainerOptionsBuilder, ListContainersOptionsBuilder, LogsOptionsBuilder,
    PruneContainersOptions, RemoveContainerOptions, RestartContainerOptions, StartContainerOptions,
    StopContainerOptions,
};
use futures_util::StreamExt;
use log::{debug, info};
use tauri::State;

use crate::docker::client::{docker, docker_streaming, map_bollard_error, pretty_json};
use crate::docker::mapping::api_container_to_dto;
use crate::dto::cleanup::CleanupResult;
use crate::dto::container::{Container, RunContainer};
use crate::error::AppResult;
use crate::state::{AppState, get_server_config};
use crate::utils::formatting::format_bytes_u64;
use crate::utils::sort::sort_by_created_desc_then_id;

pub async fn list_containers(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<Container>> {
    debug!(target: "shipyardx_lib::services::containers", "listing containers; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let docker = docker_streaming(&server).await?;
    let options = ListContainersOptionsBuilder::default().all(true).build();
    let mut api = docker.list_containers(Some(options)).await.map_err(map_bollard_error)?;
    sort_by_created_desc_then_id(
        &mut api,
        |x| x.created.unwrap_or_default(),
        |x| x.id.clone().unwrap_or_default(),
    );
    let containers: Vec<Container> = api.into_iter().map(api_container_to_dto).collect();
    info!(target: "shipyardx_lib::services::containers", "listed containers; server_id={} count={}", server_id, containers.len());
    Ok(containers)
}

pub async fn start_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::containers", "starting container; server_id={} container_id={}", server_id, container_id);
    let server = get_server_config(&state, &server_id)?;
    docker(&server)
        .await?
        .start_container(&container_id, None::<StartContainerOptions>)
        .await
        .map_err(map_bollard_error)
}

pub async fn stop_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::containers", "stopping container; server_id={} container_id={}", server_id, container_id);
    let server = get_server_config(&state, &server_id)?;
    docker(&server)
        .await?
        .stop_container(&container_id, None::<StopContainerOptions>)
        .await
        .map_err(map_bollard_error)
}

pub async fn restart_container(server_id: String, container_id: String, state: State<'_, AppState>) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::containers", "restarting container; server_id={} container_id={}", server_id, container_id);
    let server = get_server_config(&state, &server_id)?;
    docker(&server)
        .await?
        .restart_container(&container_id, None::<RestartContainerOptions>)
        .await
        .map_err(map_bollard_error)
}

pub async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::containers", "removing container; server_id={} container_id={} force={}", server_id, container_id, force);
    let server = get_server_config(&state, &server_id)?;
    docker(&server)
        .await?
        .remove_container(
            &container_id,
            Some(RemoveContainerOptions {
                force,
                ..Default::default()
            }),
        )
        .await
        .map_err(map_bollard_error)
}

pub async fn prune_stopped_containers(server_id: String, state: State<'_, AppState>) -> AppResult<CleanupResult> {
    info!(target: "shipyardx_lib::services::containers", "pruning containers; server_id={}", server_id);
    let server = get_server_config(&state, &server_id)?;
    let response = docker(&server)
        .await?
        .prune_containers(None::<PruneContainersOptions>)
        .await
        .map_err(map_bollard_error)?;

    Ok(CleanupResult {
        deleted_count: response.containers_deleted.unwrap_or_default().len() as u32,
        reclaimed: format_bytes_u64(response.space_reclaimed.unwrap_or(0) as u64),
    })
}

pub async fn inspect_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    debug!(target: "shipyardx_lib::services::containers", "inspecting container; server_id={} container_id={}", server_id, container_id);
    let server = get_server_config(&state, &server_id)?;
    let options = InspectContainerOptionsBuilder::default().size(false).build();
    let response = docker(&server)
        .await?
        .inspect_container(&container_id, Some(options))
        .await
        .map_err(map_bollard_error)?;
    pretty_json(&response)
}

pub async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
) -> AppResult<String> {
    debug!(target: "shipyardx_lib::services::containers", "fetching container logs; server_id={} container_id={} tail={} timestamps={}", server_id, container_id, tail, timestamps);
    let server = get_server_config(&state, &server_id)?;
    let docker = docker(&server).await?;
    let options = LogsOptionsBuilder::default()
        .stdout(true)
        .stderr(true)
        .follow(false)
        .timestamps(timestamps)
        .tail(&tail.to_string())
        .build();
    let mut stream = docker.logs(&container_id, Some(options));
    let mut out = String::new();
    while let Some(item) = stream.next().await {
        let item = item.map_err(map_bollard_error)?;
        match item {
            LogOutput::StdOut { message }
            | LogOutput::StdErr { message }
            | LogOutput::StdIn { message }
            | LogOutput::Console { message } => out.push_str(&String::from_utf8_lossy(&message)),
        }
    }
    Ok(out)
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

fn build_run_container_body(params: &RunContainer) -> ContainerCreateBody {
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

    let mut exposed_ports = Vec::<String>::new();
    let mut port_bindings: HashMap<String, Option<Vec<bollard::models::PortBinding>>> = HashMap::new();
    for p in &params.ports {
        let proto = p.protocol.trim().to_lowercase();
        let key = format!("{}/{}", p.container_port, proto);
        exposed_ports.push(key.clone());
        let host_port = match p.host_port {
            None | Some(0) => None,
            Some(port) => Some(port.to_string()),
        };
        port_bindings.insert(
            key,
            Some(vec![bollard::models::PortBinding {
                host_ip: Some(String::new()),
                host_port,
            }]),
        );
    }

    let binds: Vec<String> = params
        .volumes
        .iter()
        .map(|v| {
            let host = v.host_path.trim();
            let ctr = v.container_path.trim();
            if v.read_only {
                format!("{host}:{ctr}:ro")
            } else {
                format!("{host}:{ctr}")
            }
        })
        .collect();

    let rp = params.restart_policy.trim().to_lowercase().replace('_', "-");
    let max_retry = if rp == "on-failure" {
        params.restart_max_retry.unwrap_or(0) as i64
    } else {
        0
    };
    let policy_name = if rp.is_empty() { "no" } else { rp.as_str() };
    let policy_name = RestartPolicyNameEnum::from_str(policy_name).unwrap_or(RestartPolicyNameEnum::NO);

    let nano_cpus = if params.cpu_quota_cores > 0.0 {
        let n = (params.cpu_quota_cores * 1_000_000_000f64).round() as i64;
        (n > 0).then_some(n)
    } else {
        None
    };
    let memory = (params.memory_mb > 0).then(|| (params.memory_mb as i64).saturating_mul(1024 * 1024));
    let cpu_shares = (params.cpu_shares > 0).then_some(params.cpu_shares as i64);

    let networking_config = if is_user_defined_network {
        let ipam = if ipv4.is_empty() && ipv6.is_empty() {
            None
        } else {
            Some(EndpointIpamConfig {
                ipv4_address: (!ipv4.is_empty()).then_some(ipv4.to_string()),
                ipv6_address: (!ipv6.is_empty()).then_some(ipv6.to_string()),
                ..Default::default()
            })
        };
        let mut endpoints = HashMap::new();
        endpoints.insert(
            net.to_string(),
            EndpointSettings {
                ipam_config: ipam,
                ..Default::default()
            },
        );
        Some(NetworkingConfig {
            endpoints_config: Some(endpoints),
        })
    } else {
        None
    };

    ContainerCreateBody {
        image: Some(image),
        env: (!env.is_empty()).then_some(env),
        cmd: (!params.command.is_empty()).then_some(params.command.clone()),
        entrypoint: (!params.entrypoint.is_empty()).then_some(params.entrypoint.clone()),
        tty: Some(params.tty),
        open_stdin: Some(params.open_stdin),
        attach_stdin: Some(params.open_stdin),
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        labels: (!labels.is_empty()).then_some(labels),
        exposed_ports: (!exposed_ports.is_empty()).then_some(exposed_ports),
        host_config: Some(HostConfig {
            port_bindings: (!port_bindings.is_empty()).then_some(port_bindings),
            publish_all_ports: Some(params.publish_all_ports),
            binds: (!binds.is_empty()).then_some(binds),
            network_mode: (!net.is_empty()).then_some(net.to_string()),
            restart_policy: Some(RestartPolicy {
                name: Some(policy_name),
                maximum_retry_count: Some(max_retry),
            }),
            auto_remove: Some(params.auto_remove),
            privileged: Some(params.privileged),
            cpu_shares,
            nano_cpus,
            memory,
            ..Default::default()
        }),
        networking_config,
        ..Default::default()
    }
}

pub async fn run_container(server_id: String, params: RunContainer, state: State<'_, AppState>) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;
    let docker = docker(&server).await?;
    let name = params.name.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let body = build_run_container_body(&params);
    let options = name.map(|name| CreateContainerOptionsBuilder::default().name(name).build());
    let created = docker
        .create_container(options, body)
        .await
        .map_err(map_bollard_error)?;
    let id = created.id;
    docker
        .start_container(&id, None::<StartContainerOptions>)
        .await
        .map_err(map_bollard_error)?;
    Ok(id)
}
