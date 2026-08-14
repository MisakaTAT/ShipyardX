use std::collections::BTreeSet;
use std::sync::atomic::Ordering;
use std::time::Instant;

use log::warn;
use network_interface::{NetworkInterface, NetworkInterfaceConfig};
use tauri::{AppHandle, Manager};
use tokio::time::MissedTickBehavior;

use crate::config::timeouts::PORT_FORWARD_SPEED_TICK;
use crate::dto::port_forward::{LocalAddress, PortForward, PortForwardRule};
use crate::error::{AppError, AppResult};
use crate::ssh::client::spawn_on_runtime;
use crate::state::{AppState, PortForwardRuntimeState, lock_mutex};

const SPEED_EMA_ALPHA: f64 = 0.4;
const SPEED_FLOOR_BPS: f64 = 1.0;

fn smooth(previous: f64, instant: f64) -> f64 {
    let next = SPEED_EMA_ALPHA * instant + (1.0 - SPEED_EMA_ALPHA) * previous;
    if next < SPEED_FLOOR_BPS { 0.0 } else { next }
}

pub(super) fn sample_runtime_speeds(runtime_state: &mut PortForwardRuntimeState, now: Instant) {
    let Some(handle) = runtime_state.handle.as_ref() else {
        runtime_state.last_sample_at = None;
        runtime_state.tx_speed_bps = 0.0;
        runtime_state.rx_speed_bps = 0.0;
        return;
    };

    let tx = handle.tx_bytes.load(Ordering::Relaxed);
    let rx = handle.rx_bytes.load(Ordering::Relaxed);

    if let Some(last_at) = runtime_state.last_sample_at {
        let dt = now.duration_since(last_at).as_secs_f64();
        if dt > 0.0 {
            let tx_instant = tx.saturating_sub(runtime_state.last_tx_bytes) as f64 / dt;
            let rx_instant = rx.saturating_sub(runtime_state.last_rx_bytes) as f64 / dt;
            runtime_state.tx_speed_bps = smooth(runtime_state.tx_speed_bps, tx_instant);
            runtime_state.rx_speed_bps = smooth(runtime_state.rx_speed_bps, rx_instant);
        }
    }
    runtime_state.last_sample_at = Some(now);
    runtime_state.last_tx_bytes = tx;
    runtime_state.last_rx_bytes = rx;
}

pub(super) fn runtime_state_to_port_forward(
    rule: &PortForwardRule,
    runtime_state: &PortForwardRuntimeState,
) -> PortForward {
    let handle = runtime_state.handle.as_ref();
    let running = handle.is_some();
    let actual_port = if running {
        handle.map(|h| h.local_port).unwrap_or(rule.local_port)
    } else {
        rule.local_port
    };
    let bridge_error = handle.and_then(|h| h.last_error.lock().ok().and_then(|guard| guard.clone()));
    let last_error = match (bridge_error, runtime_state.last_error.clone()) {
        (Some(bridge), Some(startup)) if bridge.at_ms >= startup.at_ms => Some(bridge),
        (Some(bridge), None) => Some(bridge),
        (_, startup) => startup,
    };

    PortForward {
        id: rule.id.clone(),
        server_id: rule.server_id.clone(),
        container_id: rule.container_id.clone(),
        container_name: rule.container_name.clone(),
        enabled: rule.enabled,
        protocol: rule.protocol.clone(),
        container_port: rule.container_port,
        remote_host: rule.remote_host.clone(),
        remote_port: rule.remote_port,
        local_port: actual_port,
        bind_address: rule.bind_address.clone(),
        running,
        tx_speed_bps: runtime_state.tx_speed_bps,
        rx_speed_bps: runtime_state.rx_speed_bps,
        last_error,
    }
}

pub fn spawn_speed_sampler(app_handle: AppHandle) {
    let spawned = spawn_on_runtime(async move {
        let mut ticker = tokio::time::interval(PORT_FORWARD_SPEED_TICK);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;
            let now = Instant::now();
            let app_state = app_handle.state::<AppState>();
            let Ok(mut runtime) = lock_mutex(&app_state.port_forwards, "port_forward.runtime_lock_failed") else {
                continue;
            };
            for entry in runtime.values_mut() {
                sample_runtime_speeds(entry, now);
            }
        }
    });

    if let Err(error) = spawned {
        warn!(
            target: "shipyardx_lib::services::port_forward",
            "unable to spawn port forward speed sampler; code={} detail={:?}",
            error.code,
            error.detail
        );
    }
}

