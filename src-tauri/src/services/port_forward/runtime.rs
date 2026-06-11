use std::collections::HashSet;
use std::net::TcpListener;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use log::{error, info};
use tauri::State;
use tokio::sync::watch;

use crate::dto::port_forward::PortForwardRule;
use crate::error::{AppError, AppResult};
use crate::services::support::ServerContext;
use crate::ssh::client::spawn_on_runtime;
use crate::state::{AppState, PortForwardRuntimeHandle, PortForwardRuntimeState, lock_mutex};

use super::PORT_FORWARD_BIND_IP;
use super::bridge::{PortForwardAcceptArgs, accept_loop, probe_remote};
use super::rules::{
    load_port_forward_rules_from_state, record_start_failure, save_port_forward_rules_to_state, set_runtime_error,
};

fn is_rule_running(state: &State<AppState>, id: &str) -> bool {
    lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )
    .ok()
    .and_then(|runtime| runtime.get(id).and_then(|state| state.handle.as_ref()).map(|_| true))
    .unwrap_or(false)
}

pub(super) fn update_rule_enabled_and_runtime(id: String, enabled: bool, state: &State<'_, AppState>) -> AppResult<()> {
    let mut rules = load_port_forward_rules_from_state(state)?;
    let mut found = false;
    for rule in &mut rules {
        if rule.id == id {
            rule.enabled = enabled;
            found = true;
            break;
        }
    }
    if !found {
        return Err(AppError::not_found("port_forward.not_found", "端口转发不存在"));
    }
    save_port_forward_rules_to_state(state, &rules)?;

    if !enabled
        && let Some(handle) = lock_mutex(
            &state.port_forwards,
            "port_forward.runtime_lock_failed",
            "更新端口转发运行时状态失败",
        )?
        .remove(&id)
        && let Some(runtime) = handle.handle
    {
        let _ = runtime.stop_tx.send(true);
    }

    Ok(())
}

fn start_port_forward_runtime(rule: &PortForwardRule, state: &State<AppState>) -> AppResult<()> {
    if !rule.enabled {
        return Err(AppError::validation("port_forward.rule_disabled", "该规则已被禁用"));
    }
    if is_rule_running(state, &rule.id) {
        return Ok(());
    }

    let bind_addr = if rule.bind_address.is_empty() {
        PORT_FORWARD_BIND_IP
    } else {
        &rule.bind_address
    };
    let listener = TcpListener::bind((bind_addr, rule.local_port)).map_err(|e| {
        AppError::conflict("port_forward.local_port_unavailable", "本地端口被占用或无法绑定").with_source(e)
    })?;
    let actual_local_port = listener
        .local_addr()
        .map_err(|e| AppError::internal("port_forward.local_addr_read_failed", "读取本地端口失败").with_source(e))?
        .port();

    let server_cfg = ServerContext::from_state(state, &rule.server_id)?.server().clone();
    probe_remote(&server_cfg, &rule.remote_host, rule.remote_port)?;

    let (stop_tx, stop_rx) = watch::channel(false);
    let last_error = Arc::new(Mutex::new(None));
    let tx_bytes = Arc::new(AtomicU64::new(0));
    let rx_bytes = Arc::new(AtomicU64::new(0));
    let handle = PortForwardRuntimeState {
        handle: Some(PortForwardRuntimeHandle {
            stop_tx: stop_tx.clone(),
            server_id: rule.server_id.clone(),
            local_port: actual_local_port,
            tx_bytes: tx_bytes.clone(),
            rx_bytes: rx_bytes.clone(),
        }),
        ..PortForwardRuntimeState::default()
    };
    lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "记录端口转发运行时状态失败",
    )?
    .insert(rule.id.clone(), handle);
    info!(
        target: "shipyardx_lib::services::port_forward",
        "port forward runtime started; rule_id={} server_id={} bind_address={} local_port={} remote_host={} remote_port={}",
        rule.id,
        rule.server_id,
        bind_addr,
        actual_local_port,
        rule.remote_host,
        rule.remote_port
    );

    let cfg = server_cfg.clone();
    let rh = rule.remote_host.clone();
    let rp = rule.remote_port;
    let le = last_error.clone();
    spawn_on_runtime(async move {
        accept_loop(PortForwardAcceptArgs {
            listener,
            server_cfg: cfg,
            remote_host: rh,
            remote_port: rp,
            stop_rx,
            last_error: le,
            tx_bytes,
            rx_bytes,
        })
        .await;
    })?;

    Ok(())
}

