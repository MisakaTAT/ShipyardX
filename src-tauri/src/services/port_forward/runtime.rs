use std::collections::{HashMap, HashSet};
use std::net::TcpListener;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use log::{error, info, warn};
use tauri::{AppHandle, Manager, State};
use tokio::sync::watch;

use crate::config::timeouts::PORT_FORWARD_WARMUP_TIMEOUT;
use crate::dto::port_forward::{PortForwardError, PortForwardRule};
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::ssh::client::spawn_on_runtime;
use crate::ssh::pool;
use crate::state::{AppState, PortForwardRuntimeHandle, PortForwardRuntimeState, get_server_config, lock_mutex};

use super::bridge::{PortForwardAcceptArgs, accept_loop, error_message};

const LOG_TARGET: &str = "shipyardx_lib::services::port_forward";

type RuntimeMap = HashMap<String, PortForwardRuntimeState>;

#[derive(Clone, Copy)]
enum StaleScope<'a> {
    Keep,
    Server(&'a str),
    All,
}

pub(super) fn update_rule_enabled_and_runtime(id: String, enabled: bool, state: &State<'_, AppState>) -> AppResult<()> {
    update_rules_enabled_and_runtime(std::slice::from_ref(&id), enabled, state)
}

pub(super) fn update_rules_enabled_and_runtime(
    ids: &[String],
    enabled: bool,
    state: &State<'_, AppState>,
) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let wanted: HashSet<&str> = ids.iter().map(String::as_str).collect();

    let matched = state.port_forward_rules.mutate(|rules| {
        let mut matched = 0usize;
        for rule in rules.iter_mut().filter(|rule| wanted.contains(rule.id.as_str())) {
            rule.enabled = enabled;
            matched += 1;
        }
        Ok(matched)
    })?;

    if matched == 0 {
        return Err(AppError::not_found("port_forward.not_found"));
    }

    if !enabled {
        let mut runtime = lock_mutex(&state.port_forwards, "port_forward.runtime_lock_failed")?;
        for id in ids {
            if let Some(handle) = runtime.remove(id).and_then(|entry| entry.handle) {
                let _ = handle.stop_tx.send(true);
            }
        }
    }

    Ok(())
}

fn start_port_forward_runtime(
    rule: &PortForwardRule,
    server_cfg: &ServerConfig,
    runtime: &mut RuntimeMap,
) -> AppResult<()> {
    if !rule.enabled {
        return Err(AppError::validation("port_forward.rule_disabled"));
    }
    if runtime.get(&rule.id).is_some_and(|state| state.handle.is_some()) {
        return Ok(());
    }

    // 旧规则可能带着未校验的绑定地址
    let bind_addr = super::rules::resolve_bind_address(Some(rule.bind_address.as_str()))?;
    let listener = TcpListener::bind((bind_addr.as_str(), rule.local_port))
        .map_err(|e| AppError::conflict("port_forward.local_port_unavailable").with_source(e))?;
    let actual_local_port = listener
        .local_addr()
        .map_err(|e| AppError::internal("port_forward.local_addr_read_failed").with_source(e))?
        .port();

    let (stop_tx, stop_rx) = watch::channel(false);
    let last_error = Arc::new(Mutex::new(None));
    let tx_bytes = Arc::new(AtomicU64::new(0));
    let rx_bytes = Arc::new(AtomicU64::new(0));

    spawn_on_runtime(accept_loop(PortForwardAcceptArgs {
        listener,
        server_cfg: server_cfg.clone(),
        remote_host: rule.remote_host.clone(),
        remote_port: rule.remote_port,
        stop_rx,
        last_error: Arc::clone(&last_error),
        tx_bytes: Arc::clone(&tx_bytes),
        rx_bytes: Arc::clone(&rx_bytes),
    }))?;

    runtime.insert(
        rule.id.clone(),
        PortForwardRuntimeState {
            handle: Some(PortForwardRuntimeHandle {
                stop_tx,
                server_id: rule.server_id.clone(),
                local_port: actual_local_port,
                tx_bytes,
                rx_bytes,
                last_error,
            }),
            ..PortForwardRuntimeState::default()
        },
    );

    info!(
        target: LOG_TARGET,
        "port forward listening; rule_id={} server_id={} bind_address={} local_port={} remote_host={} remote_port={}",
        rule.id,
        rule.server_id,
        bind_addr,
        actual_local_port,
        rule.remote_host,
        rule.remote_port
    );
    Ok(())
}

