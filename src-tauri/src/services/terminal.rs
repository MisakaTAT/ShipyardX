use std::path::PathBuf;
use std::sync::OnceLock;

use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use russh::ChannelMsg;
use tauri::{AppHandle, Manager, State};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::mpsc as tokio_mpsc;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::protocol::Message;

use crate::docker::client::{docker, map_bollard_error};
use crate::docker::transport::open_hijack_json;
use crate::dto::server::ServerConfig;
use crate::dto::terminal::{ContainerExecTerminalParams, TerminalSession, WsClientCtrl, WsServerMsg};
use crate::error::{AppError, AppResult};
use crate::ssh::client::{connect, disconnect, spawn_on_runtime};
use crate::state::{
    AppState, TerminalHandle, TerminalHandshakeState, TerminalMsg, get_server_config, lock_read, lock_write,
};
use crate::utils::id::generate_id;

/// 终端 WS 走单路二进制，首字节是 channel tag：0x00 = PTY 字节流，0x01 = 控制 JSON（UTF-8）。
const TAG_DATA: u8 = 0x00;
const TAG_CTRL: u8 = 0x01;

fn pty_frame(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + bytes.len());
    out.push(TAG_DATA);
    out.extend_from_slice(bytes);
    out
}

fn ctrl_frame(json: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + json.len());
    out.push(TAG_CTRL);
    out.extend_from_slice(json.as_bytes());
    out
}

static WS_PORT: OnceLock<u16> = OnceLock::new();

/// 限制导出范围，不允许写进应用自身的数据目录
pub async fn save_terminal_export(app: &AppHandle, path: String, content: String) -> AppResult<()> {
    let target = PathBuf::from(path.trim());
    let content_len = content.len();
    if !target.is_absolute() {
        return Err(AppError::validation("terminal.export_path_not_absolute"));
    }

    let Some(parent) = target.parent() else {
        return Err(AppError::validation("terminal.export_path_invalid"));
    };
    if !fs::try_exists(parent).await.unwrap_or(false) {
        return Err(AppError::validation("terminal.export_dir_missing"));
    }

    let protected = [
        app.path().app_data_dir().ok(),
        app.path().app_local_data_dir().ok(),
        app.path().app_config_dir().ok(),
    ];
    if protected
        .iter()
        .flatten()
        .any(|dir| parent == dir || parent.starts_with(dir))
    {
        return Err(AppError::permission("terminal.export_path_forbidden"));
    }

    // 不跟随符号链接
    if let Ok(metadata) = fs::symlink_metadata(&target).await
        && metadata.file_type().is_symlink()
    {
        return Err(AppError::permission("terminal.export_path_symlink"));
    }

    fs::write(&target, content)
        .await
        .map_err(|e| AppError::internal("terminal.export_write_failed").with_source(e))?;
    info!(target: "shipyardx_lib::services::terminal", "terminal export written; path={} bytes={}", target.display(), content_len);
    Ok(())
}

fn is_safe_docker_ident(v: &str) -> bool {
    if v.is_empty() {
        return false;
    }
    v.bytes()
        .all(|b| matches!(b, b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'-' | b'.'))
}

fn terminal_ws_send(app: &AppHandle, session_id: &str, frame: Vec<u8>) {
    if let Ok(clients) = lock_read(
        &app.state::<AppState>().terminal_ws_clients,
        "terminal.ws_clients_lock_failed",
    ) {
        if let Some(tx) = clients.get(session_id).cloned() {
            let _ = tx.send(frame);
        }
    }
}

fn send_control(app: &AppHandle, session_id: &str, msg: WsServerMsg) {
    terminal_ws_send(app, session_id, ctrl_frame(&msg.to_json()));
}

fn send_pty_bytes(app: &AppHandle, session_id: &str, bytes: &[u8]) {
    terminal_ws_send(app, session_id, pty_frame(bytes));
}