pub fn start_all_enabled(server_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let enabled_rules: Vec<PortForwardRule> = rules
        .into_iter()
        .filter(|rule| rule.server_id == server_id && rule.enabled)
        .collect();

    let enabled_ids: HashSet<String> = enabled_rules.iter().map(|rule| rule.id.clone()).collect();
    let running_ids: Vec<String> = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?
    .iter()
    .filter(|(_, state)| {
        state
            .handle
            .as_ref()
            .map(|handle| handle.server_id == server_id)
            .unwrap_or(false)
    })
    .map(|(id, _)| id.clone())
    .collect();

    stop_disabled_rules(&state, running_ids, &enabled_ids)?;

    for rule in enabled_rules {
        if let Err(error) = start_port_forward_runtime(&rule, &state) {
            error!(
                target: "shipyardx_lib::services::port_forward",
                "failed to start enabled port forward; rule_id={} server_id={} message={} detail={:?}",
                rule.id,
                rule.server_id,
                error.message,
                error.detail
            );
            record_start_failure(&state, &rule.id, error);
        } else {
            set_runtime_error(&state, &rule.id, None);
        }
    }

    Ok(())
}

pub fn start_all_enabled_global(state: State<'_, AppState>) -> AppResult<()> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let enabled_rules: Vec<PortForwardRule> = rules.into_iter().filter(|rule| rule.enabled).collect();
    let enabled_ids: HashSet<String> = enabled_rules.iter().map(|rule| rule.id.clone()).collect();
    let running_ids: Vec<String> = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?
    .keys()
    .cloned()
    .collect();

    stop_disabled_rules(&state, running_ids, &enabled_ids)?;

    for rule in enabled_rules {
        if let Err(error) = start_port_forward_runtime(&rule, &state) {
            error!(
                target: "shipyardx_lib::services::port_forward",
                "failed to start global enabled port forward; rule_id={} server_id={} message={} detail={:?}",
                rule.id,
                rule.server_id,
                error.message,
                error.detail
            );
            record_start_failure(&state, &rule.id, error);
        } else {
            set_runtime_error(&state, &rule.id, None);
        }
    }

    Ok(())
}

pub fn stop_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let handle = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "更新端口转发运行时状态失败",
    )?
    .remove(&id)
    .ok_or_else(|| AppError::not_found("port_forward.not_found", "端口转发不存在"))?;

    if let Some(runtime) = handle.handle {
        let _ = runtime.stop_tx.send(true);
        info!(
            target: "shipyardx_lib::services::port_forward",
            "port forward runtime stopped; rule_id={} server_id={} local_port={} tx_bytes={} rx_bytes={}",
            id,
            runtime.server_id,
            runtime.local_port,
            runtime.tx_bytes.load(std::sync::atomic::Ordering::Relaxed),
            runtime.rx_bytes.load(std::sync::atomic::Ordering::Relaxed)
        );
    }
    Ok(())
}

pub fn stop_all_global(state: State<'_, AppState>) -> AppResult<()> {
    let handles: Vec<_> = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "更新端口转发运行时状态失败",
    )?
    .drain()
    .collect();
    let total = handles.len();
    for (_id, handle) in handles {
        if let Some(runtime) = handle.handle {
            let _ = runtime.stop_tx.send(true);
        }
    }
    info!(
        target: "shipyardx_lib::services::port_forward",
        "stopped all port forward runtimes; count={}",
        total
    );
    Ok(())
}

fn stop_disabled_rules(
    state: &State<'_, AppState>,
    running_ids: Vec<String>,
    enabled_ids: &HashSet<String>,
) -> AppResult<()> {
    for id in running_ids {
        if !enabled_ids.contains(&id)
            && let Some(handle) = lock_mutex(
                &state.port_forwards,
                "port_forward.runtime_lock_failed",
                "更新端口转发运行时状态失败",
            )?
            .remove(&id)
            && let Some(runtime) = handle.handle
        {
            let _ = runtime.stop_tx.send(true);
        }
    }
    Ok(())
}