pub async fn list_local_addresses() -> AppResult<Vec<LocalAddress>> {
    let interfaces = NetworkInterface::show()
        .map_err(|e| AppError::internal("port_forward.interfaces_list_failed").with_source(e))?;

    let mut seen = BTreeSet::new();
    let mut result: Vec<LocalAddress> = Vec::new();

    result.push(LocalAddress {
        ip: "0.0.0.0".into(),
        name: "port_forward.all_interfaces".into(),
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::AtomicU64;
    use std::time::Duration;

    use tokio::sync::watch;

    use super::*;
    use crate::state::PortForwardRuntimeHandle;

    fn running_state() -> (PortForwardRuntimeState, Arc<AtomicU64>, Arc<AtomicU64>) {
        let tx_bytes = Arc::new(AtomicU64::new(0));
        let rx_bytes = Arc::new(AtomicU64::new(0));
        let (stop_tx, _rx) = watch::channel(false);
        let state = PortForwardRuntimeState {
            handle: Some(PortForwardRuntimeHandle {
                stop_tx,
                server_id: "s1".into(),
                local_port: 8080,
                tx_bytes: Arc::clone(&tx_bytes),
                rx_bytes: Arc::clone(&rx_bytes),
                last_error: Arc::new(std::sync::Mutex::new(None)),
            }),
            ..PortForwardRuntimeState::default()
        };
        (state, tx_bytes, rx_bytes)
    }

    /// 第一次采样只能建立基线：没有上一次的时间点，算不出速率
    #[test]
    fn first_sample_only_seeds_the_baseline() {
        let (mut state, tx, _rx) = running_state();
        tx.store(1_000, Ordering::Relaxed);

        sample_runtime_speeds(&mut state, Instant::now());

        assert_eq!(state.tx_speed_bps, 0.0);
        assert_eq!(state.last_tx_bytes, 1_000);
        assert!(state.last_sample_at.is_some());
    }

    #[test]
    fn burst_decays_smoothly_instead_of_snapping_to_zero() {
        let (mut state, tx, _rx) = running_state();
        let start = Instant::now();
        sample_runtime_speeds(&mut state, start);

        // 一秒内来了 500 KB，之后彻底空闲
        tx.store(500_000, Ordering::Relaxed);
        sample_runtime_speeds(&mut state, start + Duration::from_secs(1));
        let peak = state.tx_speed_bps;
        assert!(peak > 0.0 && peak < 500_000.0, "EMA 应该削峰，实际 {peak}");

        let mut previous = peak;
        for tick in 2..=6 {
            sample_runtime_speeds(&mut state, start + Duration::from_secs(tick));
            assert!(
                state.tx_speed_bps < previous,
                "第 {tick} 个 tick 应继续衰减：{previous} -> {}",
                state.tx_speed_bps
            );
            previous = state.tx_speed_bps;
        }
        assert!(
            previous < peak / 4.0,
            "六个 tick 后应衰减到峰值 1/4 以下，实际 {previous}"
        );
    }

    #[test]
    fn steady_traffic_converges_to_the_real_rate() {
        let (mut state, tx, _rx) = running_state();
        let start = Instant::now();
        sample_runtime_speeds(&mut state, start);

        // 持续 100 KB/s
        for tick in 1..=30 {
            tx.store(100_000 * tick, Ordering::Relaxed);
            sample_runtime_speeds(&mut state, start + Duration::from_secs(tick));
        }
        assert!(
            (state.tx_speed_bps - 100_000.0).abs() < 1_000.0,
            "应收敛到 100 KB/s，实际 {}",
            state.tx_speed_bps
        );
    }

    #[test]
    fn decays_all_the_way_to_zero() {
        let (mut state, tx, _rx) = running_state();
        let start = Instant::now();
        sample_runtime_speeds(&mut state, start);
        tx.store(10_000, Ordering::Relaxed);
        sample_runtime_speeds(&mut state, start + Duration::from_secs(1));

        for tick in 2..=40 {
            sample_runtime_speeds(&mut state, start + Duration::from_secs(tick));
        }
        // 不留 0.3 B/s 的尾巴
        assert_eq!(state.tx_speed_bps, 0.0);
    }

    #[test]
    fn stopped_rule_reports_zero_and_forgets_the_baseline() {
        let (mut state, tx, _rx) = running_state();
        let start = Instant::now();
        sample_runtime_speeds(&mut state, start);
        tx.store(500_000, Ordering::Relaxed);
        sample_runtime_speeds(&mut state, start + Duration::from_secs(1));
        assert!(state.tx_speed_bps > 0.0);

        state.handle = None;
        sample_runtime_speeds(&mut state, start + Duration::from_secs(2));

        assert_eq!(state.tx_speed_bps, 0.0);
        assert_eq!(state.rx_speed_bps, 0.0);
        assert!(state.last_sample_at.is_none());
    }
}