fn maybe_send_ready(app: &AppHandle, session_id: &str) {
    let should_send = lock_read(
        &app.state::<AppState>().terminal_handshakes,
        "terminal.handshake_lock_failed",
    )
    .ok()
    .and_then(|handshakes| {
        handshakes
            .get(session_id)
            .map(|state| state.backend_ready && state.client_ready)
    })
    .unwrap_or(false);

    if should_send {
        send_control(app, session_id, WsServerMsg::Ready);
    }
}

fn mark_backend_ready(app: &AppHandle, session_id: &str) {
    if let Ok(mut handshakes) = lock_write(
        &app.state::<AppState>().terminal_handshakes,
        "terminal.handshake_lock_failed",
    ) {
        handshakes
            .entry(session_id.to_string())
            .or_insert_with(TerminalHandshakeState::default)
            .backend_ready = true;
    }
    maybe_send_ready(app, session_id);
}

fn mark_client_ready(app: &AppHandle, session_id: &str) {
    if let Ok(mut handshakes) = lock_write(
        &app.state::<AppState>().terminal_handshakes,
        "terminal.handshake_lock_failed",
    ) {
        handshakes
            .entry(session_id.to_string())
            .or_insert_with(TerminalHandshakeState::default)
            .client_ready = true;
    }
    maybe_send_ready(app, session_id);
}

fn fail_terminal(app: &AppHandle, session_id: &str, error: impl Into<AppError>) {
    let error = error.into();
    error!(
        target: "shipyardx_lib::services::terminal",
        "terminal session failed; session_id={} code={} message={} detail={:?}",
        session_id,
        error.code,
        error,
        error.detail
    );
    send_control(app, session_id, WsServerMsg::Error { error });
}

async fn wait_for_client_ready(
    session_id: &str,
    rx: &mut tokio_mpsc::UnboundedReceiver<TerminalMsg>,
    ah: &AppHandle,
) -> bool {
    while let Some(msg) = rx.recv().await {
        match msg {
            TerminalMsg::ClientReady => return true,
            TerminalMsg::Close => {
                send_control(ah, session_id, WsServerMsg::Closed);
                return false;
            }
            TerminalMsg::Data(_) | TerminalMsg::Resize { .. } => {}
        }
    }
    false
}

async fn run_terminal_thread(
    config: ServerConfig,
    session_id: String,
    mut rx: tokio_mpsc::UnboundedReceiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    info!(
        target: "shipyardx_lib::services::terminal",
        "starting ssh terminal session; session_id={} server_id={} cols={} rows={}",
        session_id,
        config.id,
        cols,
        rows
    );
    if !wait_for_client_ready(&session_id, &mut rx, &ah).await {
        return Ok(());
    }

    let mut handle = connect(&config).await?;
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::internal("terminal.channel_open_failed").with_source(e))?;

    channel
        .request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| AppError::internal("terminal.pty_request_failed").with_source(e))?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| AppError::internal("terminal.shell_start_failed").with_source(e))?;

    mark_backend_ready(&ah, &session_id);
    run_terminal_io_loop(session_id.clone(), rx, ah, &mut handle, channel, cols, rows).await;
    info!(
        target: "shipyardx_lib::services::terminal",
        "ssh terminal session finished; session_id={}",
        session_id
    );
    Ok(())
}

struct ContainerExecThreadCtx {
    config: ServerConfig,
    session_id: String,
    rx: tokio_mpsc::UnboundedReceiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
    container_id: String,
    user: Option<String>,
    shell: String,
}

