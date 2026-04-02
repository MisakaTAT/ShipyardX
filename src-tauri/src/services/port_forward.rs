use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::State;

use std::collections::BTreeSet;

use network_interface::{NetworkInterface, NetworkInterfaceConfig};

use crate::models::app::network::LocalAddress;
use crate::models::app::port_forward::{PortForward, PortForwardCreate, PortForwardRule};
use crate::models::app::server::ServerConfig;
use crate::ssh::session::create_ssh_session;
use crate::state::{AppState, PortForwardHandle, get_server_config};
use crate::utils::id::generate_id;

const PORT_FORWARD_BIND_IP: &str = "127.0.0.1";
const PORT_FORWARD_IO_POLL_MS: u32 = 400;

fn normalize_host(ip: &str) -> String {
    let v = ip.trim();
    if v.is_empty() || v == "0.0.0.0" || v == "::" || v == "::0" {
        "127.0.0.1".to_string()
    } else {
        v.to_string()
    }
}

fn validate_port(v: u16, name: &str) -> Result<(), String> {
    if v == 0 {
        return Err(format!("{} 无效", name));
    }
    Ok(())
}

fn bridge_once(
    local_stream: TcpStream,
    server_cfg: ServerConfig,
    remote_host: String,
    remote_port: u16,
    shutdown: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    tx_bytes: Arc<AtomicU64>,
    rx_bytes: Arc<AtomicU64>,
) {
    if shutdown.load(Ordering::Relaxed) {
        return;
    }

    let mut local_stream = local_stream;
    let io_timeout = Some(Duration::from_millis(PORT_FORWARD_IO_POLL_MS as u64));
    let _ = local_stream.set_read_timeout(io_timeout);
    let _ = local_stream.set_write_timeout(io_timeout);
    let _ = local_stream.set_nodelay(true);

    let sess = match create_ssh_session(&server_cfg) {
        Ok(s) => s,
        Err(e) => {
            *last_error.lock().unwrap() = Some(format!("SSH 连接失败: {}", e));
            return;
        }
    };

    sess.set_blocking(true);
    sess.set_timeout(PORT_FORWARD_IO_POLL_MS);

    let mut channel = match sess.channel_direct_tcpip(&remote_host, remote_port, None) {
        Ok(c) => c,
        Err(e) => {
            *last_error.lock().unwrap() = Some(format!("目标端口不可达: {}", e));
            return;
        }
    };

    let mut buf = [0u8; 16 * 1024];
    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        // local -> remote (TX: upload to remote)
        match local_stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if channel.write_all(&buf[..n]).is_err() {
                    break;
                }
                tx_bytes.fetch_add(n as u64, Ordering::Relaxed);
            }
            Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
            Err(_) => break,
        }

        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        // remote -> local (RX: download from remote)
        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if local_stream.write_all(&buf[..n]).is_err() {
                    break;
                }
                rx_bytes.fetch_add(n as u64, Ordering::Relaxed);
            }
            Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {}
            Err(_) => break,
        }
    }
}