fn collect_server_configs(
    state: &State<'_, AppState>,
    rules: &[PortForwardRule],
) -> HashMap<String, AppResult<ServerConfig>> {
    let mut configs: HashMap<String, AppResult<ServerConfig>> = HashMap::new();
    for rule in rules {
        configs
            .entry(rule.server_id.clone())
            .or_insert_with(|| get_server_config(state, &rule.server_id));
    }
    configs
}

fn start_rules(
    state: &State<'_, AppState>,
    enabled_rules: &[PortForwardRule],
    scope: StaleScope<'_>,
    configs: &HashMap<String, AppResult<ServerConfig>>,
) -> AppResult<HashMap<String, Vec<String>>> {
    let keep: HashSet<&str> = enabled_rules.iter().map(|rule| rule.id.as_str()).collect();
    let mut started_by_server: HashMap<String, Vec<String>> = HashMap::new();
    let mut runtime = lock_mutex(&state.port_forwards, "port_forward.runtime_lock_failed")?;

    let stale: Vec<String> = runtime
        .iter()
        .filter(|(id, entry)| {
            !keep.contains(id.as_str())
                && match scope {
                    StaleScope::Keep => false,
                    StaleScope::Server(scope) => entry.handle.as_ref().is_some_and(|handle| handle.server_id == scope),
                    StaleScope::All => true,
                }
        })
        .map(|(id, _)| id.clone())
        .collect();
    for id in stale {
        if let Some(handle) = runtime.remove(&id).and_then(|entry| entry.handle) {
            let _ = handle.stop_tx.send(true);
        }
    }

    for rule in enabled_rules {
        let outcome = match configs.get(&rule.server_id) {
            Some(Ok(server_cfg)) => start_port_forward_runtime(rule, server_cfg, &mut runtime),
            Some(Err(error)) => Err(error.clone()),
            None => Err(AppError::not_found("server.not_found")),
        };

        match outcome {
            Ok(()) => {
                if let Some(entry) = runtime.get_mut(&rule.id) {
                    entry.last_error = None;
                }
                started_by_server
                    .entry(rule.server_id.clone())
                    .or_default()
                    .push(rule.id.clone());
            }
            Err(error) => {
                error!(
                    target: LOG_TARGET,
                    "failed to start port forward; rule_id={} server_id={} code={} detail={:?}",
                    rule.id,
                    rule.server_id,
                    error.code,
                    error.detail
                );
                runtime.entry(rule.id.clone()).or_default().last_error = Some(PortForwardError::now(error));
            }
        }
    }

    Ok(started_by_server)
}

fn spawn_server_warmup(app_handle: AppHandle, server_cfg: ServerConfig, rule_ids: Vec<String>) {
    let spawned = spawn_on_runtime(async move {
        let server_id = server_cfg.id.clone();
        let failure = match tokio::time::timeout(PORT_FORWARD_WARMUP_TIMEOUT, pool::warm_up(&server_cfg)).await {
            Ok(Ok(())) => None,
            Ok(Err(error)) => Some(error),
            Err(_) => Some(
                AppError::timeout("port_forward.warmup_timeout")
                    .param("host", &server_cfg.host)
                    .retryable(true),
            ),
        };

        if let Some(error) = failure.as_ref() {
            warn!(
                target: LOG_TARGET,
                "port forward warmup failed; server_id={} rule_count={} code={} detail={}",
                server_id,
                rule_ids.len(),
                error.code,
                error_message(error)
            );
        }
        let failure = failure.map(PortForwardError::now);

        let app_state = app_handle.state::<AppState>();
        let Ok(mut runtime) = lock_mutex(&app_state.port_forwards, "port_forward.runtime_lock_failed") else {
            return;
        };
        for id in &rule_ids {
            if let Some(entry) = runtime.get_mut(id) {
                entry.last_error = failure.clone();
            }
        }
    });

    if let Err(error) = spawned {
        warn!(
            target: LOG_TARGET,
            "unable to spawn port forward warmup; message={} detail={:?}",
            error,
            error.detail
        );
    }
}

