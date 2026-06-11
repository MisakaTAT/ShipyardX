use std::collections::BTreeSet;
use std::sync::atomic::Ordering;
use std::time::Instant;

use network_interface::{NetworkInterface, NetworkInterfaceConfig};

use crate::dto::port_forward::{LocalAddress, PortForward, PortForwardRule};
use crate::error::{AppError, AppResult};
use crate::state::PortForwardRuntimeState;
use crate::utils::formatting::{format_bytes_u64, format_speed};

pub(super) fn refresh_runtime_speeds(runtime_state: &mut PortForwardRuntimeState, tx: u64, rx: u64, running: bool) {
    if !running {
        runtime_state.last_sample_at = None;
        runtime_state.last_tx_bytes = tx;
        runtime_state.last_rx_bytes = rx;
        runtime_state.tx_speed = "0 B/s".to_string();
        runtime_state.rx_speed = "0 B/s".to_string();
        return;
    }

    let now = Instant::now();
    if let Some(last_at) = runtime_state.last_sample_at {
        let dt = now.duration_since(last_at).as_secs_f64();
        if dt > 0.0 {
            let tx_delta = tx.saturating_sub(runtime_state.last_tx_bytes) as f64;
            let rx_delta = rx.saturating_sub(runtime_state.last_rx_bytes) as f64;
            runtime_state.tx_speed = format_speed(tx_delta / dt);
            runtime_state.rx_speed = format_speed(rx_delta / dt);
        }
    }
    runtime_state.last_sample_at = Some(now);
    runtime_state.last_tx_bytes = tx;
    runtime_state.last_rx_bytes = rx;
}

pub(super) fn runtime_state_to_port_forward(
    rule: PortForwardRule,
    runtime_state: &mut PortForwardRuntimeState,
) -> PortForward {
    let handle = runtime_state.handle.as_ref();
    let running = handle.is_some();
    let actual_port = if running {
        handle.map(|h| h.local_port).unwrap_or(rule.local_port)
    } else {
        rule.local_port
    };
    let tx = handle.map(|h| h.tx_bytes.load(Ordering::Relaxed)).unwrap_or(0);
    let rx = handle.map(|h| h.rx_bytes.load(Ordering::Relaxed)).unwrap_or(0);
    refresh_runtime_speeds(runtime_state, tx, rx, running);

    PortForward {
        id: rule.id,
        server_id: rule.server_id,
        container_id: rule.container_id,
        container_name: rule.container_name,
        enabled: rule.enabled,
        protocol: rule.protocol,
        container_port: rule.container_port,
        remote_host: rule.remote_host,
        remote_port: rule.remote_port,
        local_port: actual_port,
        bind_address: rule.bind_address,
        running,
        tx: format_bytes_u64(tx),
        rx: format_bytes_u64(rx),
        tx_speed: runtime_state.tx_speed.clone(),
        rx_speed: runtime_state.rx_speed.clone(),
        last_error: runtime_state.last_error.clone(),
    }
}

pub fn list_local_addresses() -> AppResult<Vec<LocalAddress>> {
    let interfaces = NetworkInterface::show().map_err(|e| {
        AppError::internal("port_forward.interfaces_list_failed", "读取本地网卡地址失败").with_source(e)
    })?;

    let mut seen = BTreeSet::new();
    let mut result: Vec<LocalAddress> = Vec::new();

    result.push(LocalAddress {
        ip: "0.0.0.0".into(),
        name: "所有网卡 (0.0.0.0)".into(),
    });
    seen.insert("0.0.0.0".to_string());

    for iface in &interfaces {
        for addr in &iface.addr {
            let ip_str = addr.ip().to_string();
            if seen.contains(&ip_str) || ip_str.contains(':') {
                continue;
            }
            seen.insert(ip_str.clone());
            let label = if ip_str == "127.0.0.1" {
                format!("{ip_str} (localhost)")
            } else {
                format!("{ip_str} ({})", iface.name)
            };
            result.push(LocalAddress {
                ip: ip_str,
                name: label,
            });
        }
    }

    if !seen.contains("127.0.0.1") {
        result.push(LocalAddress {
            ip: "127.0.0.1".into(),
            name: "127.0.0.1 (localhost)".into(),
        });
    }

    Ok(result)
}