async fn run_container_exec_thread(ctx: ContainerExecThreadCtx) -> AppResult<()> {
    let ContainerExecThreadCtx {
        config,
        session_id,
        mut rx,
        ah,
        cols,
        rows,
        container_id,
        user,
        shell,
    } = ctx;

    if !is_safe_docker_ident(&container_id) {
        return Err(AppError::validation("terminal.container_id_invalid"));
    }

    info!(
        target: "shipyardx_lib::services::terminal",
        "starting container exec terminal; session_id={} server_id={} container_id={} cols={} rows={}",
        session_id,
        config.id,
        container_id,
        cols,
        rows
    );
    if !wait_for_client_ready(&session_id, &mut rx, &ah).await {
        return Ok(());
    }

    let docker = docker(&config).await?;
    let shell = if shell.trim().is_empty() {
        "/bin/sh".to_string()
    } else {
        shell.trim().to_string()
    };
    let exec = CreateExecOptions {
        attach_stdin: Some(true),
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        tty: Some(true),
        cmd: Some(vec![shell]),
        user: user
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        ..Default::default()
    };
    let created = docker
        .create_exec(&container_id, exec)
        .await
        .map_err(map_bollard_error)?;
    let start = StartExecOptions {
        detach: false,
        tty: true,
        output_capacity: None,
    };
    let mut hijack = open_hijack_json(
        &config,
        hyper::Method::POST,
        &format!("/exec/{}/start", created.id),
        &start,
    )
    .await?;
    mark_backend_ready(&ah, &session_id);
    run_docker_exec_io_loop(
        session_id.clone(),
        rx,
        ah,
        &config,
        &created.id,
        &mut hijack,
        cols,
        rows,
    )
    .await;
    info!(
        target: "shipyardx_lib::services::terminal",
        "container exec terminal finished; session_id={}",
        session_id
    );
    Ok(())
}

async fn resize_docker_exec(config: &ServerConfig, exec_id: &str, cols: u32, rows: u32) -> bool {
    if cols == 0 || rows == 0 {
        return false;
    }
    let Ok(width) = u16::try_from(cols) else {
        return false;
    };
    let Ok(height) = u16::try_from(rows) else {
        return false;
    };
    let Ok(docker) = docker(config).await else {
        return false;
    };
    docker
        .resize_exec(exec_id, ResizeExecOptions { width, height })
        .await
        .is_ok()
}

async fn run_docker_exec_io_loop(
    session_id: String,
    mut rx: tokio_mpsc::UnboundedReceiver<TerminalMsg>,
    ah: AppHandle,
    config: &ServerConfig,
    exec_id: &str,
    hijack: &mut crate::docker::transport::DockerHijackConnection,
    initial_cols: u32,
    initial_rows: u32,
) {
    let mut input_buf = Vec::<u8>::new();
    let mut read_buf = [0u8; 8192];
    let mut last_cols = 0;
    let mut last_rows = 0;
    let mut pending_resize = None;

    if resize_docker_exec(config, exec_id, initial_cols, initial_rows).await {
        last_cols = initial_cols;
        last_rows = initial_rows;
    }

    loop {
        if let Some((cols, rows)) = pending_resize
            && resize_docker_exec(config, exec_id, cols, rows).await
        {
            last_cols = cols;
            last_rows = rows;
            pending_resize = None;
        }

        if !input_buf.is_empty() {
            if let Err(error) = hijack.write_all(&input_buf).await {
                let _ = hijack.shutdown().await;
                warn!(
                    target: "shipyardx_lib::services::terminal",
                    "container exec writer failed; session_id={} exec_id={} error={}",
                    session_id,
                    exec_id,
                    error
                );
                send_control(
                    &ah,
                    &session_id,
                    WsServerMsg::Error {
                        error: AppError::unavailable("terminal.exec_write_failed")
                            .with_detail(error.to_string())
                            .retryable(true),
                    },
                );
                return;
            }
            input_buf.clear();
        }

        tokio::select! {
            maybe_msg = rx.recv() => {
                match maybe_msg {
                    Some(TerminalMsg::ClientReady) => {}
                    Some(TerminalMsg::Data(data)) => input_buf.extend_from_slice(&data),
                    Some(TerminalMsg::Resize { cols, rows }) => {
                        if cols != last_cols || rows != last_rows {
                            pending_resize = Some((cols, rows));
                        }
                    }
                    Some(TerminalMsg::Close) | None => {
                        let _ = hijack.shutdown().await;
                        send_control(&ah, &session_id, WsServerMsg::Closed);
                        return;
                    }
                }
            }
            read = hijack.read(&mut read_buf) => {
                match read {
                    Ok(0) => {
                        let _ = hijack.shutdown().await;
                        send_control(&ah, &session_id, WsServerMsg::Closed);
                        return;
                    }
                    Err(error) => {
                        let _ = hijack.shutdown().await;
                        warn!(
                            target: "shipyardx_lib::services::terminal",
                            "container exec reader failed; session_id={} exec_id={} error={}",
                            session_id,
                            exec_id,
                            error
                        );
                        send_control(
                            &ah,
                            &session_id,
                            WsServerMsg::Error {
                                error: AppError::unavailable("terminal.exec_read_failed")
                                    .with_detail(error.to_string())
                                    .retryable(true),
                            },
                        );
                        return;
                    }
                    Ok(n) => send_pty_bytes(&ah, &session_id, &read_buf[..n]),
                }
            }
        }
    }
}

