use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::State;

use std::collections::BTreeSet;

use log::{debug, error, info};
use network_interface::{NetworkInterface, NetworkInterfaceConfig};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpListener as TokioTcpListener;
use tokio::net::TcpStream as TokioTcpStream;
use tokio::sync::watch;

use crate::contracts::frontend::port_forward::{LocalAddress, PortForward, PortForwardCreate, PortForwardRule};
use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::ssh::client::{block_on, spawn_on_runtime};
use crate::ssh::pool;
use crate::state::{AppState, PortForwardRuntimeHandle, PortForwardRuntimeState, get_server_config, lock_mutex};
use crate::utils::id::generate_id;

const PORT_FORWARD_BIND_IP: &str = "127.0.0.1";
struct PortForwardBridgeArgs {
    local_stream: TcpStream,
    server_cfg: ServerConfig,
    remote_host: String,
    remote_port: u16,
    last_error: Arc<Mutex<Option<String>>>,
    tx_bytes: Arc<AtomicU64>,
    rx_bytes: Arc<AtomicU64>,
}

fn error_message(error: AppError) -> String {
    error.detail.unwrap_or(error.message)
}

struct PortForwardAcceptArgs {
    listener: TcpListener,
    server_cfg: ServerConfig,
    remote_host: String,
    remote_port: u16,
    stop_rx: watch::Receiver<bool>,
    last_error: Arc<Mutex<Option<String>>>,
    tx_bytes: Arc<AtomicU64>,
    rx_bytes: Arc<AtomicU64>,
}

fn set_port_forward_error(state: &State<AppState>, id: &str, error: Option<String>) {
    if let Ok(mut runtime) = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "更新端口转发运行时状态失败",
    ) {
        let entry = runtime.entry(id.to_string()).or_insert(PortForwardRuntimeState {
            handle: None,
            last_error: None,
        });
        entry.last_error = error;
    }
}

fn normalize_host(ip: &str) -> String {
    let v = ip.trim();
    if v.is_empty() || v == "0.0.0.0" || v == "::" || v == "::0" {
        "127.0.0.1".to_string()
    } else {
        v.to_string()
    }
}

async fn bridge_once(args: PortForwardBridgeArgs) {
    let PortForwardBridgeArgs {
        local_stream,
        server_cfg,
        remote_host,
        remote_port,
        last_error,
        tx_bytes,
        rx_bytes,
    } = args;

    let _ = local_stream.set_nodelay(true);
    let log_server_id = server_cfg.id.clone();
    let log_remote_host = remote_host.clone();

    let result = async move {
        let channel = pool::open_direct_tcpip(&server_cfg, remote_host.clone(), remote_port)
            .await
            .map_err(|e| {
                AppError::unavailable("port_forward.connect_failed", "SSH 连接失败").with_detail(error_message(e))
            })?
            .map_err(|e| AppError::unavailable("port_forward.remote_unreachable", "目标端口不可达").with_source(e))?;

        local_stream.set_nonblocking(true).map_err(|e| {
            AppError::internal("port_forward.local_socket_config_failed", "本地 socket 设置失败").with_source(e)
        })?;
        let local_stream = TokioTcpStream::from_std(local_stream).map_err(|e| {
            AppError::internal("port_forward.local_socket_takeover_failed", "接管本地连接失败").with_source(e)
        })?;
        let remote_stream = channel.into_stream();

        let (local_read, local_write) = tokio::io::split(local_stream);
        let (remote_read, remote_write) = tokio::io::split(remote_stream);

        tokio::select! {
            res = async {
                tokio::try_join!(
                    transfer_stream(local_read, remote_write, tx_bytes.clone()),
                    transfer_stream(remote_read, local_write, rx_bytes.clone())
                )?;
                Ok::<(), AppError>(())
            } => res
        }
    }
    .await;

    if let Err(e) = result {
        error!(
            target: "shipyardx_lib::services::port_forward",
            "port forward bridge failed; server_id={} remote_host={} remote_port={} message={} detail={:?}",
            log_server_id,
            log_remote_host,
            remote_port,
            e.message,
            e.detail
        );
        if let Ok(mut last_error_guard) = last_error.lock() {
            *last_error_guard = Some(error_message(e));
        }
    }
}

