use std::net::{IpAddr, TcpListener};

use tauri::State;

use crate::dto::port_forward::{PortForward, PortForwardCreate, PortForwardRule};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, PortForwardRuntimeState, lock_mutex};
use crate::utils::id::generate_id;

use super::PORT_FORWARD_BIND_IP;
use super::bridge::{error_message, normalize_host};
use super::metrics::runtime_state_to_port_forward;

pub(super) fn load_port_forward_rules_from_state(state: &State<AppState>) -> AppResult<Vec<PortForwardRule>> {
    let data_file = lock_mutex(
        &state.data_file,
        "port_forward.data_file_lock_failed",
        "读取端口转发配置路径失败",
    )?
    .clone();
    let path = crate::config::store::data_dir_from_file(&data_file).join("port_forwards.json");
    let rules_raw = std::fs::read_to_string(&path).unwrap_or_default();
    if rules_raw.trim().is_empty() {
        return Ok(vec![]);
    }
    serde_json::from_str::<Vec<PortForwardRule>>(&rules_raw).map_err(|e| {
        AppError::internal("port_forward.rules_parse_failed", "解析 port_forwards.json 失败").with_source(e)
    })
}

pub(super) fn save_port_forward_rules_to_state(state: &State<AppState>, rules: &[PortForwardRule]) -> AppResult<()> {
    let data_file = lock_mutex(
        &state.data_file,
        "port_forward.data_file_lock_failed",
        "读取端口转发配置路径失败",
    )?
    .clone();
    let dir = crate::config::store::data_dir_from_file(&data_file);
    std::fs::create_dir_all(&dir).map_err(|e| {
        AppError::internal("port_forward.config_dir_create_failed", "创建端口转发配置目录失败").with_source(e)
    })?;
    let path = dir.join("port_forwards.json");
    let json = serde_json::to_string_pretty(rules).map_err(|e| {
        AppError::internal("port_forward.rules_serialize_failed", "序列化端口转发配置失败").with_source(e)
    })?;
    crate::config::store::atomic_write(&path, json.as_bytes()).map_err(|e| {
        AppError::internal("port_forward.rules_write_failed", "写入 port_forwards.json 失败")
            .with_detail(e.detail.unwrap_or(e.message))
    })
}

pub async fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let mut runtime = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?;

    Ok(rules
        .into_iter()
        .filter(|rule| rule.server_id == server_id)
        .map(|rule| {
            let runtime_state = runtime
                .entry(rule.id.clone())
                .or_insert_with(PortForwardRuntimeState::default);
            runtime_state_to_port_forward(rule, runtime_state)
        })
        .collect())
}

/// 绑定地址必须是 IP 字面量，否则 `TcpListener::bind` 会走 DNS 解析
pub(super) fn resolve_bind_address(raw: Option<&str>) -> AppResult<String> {
    let bind_addr = raw.unwrap_or(PORT_FORWARD_BIND_IP).trim();
    if bind_addr.is_empty() {
        return Ok(PORT_FORWARD_BIND_IP.to_string());
    }
    let parsed = bind_addr.parse::<IpAddr>().map_err(|_| {
        AppError::validation(
            "port_forward.bind_address_invalid",
            format!("绑定地址必须是 IP 字面量：{bind_addr}"),
        )
        .with_action("请从本机地址列表中选择，或填写 127.0.0.1")
    })?;
    if parsed.is_multicast() {
        return Err(AppError::validation(
            "port_forward.bind_address_invalid",
            "绑定地址不能是组播地址",
        ));
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

    if params.local_port != 0 {
        // 先查冲突再探测绑定
        let existing_rules = load_port_forward_rules_from_state(&state)?;
        if existing_rules
            .iter()
            .any(|rule| rule.local_port == params.local_port && rule.bind_address == bind_addr)
        {
            return Err(AppError::conflict(
                "port_forward.local_port_conflict",
                format!("本地端口 {} 已被其他规则占用", params.local_port),
            ));
        }

        let listener = TcpListener::bind((bind_addr.as_str(), params.local_port)).map_err(|e| {
            AppError::conflict("port_forward.local_port_unavailable", "本地端口被占用或无法绑定").with_source(e)
        })?;
        drop(listener);
    }

    let mut rules = load_port_forward_rules_from_state(&state)?;
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
    rules.push(rule.clone());
    save_port_forward_rules_to_state(&state, &rules)?;

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
        tx: crate::utils::formatting::format_bytes_u64(0),
        rx: crate::utils::formatting::format_bytes_u64(0),
        tx_speed: "0 B/s".to_string(),
        rx_speed: "0 B/s".to_string(),
        last_error: None,
    })
}

pub async fn set_port_forward_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    super::runtime::update_rule_enabled_and_runtime(id, enabled, &state)
}

pub async fn delete_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    if let Some(handle) = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "更新端口转发运行时状态失败",
    )?
    .remove(&id)
    {
        if let Some(runtime) = handle.handle {
            let _ = runtime.stop_tx.send(true);
        }
    }

    let mut rules = load_port_forward_rules_from_state(&state)?;
    rules.retain(|rule| rule.id != id);
    save_port_forward_rules_to_state(&state, &rules)?;
    log::info!(target: "shipyardx_lib::services::port_forward", "port forward rule deleted; rule_id={}", id);
    Ok(())
}

pub async fn list_all_port_forwards(state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let mut runtime = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?;

    Ok(rules
        .into_iter()
        .map(|rule| {
            let runtime_state = runtime
                .entry(rule.id.clone())
                .or_insert_with(PortForwardRuntimeState::default);
            runtime_state_to_port_forward(rule, runtime_state)
        })
        .collect())
}

pub(super) fn set_runtime_error(state: &State<'_, AppState>, id: &str, error: Option<String>) {
    if let Ok(mut runtime) = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "更新端口转发运行时状态失败",
    ) {
        runtime
            .entry(id.to_string())
            .or_insert_with(PortForwardRuntimeState::default)
            .last_error = error;
    }
}

pub(super) fn record_start_failure(state: &State<'_, AppState>, id: &str, error: AppError) {
    set_runtime_error(state, id, Some(error_message(error)));
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