async fn run_terminal_io_loop(
    session_id: String,
    mut rx: tokio_mpsc::UnboundedReceiver<TerminalMsg>,
    ah: AppHandle,
    handle: &mut russh::client::Handle<crate::ssh::client::SshClientHandler>,
    mut channel: russh::Channel<russh::client::Msg>,
    initial_cols: u32,
    initial_rows: u32,
) {
    let mut input_buf = Vec::<u8>::new();
    let mut last_cols = initial_cols;
    let mut last_rows = initial_rows;
    let mut writer = channel.make_writer();

    loop {
        if !input_buf.is_empty() {
            let _ = writer.write_all(&input_buf).await;
            input_buf.clear();
        }

        tokio::select! {
            maybe_msg = rx.recv() => {
                match maybe_msg {
                    Some(TerminalMsg::ClientReady) => {}
                    Some(TerminalMsg::Data(data)) => input_buf.extend_from_slice(&data),
                    Some(TerminalMsg::Resize { cols, rows }) => {
                        if cols != last_cols || rows != last_rows {
                            if !input_buf.is_empty() {
                                let _ = writer.write_all(&input_buf).await;
                                input_buf.clear();
                            }
                            last_cols = cols;
                            last_rows = rows;
                            let _ = channel.window_change(cols, rows, 0, 0).await;
                        }
                    }
                    Some(TerminalMsg::Close) | None => {
                        let _ = channel.close().await;
                        disconnect(handle).await;
                        send_control(&ah, &session_id, WsServerMsg::Closed);
                        return;
                    }
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => send_pty_bytes(&ah, &session_id, &data),
                    Some(ChannelMsg::ExtendedData { data, .. }) => send_pty_bytes(&ah, &session_id, &data),
                    Some(ChannelMsg::ExitStatus { .. }) => {}
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                        disconnect(handle).await;
                        send_control(&ah, &session_id, WsServerMsg::Closed);
                        return;
                    }
                    _ => {}
                }
            }
        }
    }
}

fn dispatch_terminal_msg(ah: &AppHandle, session_id: &str, msg: TerminalMsg) {
    let app_state = ah.state::<AppState>();
    if let Ok(terminals) = lock_read(&app_state.terminals, "terminal.sessions_lock_failed") {
        if let Some(handle) = terminals.get(session_id) {
            let _ = handle.tx.send(msg);
        }
    }
}

fn remove_terminal_session(ah: &AppHandle, session_id: &str) -> Option<TerminalHandle> {
    let app_state = ah.state::<AppState>();

    if let Ok(mut handshakes) = lock_write(&app_state.terminal_handshakes, "terminal.handshake_lock_failed") {
        handshakes.remove(session_id);
    }

    lock_write(&app_state.terminals, "terminal.sessions_lock_failed")
        .ok()
        .and_then(|mut terminals| terminals.remove(session_id))
}

