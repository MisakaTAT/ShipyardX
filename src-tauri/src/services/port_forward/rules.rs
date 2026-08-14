use std::net::IpAddr;

use tauri::State;

use crate::dto::port_forward::{PortForward, PortForwardCreate, PortForwardRule};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, PortForwardRuntimeState, lock_read, lock_write};
use crate::utils::id::generate_id;

use super::PORT_FORWARD_BIND_IP;
use super::bridge::normalize_host;
use super::metrics::runtime_state_to_port_forward;

pub async fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    let rules = state.port_forward_rules.snapshot()?;
    let runtime = lock_read(&state.port_forwards, "port_forward.runtime_lock_failed")?;
    let idle = PortForwardRuntimeState::default();

    Ok(rules
        .iter()
        .filter(|rule| rule.server_id == server_id)
        .map(|rule| runtime_state_to_port_forward(rule, runtime.get(&rule.id).unwrap_or(&idle)))
        .collect())
}

/// 绑定地址必须是 IP 字面量，否则 `TcpListener::bind` 会走 DNS 解析
pub(super) fn resolve_bind_address(raw: Option<&str>) -> AppResult<String> {
    let bind_addr = raw.unwrap_or(PORT_FORWARD_BIND_IP).trim();
    if bind_addr.is_empty() {
        return Ok(PORT_FORWARD_BIND_IP.to_string());
    }
    let parsed = bind_addr
        .parse::<IpAddr>()
        .map_err(|_| AppError::validation("port_forward.bind_address_invalid").param("bind_addr", bind_addr))?;
    if parsed.is_multicast() {
        return Err(AppError::validation("port_forward.bind_address_multicast"));
    }
    if !parsed.is_loopback() {
        // 非回环地址会把远端服务暴露到局域网
        log::warn!(
            target: "shipyardx_lib::services::port_forward",
            "port forward will be reachable beyond localhost; bind_address={}",
            parsed
        );
    }
    Ok(parsed.to_string())
}

pub async fn create_port_forward_rule(
    server_id: String,
    params: PortForwardCreate,
    state: State<'_, AppState>,
) -> AppResult<PortForward> {
    let protocol = params.protocol.trim().to_lowercase();
    let remote_host = normalize_host(&params.remote_host);
    let bind_addr = resolve_bind_address(params.bind_address.as_deref())?;

    if params.local_port != 0
        && has_local_port_conflict(&state.port_forward_rules.snapshot()?, params.local_port, &bind_addr)
    {
        return Err(AppError::conflict("port_forward.local_port_conflict").param("port", params.local_port));
    }

    let rule = PortForwardRule {
        id: generate_id(),
        server_id: server_id.clone(),
        container_id: params.container_id,
        container_name: params.container_name,
        enabled: params.enabled,
        protocol,
        container_port: params.container_port,
        remote_host,
        remote_port: params.remote_port,
        local_port: params.local_port,
        bind_address: bind_addr,
    };

    let rule = state.port_forward_rules.mutate_durable(|rules| {
        if rule.local_port != 0 && has_local_port_conflict(rules, rule.local_port, &rule.bind_address) {
            return Err(AppError::conflict("port_forward.local_port_conflict").param("port", rule.local_port));
        }
        rules.push(rule.clone());
        Ok(rule)
    })?;

    Ok(PortForward {
        id: rule.id,
        server_id,
        container_id: rule.container_id,
        container_name: rule.container_name,
        enabled: rule.enabled,
        protocol: rule.protocol,
        container_port: rule.container_port,
        remote_host: rule.remote_host,
        remote_port: rule.remote_port,
        local_port: rule.local_port,
        bind_address: rule.bind_address,
        running: false,
        tx_speed_bps: 0.0,
        rx_speed_bps: 0.0,
        last_error: None,
    })
}

pub async fn set_port_forward_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    super::runtime::update_rule_enabled_and_runtime(id, enabled, &state).await
}

pub async fn set_port_forwards_enabled(ids: Vec<String>, enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    super::runtime::update_rules_enabled_and_runtime(&ids, enabled, &state).await
}

pub async fn delete_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    if let Some(handle) = lock_write(&state.port_forwards, "port_forward.runtime_lock_failed")?.remove(&id)
        && let Some(runtime) = handle.handle
    {
        let _ = runtime.stop_tx.send(true);
    }

    state.port_forward_rules.mutate_durable(|rules| {
        rules.retain(|rule| rule.id != id);
        Ok(())
    })?;
    log::info!(target: "shipyardx_lib::services::port_forward", "port forward rule deleted; rule_id={}", id);
    Ok(())
}

pub async fn list_all_port_forwards(state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    let rules = state.port_forward_rules.snapshot()?;
    let runtime = lock_read(&state.port_forwards, "port_forward.runtime_lock_failed")?;
    let idle = PortForwardRuntimeState::default();

    Ok(rules
        .iter()
        .map(|rule| runtime_state_to_port_forward(rule, runtime.get(&rule.id).unwrap_or(&idle)))
        .collect())
}

pub(super) fn has_local_port_conflict(rules: &[PortForwardRule], local_port: u16, bind_addr: &str) -> bool {
    rules
        .iter()
        .any(|rule| rule.local_port == local_port && rule.bind_address == bind_addr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_loopback() {
        assert_eq!(resolve_bind_address(None).unwrap(), "127.0.0.1");
        assert_eq!(resolve_bind_address(Some("")).unwrap(), "127.0.0.1");
        assert_eq!(resolve_bind_address(Some("  ")).unwrap(), "127.0.0.1");
    }

    #[test]
    fn rejects_non_literal_addresses() {
        assert!(resolve_bind_address(Some("localhost")).is_err());
        assert!(resolve_bind_address(Some("example.com")).is_err());
        assert!(resolve_bind_address(Some("224.0.0.1")).is_err());
    }

    #[test]
    fn accepts_literal_addresses() {
        assert_eq!(resolve_bind_address(Some("0.0.0.0")).unwrap(), "0.0.0.0");
        assert_eq!(resolve_bind_address(Some(" 192.168.1.5 ")).unwrap(), "192.168.1.5");
        assert_eq!(resolve_bind_address(Some("::1")).unwrap(), "::1");
    }
}