async fn transfer_stream<R, W>(mut reader: R, mut writer: W, counter: Arc<AtomicU64>) -> AppResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buf = [0u8; 16 * 1024];
    loop {
        let n = reader
            .read(&mut buf)
            .await
            .map_err(|e| AppError::internal("port_forward.read_failed", "读取端口转发数据失败").with_source(e))?;
        if n == 0 {
            writer.shutdown().await.map_err(|e| {
                AppError::internal("port_forward.shutdown_failed", "关闭端口转发写入端失败").with_source(e)
            })?;
            return Ok(());
        }
        writer
            .write_all(&buf[..n])
            .await
            .map_err(|e| AppError::internal("port_forward.write_failed", "写入端口转发数据失败").with_source(e))?;
        counter.fetch_add(n as u64, Ordering::Relaxed);
    }
}

async fn accept_loop(args: PortForwardAcceptArgs) {
    let PortForwardAcceptArgs {
        listener,
        server_cfg,
        remote_host,
        remote_port,
        mut stop_rx,
        last_error,
        tx_bytes,
        rx_bytes,
    } = args;

    let _ = listener.set_nonblocking(true);
    let listener = match TokioTcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(_) => return,
    };

    loop {
        tokio::select! {
            changed = stop_rx.changed() => {
                if changed.is_ok() && *stop_rx.borrow() {
                    break;
                }
            }
            accepted = listener.accept() => match accepted {
                Ok((stream, _addr)) => {
                    let stream = match stream.into_std() {
                        Ok(stream) => stream,
                        Err(_) => continue,
                    };
                    let cfg = server_cfg.clone();
                    let rh = remote_host.clone();
                    let le = last_error.clone();
                    let tx = tx_bytes.clone();
                    let rx = rx_bytes.clone();
                    let rp = remote_port;
                    tokio::spawn(async move {
                        bridge_once(PortForwardBridgeArgs {
                            local_stream: stream,
                            server_cfg: cfg,
                            remote_host: rh,
                            remote_port: rp,
                            last_error: le,
                            tx_bytes: tx,
                            rx_bytes: rx,
                        })
                        .await;
                    });
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }
}

fn probe_remote(server_cfg: &ServerConfig, remote_host: &str, remote_port: u16) -> AppResult<()> {
    let start = Instant::now();
    debug!(
        target: "shipyardx_lib::services::port_forward",
        "probing remote port; server_id={} remote_host={} remote_port={}",
        server_cfg.id,
        remote_host,
        remote_port
    );
    block_on(async {
        let channel = pool::open_direct_tcpip(server_cfg, remote_host.to_string(), remote_port)
            .await
            .map_err(|e| {
                AppError::unavailable("port_forward.connect_failed", "SSH 连接失败").with_detail(error_message(e))
            })?
            .map_err(|e| AppError::unavailable("port_forward.remote_unreachable", "目标端口不可达").with_source(e))?;
        drop(channel);
        Ok::<(), AppError>(())
    })??;
    let _elapsed = start.elapsed();
    Ok(())
}

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

fn load_port_forward_rules_from_state(state: &State<AppState>) -> AppResult<Vec<PortForwardRule>> {
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

fn save_port_forward_rules_to_state(state: &State<AppState>, rules: &[PortForwardRule]) -> AppResult<()> {
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

pub fn list_port_forwards(server_id: String, state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let runtime = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?;

    let mut out: Vec<PortForward> = Vec::new();
    for r in rules.into_iter().filter(|x| x.server_id == server_id) {
        let runtime_state = runtime.get(&r.id);
        let handle = runtime_state.and_then(|state| state.handle.as_ref());
        let running = handle.is_some();
        let handle_last_error = runtime_state.and_then(|state| state.last_error.clone());
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
            last_error: handle_last_error,
        });
    }
    Ok(out)
}

pub fn create_port_forward_rule(
    server_id: String,
    params: PortForwardCreate,
    state: State<'_, AppState>,
) -> AppResult<PortForward> {
    let protocol = params.protocol.trim().to_lowercase();

    let remote_host = normalize_host(&params.remote_host);

    let bind_address = params
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
    if params.local_port != 0 {
        let l = TcpListener::bind((bind_addr.as_str(), params.local_port)).map_err(|e| {
            AppError::conflict("port_forward.local_port_unavailable", "本地端口被占用或无法绑定").with_source(e)
        })?;
        drop(l);

        let existing_rules = load_port_forward_rules_from_state(&state)?;
        if existing_rules
            .iter()
            .any(|r| r.local_port == params.local_port && r.bind_address == bind_addr)
        {
            return Err(AppError::conflict(
                "port_forward.local_port_conflict",
                format!("本地端口 {} 已被其他规则占用", params.local_port),
            ));
        }
    }

    let existing_rules = load_port_forward_rules_from_state(&state)?;
    let forward_id = generate_id();
    let rule = PortForwardRule {
        id: forward_id.clone(),
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

fn update_rule_enabled_and_runtime(id: String, enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
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
        return Err(AppError::not_found("port_forward.not_found", "端口转发不存在"));
    }
    save_port_forward_rules_to_state(&state, &rules)?;

    // 同步运行时状态：禁用即停止。
    if !enabled
        && let Some(handle) = lock_mutex(
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

    Ok(())
}

pub fn set_port_forward_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    update_rule_enabled_and_runtime(id, enabled, state)
}

pub fn delete_port_forward(id: String, state: State<'_, AppState>) -> AppResult<()> {
    // 先停止运行时。
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
    rules.retain(|r| r.id != id);
    save_port_forward_rules_to_state(&state, &rules)?;
    info!(
        target: "shipyardx_lib::services::port_forward",
        "port forward rule deleted; rule_id={}",
        id
    );
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

    // 绑定本地端口（0 = 随机分配）
    let listener = TcpListener::bind((bind_addr, rule.local_port)).map_err(|e| {
        AppError::conflict("port_forward.local_port_unavailable", "本地端口被占用或无法绑定").with_source(e)
    })?;
    let actual_local_port = listener
        .local_addr()
        .map_err(|e| AppError::internal("port_forward.local_addr_read_failed", "读取本地端口失败").with_source(e))?
        .port();

    // 探测目标端口可达性（容器进程挂了会更早失败）。
    let server_cfg = get_server_config(state, &rule.server_id)?;
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
        last_error: None,
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
        .filter(|r| r.server_id == server_id && r.enabled)
        .collect();

    let enabled_ids: std::collections::HashSet<String> = enabled_rules.iter().map(|r| r.id.clone()).collect();

    // 先停掉所有“未启用状态但正在运行”的规则
    let running_ids: Vec<String> = state
        .port_forwards
        .lock()
        .map_err(|e| {
            AppError::internal("port_forward.runtime_lock_failed", "读取端口转发运行时状态失败")
                .with_detail(e.to_string())
        })?
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

    for id in running_ids {
        if !enabled_ids.contains(&id) {
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
        }
    }

    // 启动所有 enabled 规则（对失败做错误记录，不要中断其他规则）。
    for r in enabled_rules {
        if let Err(e) = start_port_forward_runtime(&r, &state) {
            error!(
                target: "shipyardx_lib::services::port_forward",
                "failed to start enabled port forward; rule_id={} server_id={} message={} detail={:?}",
                r.id,
                r.server_id,
                e.message,
                e.detail
            );
            set_port_forward_error(&state, &r.id, Some(error_message(e)));
        } else {
            set_port_forward_error(&state, &r.id, None);
        }
    }

    Ok(())
}

pub fn list_all_port_forwards(state: State<'_, AppState>) -> AppResult<Vec<PortForward>> {
    let rules = load_port_forward_rules_from_state(&state)?;
    let runtime = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?;

    let mut out: Vec<PortForward> = Vec::with_capacity(rules.len());
    for r in rules.into_iter() {
        let runtime_state = runtime.get(&r.id);
        let handle = runtime_state.and_then(|state| state.handle.as_ref());
        let running = handle.is_some();
        let handle_last_error = runtime_state.and_then(|state| state.last_error.clone());
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
            last_error: handle_last_error,
        });
    }

    Ok(out)
}

pub fn start_all_enabled_global(state: State<'_, AppState>) -> AppResult<()> {
    let rules = load_port_forward_rules_from_state(&state)?;

    let enabled_rules: Vec<PortForwardRule> = rules.into_iter().filter(|r| r.enabled).collect();
    let enabled_ids: std::collections::HashSet<String> = enabled_rules.iter().map(|r| r.id.clone()).collect();

    // 停掉所有“未启用状态但正在运行”的规则
    let running_ids: Vec<String> = lock_mutex(
        &state.port_forwards,
        "port_forward.runtime_lock_failed",
        "读取端口转发运行时状态失败",
    )?
    .keys()
    .cloned()
    .collect();
    for id in running_ids {
        if !enabled_ids.contains(&id) {
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
        }
    }

    // 启动所有 enabled 规则（对失败做错误记录，不中断其他规则）。
    for r in enabled_rules {
        if let Err(e) = start_port_forward_runtime(&r, &state) {
            error!(
                target: "shipyardx_lib::services::port_forward",
                "failed to start global enabled port forward; rule_id={} server_id={} message={} detail={:?}",
                r.id,
                r.server_id,
                e.message,
                e.detail
            );
            set_port_forward_error(&state, &r.id, Some(error_message(e)));
        } else {
            set_port_forward_error(&state, &r.id, None);
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
            runtime.tx_bytes.load(Ordering::Relaxed),
            runtime.rx_bytes.load(Ordering::Relaxed)
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