fn handle_client_frame(ah: &AppHandle, session_id: &str, frame: &[u8]) {
    let Some((&tag, body)) = frame.split_first() else {
        return;
    };
    match tag {
        TAG_DATA => {
            if !body.is_empty() {
                dispatch_terminal_msg(ah, session_id, TerminalMsg::Data(body.to_vec()));
            }
        }
        TAG_CTRL => {
            if let Ok(ctrl) = serde_json::from_slice::<WsClientCtrl>(body) {
                match ctrl {
                    WsClientCtrl::ClientReady => {
                        debug!(
                            target: "shipyardx_lib::services::terminal",
                            "terminal client ready received; session_id={}",
                            session_id
                        );
                        mark_client_ready(ah, session_id);
                        dispatch_terminal_msg(ah, session_id, TerminalMsg::ClientReady);
                    }
                    WsClientCtrl::Resize { cols, rows } => {
                        debug!(
                            target: "shipyardx_lib::services::terminal",
                            "terminal resize requested; session_id={} cols={} rows={}",
                            session_id,
                            cols,
                            rows
                        );
                        dispatch_terminal_msg(ah, session_id, TerminalMsg::Resize { cols, rows });
                    }
                    WsClientCtrl::Close => {
                        info!(
                            target: "shipyardx_lib::services::terminal",
                            "terminal close requested by client; session_id={}",
                            session_id
                        );
                        dispatch_terminal_msg(ah, session_id, TerminalMsg::Close);
                    }
                }
            } else {
                warn!(
                    target: "shipyardx_lib::services::terminal",
                    "invalid terminal control frame; session_id={} bytes={}",
                    session_id,
                    body.len()
                );
            }
        }
        _ => {}
    }
}

/// WebSocket 不受同源策略约束，只放行 Tauri 自身来源；不带 Origin 的客户端仍需猜中 session id
fn is_allowed_ws_origin(origin: Option<&str>) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    if matches!(
        origin,
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    ) {
        return true;
    }
    cfg!(debug_assertions) && (origin.starts_with("http://localhost:") || origin.starts_with("http://127.0.0.1:"))
}

fn session_exists(ah: &AppHandle, session_id: &str) -> bool {
    lock_read(&ah.state::<AppState>().terminals, "terminal.sessions_lock_failed")
        .map(|terminals| terminals.contains_key(session_id))
        .unwrap_or(false)
}