fn accept_loop(
    listener: TcpListener,
    server_cfg: ServerConfig,
    remote_host: String,
    remote_port: u16,
    shutdown: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    tx_bytes: Arc<AtomicU64>,
    rx_bytes: Arc<AtomicU64>,
) {
    let _ = listener.set_nonblocking(true);

    loop {
        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        match listener.accept() {
            Ok((stream, _addr)) => {
                let cfg = server_cfg.clone();
                let rh = remote_host.clone();
                let sd = shutdown.clone();
                let le = last_error.clone();
                let tx = tx_bytes.clone();
                let rx = rx_bytes.clone();
                thread::spawn(move || bridge_once(stream, cfg, rh, remote_port, sd, le, tx, rx));
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(_) => {
                if shutdown.load(Ordering::Relaxed) {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn probe_remote(server_cfg: &ServerConfig, remote_host: &str, remote_port: u16) -> Result<(), String> {
    let start = Instant::now();
    let sess = create_ssh_session(server_cfg).map_err(|e| format!("SSH 连接失败: {}", e))?;

    // 同样使用 channel_direct_tcpip 做连通性探测。
    let channel = sess
        .channel_direct_tcpip(remote_host, remote_port, None)
        .map_err(|e| format!("目标端口不可达: {}", e))?;

    drop(channel);
    let _elapsed = start.elapsed();
    Ok(())
}

fn is_rule_running(state: &State<AppState>, id: &str) -> bool {
    state.port_forwards.lock().unwrap().contains_key(id)
}

fn load_port_forward_rules_from_state(state: &State<AppState>) -> Result<Vec<PortForwardRule>, String> {
    let data_file = state.data_file.lock().unwrap().clone();
    let path = crate::config::store::data_dir_from_file(&data_file).join("port_forwards.json");
    let rules_raw = std::fs::read_to_string(&path).unwrap_or_default();
    if rules_raw.trim().is_empty() {
        return Ok(vec![]);
    }
    serde_json::from_str::<Vec<PortForwardRule>>(&rules_raw).map_err(|e| format!("解析 port_forwards.json 失败: {}", e))
}

fn save_port_forward_rules_to_state(state: &State<AppState>, rules: &[PortForwardRule]) -> Result<(), String> {
    let data_file = state.data_file.lock().unwrap().clone();
    let dir = crate::config::store::data_dir_from_file(&data_file);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    let path = dir.join("port_forwards.json");
    let json = serde_json::to_string_pretty(rules).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("写入 port_forwards.json 失败: {}", e))
}

pub fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> Result<Vec<PortForward>, String> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let runtime = state.port_forwards.lock().unwrap();
    let errors = state.port_forward_last_errors.lock().unwrap();

    let mut out: Vec<PortForward> = Vec::new();
    for r in rules.into_iter().filter(|x| x.server_id == server_id) {
        let handle = runtime.get(&r.id);
        let running = handle.is_some();
        let handle_last_error = handle.and_then(|h| h.last_error.lock().unwrap().clone());
        let actual_port = if running {
            handle.map(|h| h.local_port).unwrap_or(r.local_port)
        } else {
            r.local_port
        };
        let tx = handle.map(|h| h.tx_bytes.load(Ordering::Relaxed)).unwrap_or(0);
        let rx = handle.map(|h| h.rx_bytes.load(Ordering::Relaxed)).unwrap_or(0);
        out.push(PortForward {
            id: r.id.clone(),
            server_id: r.server_id.clone(),
            container_id: r.container_id.clone(),
            container_name: r.container_name.clone(),
            enabled: r.enabled,
            protocol: r.protocol.clone(),
            container_port: r.container_port,
            remote_host: r.remote_host.clone(),
            remote_port: r.remote_port,
            local_port: actual_port,
            bind_address: r.bind_address.clone(),
            running,
            tx_bytes: tx,
            rx_bytes: rx,
            last_error: errors.get(&r.id).cloned().or(handle_last_error),
        });
    }
    Ok(out)
}

pub fn create_port_forward_rule(req: PortForwardCreate, state: State<'_, AppState>) -> Result<PortForward, String> {
    validate_port(req.remote_port, "remote_port")?;
    validate_port(req.container_port, "container_port")?;

    let protocol = req.protocol.trim().to_lowercase();
    if protocol != "tcp" {
        return Err("当前端口转发仅支持 TCP".to_string());
    }

    let remote_host = normalize_host(&req.remote_host);
    if remote_host.is_empty() {
        return Err("remote_host 不能为空".to_string());
    }

    let bind_address = req
        .bind_address
        .as_deref()
        .unwrap_or(PORT_FORWARD_BIND_IP)
        .trim()
        .to_string();
    let bind_addr = if bind_address.is_empty() {
        PORT_FORWARD_BIND_IP.to_string()
    } else {
        bind_address
    };

    // 非随机端口需要做可用性校验
    if req.local_port != 0 {
        let l = TcpListener::bind((bind_addr.as_str(), req.local_port))
            .map_err(|e| format!("本地端口被占用或无法绑定: {}", e))?;
        drop(l);

        let existing_rules = load_port_forward_rules_from_state(&state)?;
        if existing_rules
            .iter()
            .any(|r| r.local_port == req.local_port && r.bind_address == bind_addr)
        {
            return Err(format!("本地端口 {} 已被其他规则占用", req.local_port));
        }
    }

    let existing_rules = load_port_forward_rules_from_state(&state)?;
    let forward_id = generate_id();
    let rule = PortForwardRule {
        id: forward_id.clone(),
        server_id: req.server_id.clone(),
        container_id: req.container_id,
        container_name: req.container_name,
        enabled: req.enabled,
        protocol,
        container_port: req.container_port,
        remote_host,
        remote_port: req.remote_port,
        local_port: req.local_port,
        bind_address: bind_addr,
    };

    let mut rules = existing_rules;
    rules.push(rule.clone());
    save_port_forward_rules_to_state(&state, &rules)?;

    Ok(PortForward {
        id: forward_id,
        server_id: rule.server_id.clone(),
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
        tx_bytes: 0,
        rx_bytes: 0,
        last_error: None,
    })
}

fn update_rule_enabled_and_runtime(id: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let mut rules = load_port_forward_rules_from_state(&state)?;
    let mut found = false;
    for r in &mut rules {
        if r.id == id {
            r.enabled = enabled;
            found = true;
            break;
        }
    }
    if !found {
        return Err("端口转发不存在".to_string());
    }
    save_port_forward_rules_to_state(&state, &rules)?;

    // 同步运行时状态：禁用即停止。
    if !enabled {
        if let Some(handle) = state.port_forwards.lock().unwrap().remove(&id) {
            handle.shutdown.store(true, Ordering::Relaxed);
            // 清理错误信息
            state.port_forward_last_errors.lock().unwrap().remove(&id);
        }
    }

    Ok(())
}

pub fn set_port_forward_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    update_rule_enabled_and_runtime(id, enabled, state)
}

pub fn delete_port_forward(id: String, state: State<'_, AppState>) -> Result<(), String> {
    // 先停止运行时。
    if let Some(handle) = state.port_forwards.lock().unwrap().remove(&id) {
        handle.shutdown.store(true, Ordering::Relaxed);
    }
    state.port_forward_last_errors.lock().unwrap().remove(&id);

    let mut rules = load_port_forward_rules_from_state(&state)?;
    rules.retain(|r| r.id != id);
    save_port_forward_rules_to_state(&state, &rules)?;
    Ok(())
}

fn start_port_forward_runtime(rule: &PortForwardRule, state: &State<AppState>) -> Result<(), String> {
    if !rule.enabled {
        return Err("该规则已被禁用".to_string());
    }
    if is_rule_running(state, &rule.id) {
        return Ok(());
    }

    let bind_addr = if rule.bind_address.is_empty() {
        PORT_FORWARD_BIND_IP
    } else {
        &rule.bind_address
    };

    // 绑定本地端口（0 = 随机分配）
    let listener =
        TcpListener::bind((bind_addr, rule.local_port)).map_err(|e| format!("本地端口被占用或无法绑定: {}", e))?;
    let actual_local_port = listener
        .local_addr()
        .map_err(|e| format!("读取本地端口失败: {}", e))?
        .port();

    // 探测目标端口可达性（容器进程挂了会更早失败）。
    let server_cfg = get_server_config(state, &rule.server_id)?;
    probe_remote(&server_cfg, &rule.remote_host, rule.remote_port)?;

    let shutdown = Arc::new(AtomicBool::new(false));
    let last_error = Arc::new(Mutex::new(None));
    let tx_bytes = Arc::new(AtomicU64::new(0));
    let rx_bytes = Arc::new(AtomicU64::new(0));
    let handle = PortForwardHandle {
        id: rule.id.clone(),
        shutdown: shutdown.clone(),
        last_error: last_error.clone(),
        server_id: rule.server_id.clone(),
        container_id: rule.container_id.clone(),
        container_name: rule.container_name.clone(),
        protocol: rule.protocol.clone(),
        container_port: rule.container_port,
        remote_host: rule.remote_host.clone(),
        remote_port: rule.remote_port,
        local_port: actual_local_port,
        bind_address: rule.bind_address.clone(),
        tx_bytes: tx_bytes.clone(),
        rx_bytes: rx_bytes.clone(),
    };
    state.port_forwards.lock().unwrap().insert(rule.id.clone(), handle);

    let cfg = server_cfg.clone();
    let rh = rule.remote_host.clone();
    let rp = rule.remote_port;
    let sd = shutdown.clone();
    let le = last_error.clone();
    thread::spawn(move || accept_loop(listener, cfg, rh, rp, sd, le, tx_bytes, rx_bytes));

    Ok(())
}

pub fn start_all_enabled(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let enabled_rules: Vec<PortForwardRule> = rules
        .into_iter()
        .filter(|r| r.server_id == server_id && r.enabled)
        .collect();

    let enabled_ids: std::collections::HashSet<String> = enabled_rules.iter().map(|r| r.id.clone()).collect();

    // 先停掉所有“未启用状态但正在运行”的规则
    let running_ids: Vec<String> = state
        .port_forwards
        .lock()
        .unwrap()
        .iter()
        .filter(|(_, h)| h.server_id == server_id)
        .map(|(id, _)| id.clone())
        .collect();

    for id in running_ids {
        if !enabled_ids.contains(&id) {
            if let Some(handle) = state.port_forwards.lock().unwrap().remove(&id) {
                handle.shutdown.store(true, Ordering::Relaxed);
            }
            state.port_forward_last_errors.lock().unwrap().remove(&id);
        }
    }

    // 启动所有 enabled 规则（对失败做错误记录，不要中断其他规则）。
    for r in enabled_rules {
        if let Err(e) = start_port_forward_runtime(&r, &state) {
            state.port_forward_last_errors.lock().unwrap().insert(r.id.clone(), e);
        } else {
            state.port_forward_last_errors.lock().unwrap().remove(&r.id);
        }
    }

    Ok(())
}

pub fn list_all_port_forwards(state: State<'_, AppState>) -> Result<Vec<PortForward>, String> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let runtime = state.port_forwards.lock().unwrap();
    let errors = state.port_forward_last_errors.lock().unwrap();

    let mut out: Vec<PortForward> = Vec::with_capacity(rules.len());
    for r in rules.into_iter() {
        let handle = runtime.get(&r.id);
        let running = handle.is_some();
        let handle_last_error = handle.and_then(|h| h.last_error.lock().unwrap().clone());
        let actual_port = if running {
            handle.map(|h| h.local_port).unwrap_or(r.local_port)
        } else {
            r.local_port
        };
        let tx = handle.map(|h| h.tx_bytes.load(Ordering::Relaxed)).unwrap_or(0);
        let rx = handle.map(|h| h.rx_bytes.load(Ordering::Relaxed)).unwrap_or(0);

        out.push(PortForward {
            id: r.id.clone(),
            server_id: r.server_id.clone(),
            container_id: r.container_id.clone(),
            container_name: r.container_name.clone(),
            enabled: r.enabled,
            protocol: r.protocol.clone(),
            container_port: r.container_port,
            remote_host: r.remote_host.clone(),
            remote_port: r.remote_port,
            local_port: actual_port,
            bind_address: r.bind_address.clone(),
            running,
            tx_bytes: tx,
            rx_bytes: rx,
            last_error: errors.get(&r.id).cloned().or(handle_last_error),
        });
    }

    Ok(out)
}

pub fn start_all_enabled_global(state: State<'_, AppState>) -> Result<(), String> {
    let rules = load_port_forward_rules_from_state(&state)?;

    let enabled_rules: Vec<PortForwardRule> = rules.into_iter().filter(|r| r.enabled).collect();
    let enabled_ids: std::collections::HashSet<String> = enabled_rules.iter().map(|r| r.id.clone()).collect();

    // 停掉所有“未启用状态但正在运行”的规则
    let running_ids: Vec<String> = state.port_forwards.lock().unwrap().keys().cloned().collect();
    for id in running_ids {
        if !enabled_ids.contains(&id) {
            if let Some(handle) = state.port_forwards.lock().unwrap().remove(&id) {
                handle.shutdown.store(true, Ordering::Relaxed);
            }
            state.port_forward_last_errors.lock().unwrap().remove(&id);
        }
    }

    // 启动所有 enabled 规则（对失败做错误记录，不中断其他规则）。
    for r in enabled_rules {
        if let Err(e) = start_port_forward_runtime(&r, &state) {
            state.port_forward_last_errors.lock().unwrap().insert(r.id.clone(), e);
        } else {
            state.port_forward_last_errors.lock().unwrap().remove(&r.id);
        }
    }

    Ok(())
}

pub fn stop_port_forward(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let handle = state
        .port_forwards
        .lock()
        .unwrap()
        .remove(&id)
        .ok_or_else(|| "端口转发不存在".to_string())?;

    handle.shutdown.store(true, Ordering::Relaxed);
    state.port_forward_last_errors.lock().unwrap().remove(&id);
    Ok(())
}

pub fn stop_all_global(state: State<'_, AppState>) -> Result<(), String> {
    let handles: Vec<_> = state.port_forwards.lock().unwrap().drain().collect();
    for (id, handle) in handles {
        handle.shutdown.store(true, Ordering::Relaxed);
        state.port_forward_last_errors.lock().unwrap().remove(&id);
    }
    Ok(())
}

pub fn list_local_addresses() -> Result<Vec<LocalAddress>, String> {
    let interfaces = NetworkInterface::show().map_err(|e| e.to_string())?;

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