fn spawn_warmups(
    app_handle: &AppHandle,
    started_by_server: HashMap<String, Vec<String>>,
    configs: &HashMap<String, AppResult<ServerConfig>>,
) {
    for (server_id, rule_ids) in started_by_server {
        if let Some(Ok(server_cfg)) = configs.get(&server_id) {
            spawn_server_warmup(app_handle.clone(), server_cfg.clone(), rule_ids);
        }
    }
}

pub async fn start_all_enabled(server_id: String, app_handle: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let enabled_rules: Vec<PortForwardRule> = state
        .port_forward_rules
        .snapshot()?
        .iter()
        .filter(|rule| rule.server_id == server_id && rule.enabled)
        .cloned()
        .collect();

    let configs = collect_server_configs(&state, &enabled_rules);
    let started = start_rules(&state, &enabled_rules, StaleScope::Server(&server_id), &configs)?;
    spawn_warmups(&app_handle, started, &configs);
    Ok(())
}

pub async fn start_port_forward(id: String, app_handle: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let rule = state
        .port_forward_rules
        .snapshot()?
        .iter()
        .find(|rule| rule.id == id)
        .cloned()
        .ok_or_else(|| AppError::not_found("port_forward.not_found"))?;

    if let Some(handle) = lock_mutex(&state.port_forwards, "port_forward.runtime_lock_failed")?
        .remove(&id)
        .and_then(|entry| entry.handle)
    {
        let _ = handle.stop_tx.send(true);
    }

    let rules = [rule];
    let configs = collect_server_configs(&state, &rules);
    let started = start_rules(&state, &rules, StaleScope::Keep, &configs)?;
    spawn_warmups(&app_handle, started, &configs);
    Ok(())
}

pub async fn start_all_enabled_global(app_handle: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let enabled_rules: Vec<PortForwardRule> = state
        .port_forward_rules
        .snapshot()?
        .iter()
        .filter(|rule| rule.enabled)
        .cloned()
        .collect();

    let configs = collect_server_configs(&state, &enabled_rules);
    let started = start_rules(&state, &enabled_rules, StaleScope::All, &configs)?;
    info!(
        target: LOG_TARGET,
        "started all enabled port forwards; rule_count={} server_count={}",
        enabled_rules.len(),
        configs.len()
    );
    spawn_warmups(&app_handle, started, &configs);
    Ok(())
}

pub async fn stop_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let handle = lock_mutex(&state.port_forwards, "port_forward.runtime_lock_failed")?
        .remove(&id)
        .ok_or_else(|| AppError::not_found("port_forward.not_found"))?;

    if let Some(runtime) = handle.handle {
        let _ = runtime.stop_tx.send(true);
        info!(
            target: LOG_TARGET,
            "port forward runtime stopped; rule_id={} server_id={} local_port={}",
            id,
            runtime.server_id,
            runtime.local_port
        );
    }
    Ok(())
}

pub async fn stop_all_global(state: State<'_, AppState>) -> AppResult<()> {
    let handles: Vec<_> = lock_mutex(&state.port_forwards, "port_forward.runtime_lock_failed")?
        .drain()
        .collect();
    let total = handles.len();
    for (_id, handle) in handles {
        if let Some(runtime) = handle.handle {
            let _ = runtime.stop_tx.send(true);
        }
    }
    info!(
        target: LOG_TARGET,
        "stopped all port forward runtimes; count={}",
        total
    );
    Ok(())
}