async fn run_ws_client(stream: tokio::net::TcpStream, ah: AppHandle) {
    let mut req_path = String::new();
    let mut origin: Option<String> = None;
    #[allow(clippy::result_large_err)]
    let mut ws = match accept_hdr_async(stream, |req: &Request, resp: Response| {
        req_path = req.uri().path().to_string();
        origin = req
            .headers()
            .get("origin")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        Ok(resp)
    })
    .await
    {
        Ok(v) => v,
        Err(_) => return,
    };

    if !is_allowed_ws_origin(origin.as_deref()) {
        warn!(
            target: "shipyardx_lib::services::terminal",
            "rejected terminal websocket from unexpected origin; origin={:?}",
            origin
        );
        let _ = ws.close(None).await;
        return;
    }

    let session_id = req_path.strip_prefix("/terminal/").unwrap_or("").to_string();
    if session_id.is_empty() {
        let _ = ws.close(None).await;
        return;
    }

    // 只接受已登记的会话，否则本地进程能用随机 id 撑大客户端表
    if !session_exists(&ah, &session_id) {
        warn!(
            target: "shipyardx_lib::services::terminal",
            "rejected terminal websocket for unknown session; session_id={}",
            session_id
        );
        let _ = ws.close(None).await;
        return;
    }

    debug!(
        target: "shipyardx_lib::services::terminal",
        "websocket client connected; session_id={}",
        session_id
    );

    let (tx, mut rx) = tokio_mpsc::unbounded_channel::<Vec<u8>>();
    let registered = match lock_write(
        &ah.state::<AppState>().terminal_ws_clients,
        "terminal.ws_clients_lock_failed",
    ) {
        // 已有客户端时拒绝，不让后来者顶掉终端
        Ok(mut clients) if !clients.contains_key(&session_id) => {
            clients.insert(session_id.clone(), tx);
            true
        }
        Ok(_) => {
            warn!(
                target: "shipyardx_lib::services::terminal",
                "rejected duplicate terminal websocket; session_id={}",
                session_id
            );
            false
        }
        Err(_) => false,
    };
    if !registered {
        let _ = ws.close(None).await;
        return;
    }
    mark_client_ready(&ah, &session_id);
    dispatch_terminal_msg(&ah, &session_id, TerminalMsg::ClientReady);

    'ws: loop {
        tokio::select! {
            maybe_frame = rx.recv() => {
                match maybe_frame {
                    Some(frame) => {
                        if ws.send(Message::Binary(frame.into())).await.is_err() {
                            break 'ws;
                        }
                    }
                    None => break 'ws,
                }
            }
            maybe_msg = ws.next() => {
                match maybe_msg {
                    Some(Ok(Message::Binary(bytes))) => handle_client_frame(&ah, &session_id, &bytes),
                    Some(Ok(Message::Close(_))) | None => break 'ws,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break 'ws,
                }
            }
        }
    }

    if let Ok(mut clients) = lock_write(
        &ah.state::<AppState>().terminal_ws_clients,
        "terminal.ws_clients_lock_failed",
    ) {
        clients.remove(&session_id);
    }
    if let Some(handle) = remove_terminal_session(&ah, &session_id) {
        let _ = handle.tx.send(TerminalMsg::Close);
        info!(
            target: "shipyardx_lib::services::terminal",
            "terminal session cleaned up after websocket disconnect; session_id={}",
            session_id
        );
    }
    debug!(
        target: "shipyardx_lib::services::terminal",
        "websocket client disconnected; session_id={}",
        session_id
    );
}

async fn start_terminal_ws_server_once(app_handle: AppHandle) -> AppResult<()> {
    if WS_PORT.get().is_some() {
        return Ok(());
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| AppError::internal("terminal.ws_bind_failed").with_source(e))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::internal("terminal.ws_addr_failed").with_source(e))?
        .port();
    info!(
        target: "shipyardx_lib::services::terminal",
        "terminal websocket server initialized; port={}",
        port
    );

    match WS_PORT.set(port) {
        Ok(()) => {
            spawn_on_runtime(async move {
                while let Ok((stream, _addr)) = listener.accept().await {
                    let ah = app_handle.clone();
                    tokio::spawn(async move {
                        run_ws_client(stream, ah).await;
                    });
                }
            })?;
            Ok(())
        }
        Err(_) => Ok(()),
    }
}

fn terminal_ws_port() -> AppResult<u16> {
    WS_PORT
        .get()
        .copied()
        .ok_or_else(|| AppError::internal("terminal.ws_not_initialized"))
}

pub async fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<TerminalSession> {
    start_terminal_ws_server_once(app_handle.clone()).await?;
    let ws_port = terminal_ws_port()?;
    let server = get_server_config(&state, &server_id)?;
    let session_id = generate_id();
    let (tx, rx) = tokio_mpsc::unbounded_channel::<TerminalMsg>();

    lock_write(&state.terminals, "terminal.sessions_lock_failed")?.insert(session_id.clone(), TerminalHandle { tx });
    lock_write(&state.terminal_handshakes, "terminal.handshake_lock_failed")?
        .insert(session_id.clone(), TerminalHandshakeState::default());

    let sid = session_id.clone();
    let ah = app_handle.clone();
    if let Err(error) = spawn_on_runtime(async move {
        let fail_session_id = sid.clone();
        let fail_handle = ah.clone();
        if let Err(error) = run_terminal_thread(server, sid, rx, ah, cols, rows).await {
            fail_terminal(&fail_handle, &fail_session_id, error);
        }
    }) {
        let _ = lock_write(&state.terminals, "terminal.sessions_lock_failed")
            .map(|mut terminals| terminals.remove(&session_id));
        let _ = lock_write(&state.terminal_handshakes, "terminal.handshake_lock_failed")
            .map(|mut handshakes| handshakes.remove(&session_id));
        return Err(error);
    }
    info!(
        target: "shipyardx_lib::services::terminal",
        "terminal session opened; session_id={} server_id={} ws_port={}",
        session_id,
        server_id,
        ws_port
    );
    Ok(TerminalSession { session_id, ws_port })
}

pub async fn open_container_exec_terminal(
    server_id: String,
    params: ContainerExecTerminalParams,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<TerminalSession> {
    start_terminal_ws_server_once(app_handle.clone()).await?;
    let ws_port = terminal_ws_port()?;
    let server = get_server_config(&state, &server_id)?;
    let session_id = generate_id();
    let (tx, rx) = tokio_mpsc::unbounded_channel::<TerminalMsg>();

    let shell = params.shell.trim().to_string();
    let container_id_for_log = params.container_id.clone();

    let sid = session_id.clone();
    let ah = app_handle.clone();
    lock_write(&state.terminals, "terminal.sessions_lock_failed")?.insert(session_id.clone(), TerminalHandle { tx });
    lock_write(&state.terminal_handshakes, "terminal.handshake_lock_failed")?
        .insert(session_id.clone(), TerminalHandshakeState::default());

    if let Err(error) = spawn_on_runtime(async move {
        let fail_session_id = sid.clone();
        let fail_handle = ah.clone();
        if let Err(error) = run_container_exec_thread(ContainerExecThreadCtx {
            config: server,
            session_id: sid,
            rx,
            ah,
            cols: params.cols,
            rows: params.rows,
            container_id: params.container_id,
            user: params.user,
            shell,
        })
        .await
        {
            fail_terminal(&fail_handle, &fail_session_id, error);
        }
    }) {
        let _ = lock_write(&state.terminals, "terminal.sessions_lock_failed")
            .map(|mut terminals| terminals.remove(&session_id));
        let _ = lock_write(&state.terminal_handshakes, "terminal.handshake_lock_failed")
            .map(|mut handshakes| handshakes.remove(&session_id));
        return Err(error);
    }
    info!(
        target: "shipyardx_lib::services::terminal",
        "container exec session opened; session_id={} server_id={} container_id={} ws_port={}",
        session_id,
        server_id,
        container_id_for_log,
        ws_port
    );
    Ok(TerminalSession { session_id, ws_port })
}

pub async fn close_terminal(session_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let mut terminals = lock_write(&state.terminals, "terminal.sessions_lock_failed")?;
    if let Some(handle) = terminals.remove(&session_id) {
        let _ = handle.tx.send(TerminalMsg::Close);
        if let Ok(mut handshakes) = lock_write(&state.terminal_handshakes, "terminal.handshake_lock_failed") {
            handshakes.remove(&session_id);
        }
        info!(
            target: "shipyardx_lib::services::terminal",
            "terminal session closed; session_id={}",
            session_id
        );
    } else {
        warn!(
            target: "shipyardx_lib::services::terminal",
            "terminal close requested for missing session; session_id={}",
            session_id
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_tauri_webview_origins() {
        assert!(is_allowed_ws_origin(Some("tauri://localhost")));
        assert!(is_allowed_ws_origin(Some("http://tauri.localhost")));
        assert!(is_allowed_ws_origin(Some("https://tauri.localhost")));
    }

    #[test]
    fn rejects_foreign_browser_origins() {
        assert!(!is_allowed_ws_origin(Some("https://evil.example")));
        assert!(!is_allowed_ws_origin(Some("http://tauri.localhost.evil.example")));
        assert!(!is_allowed_ws_origin(Some("null")));
    }

    #[test]
    fn allows_clients_without_origin_header() {
        assert!(is_allowed_ws_origin(None));
    }
}
