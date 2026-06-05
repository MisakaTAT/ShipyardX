use std::fs;
use std::net::TcpListener;
use std::sync::OnceLock;
use std::sync::mpsc;
use std::time::Duration;

use russh::ChannelMsg;
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use tungstenite::protocol::Message;
use tungstenite::{
    accept_hdr,
    handshake::server::{Request, Response},
};

use crate::contracts::docker_api::container::{ContainerExecCreate, ContainerExecCreateResponse, ContainerExecStart};
use crate::contracts::frontend::server::ServerConfig;
use crate::contracts::frontend::terminal::{ContainerExecTerminalParams, TerminalSession, WsClientCtrl, WsServerMsg};
use crate::docker::client::{docker_post_async, docker_post_json_hijack_async, docker_post_json_response_async};
use crate::error::{AppError, AppResult};
use crate::ssh::client::{block_on, connect, disconnect};
use crate::ssh::limits::{TERMINAL_SSH_READ_POLL_MS, TERMINAL_WS_IDLE_SLEEP_MS};
use crate::state::{AppState, TerminalHandle, TerminalMsg, get_server_config};
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

pub fn save_terminal_export(path: String, content: String) -> AppResult<()> {
    fs::write(&path, content)
        .map_err(|e| AppError::internal("terminal.export_write_failed", "写入终端导出文件失败").with_source(e))?;
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
    let tx = app
        .state::<AppState>()
        .terminal_ws_clients
        .lock()
        .unwrap()
        .get(session_id)
        .cloned();
    if let Some(tx) = tx {
        let _ = tx.send(frame);
    }
}

fn send_control(app: &AppHandle, session_id: &str, msg: WsServerMsg) {
    terminal_ws_send(app, session_id, ctrl_frame(&msg.to_json()));
}

fn send_pty_bytes(app: &AppHandle, session_id: &str, bytes: &[u8]) {
    terminal_ws_send(app, session_id, pty_frame(bytes));
}

fn fail_terminal(app: &AppHandle, session_id: &str, error: impl Into<AppError>) {
    send_control(app, session_id, WsServerMsg::Error { error: error.into() });
}

fn run_terminal_thread(
    config: ServerConfig,
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
) {
    let fail_session_id = session_id.clone();
    let fail_handle = ah.clone();
    let result = block_on(async move {
        let mut handle = connect(&config).await?;
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::internal("terminal.channel_open_failed", "终端通道创建失败").with_source(e))?;

        channel
            .request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| AppError::internal("terminal.pty_request_failed", "请求终端 PTY 失败").with_source(e))?;
        channel
            .request_shell(true)
            .await
            .map_err(|e| AppError::internal("terminal.shell_start_failed", "启动远程 Shell 失败").with_source(e))?;

        run_terminal_io_loop(session_id, rx, ah, &mut handle, channel, cols, rows).await;
        Ok::<(), AppError>(())
    });

    if let Err(e) = result {
        fail_terminal(&fail_handle, &fail_session_id, e);
    }
}

struct ContainerExecThreadCtx {
    config: ServerConfig,
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
    container_id: String,
    user: Option<String>,
    shell: String,
}

fn run_container_exec_thread(ctx: ContainerExecThreadCtx) {
    let ContainerExecThreadCtx {
        config,
        session_id,
        rx,
        ah,
        cols,
        rows,
        container_id,
        user,
        shell,
    } = ctx;

    if !is_safe_docker_ident(&container_id) {
        fail_terminal(
            &ah,
            &session_id,
            AppError::validation("terminal.container_id_invalid", "容器 ID/名称包含非法字符"),
        );
        return;
    }

    let fail_session_id = session_id.clone();
    let fail_handle = ah.clone();
    let result = block_on(async move {
        let shell = if shell.trim().is_empty() {
            "/bin/sh".to_string()
        } else {
            shell.trim().to_string()
        };
        let exec = ContainerExecCreate {
            attach_stdin: true,
            attach_stdout: true,
            attach_stderr: true,
            tty: true,
            open_stdin: true,
            cmd: vec![shell],
            user: user
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
        };
        let raw = docker_post_json_response_async(&config, &format!("/containers/{container_id}/exec"), &exec).await?;
        let created: ContainerExecCreateResponse = serde_json::from_str(raw.trim()).map_err(|e| {
            AppError::internal("terminal.exec_create_parse_failed", "解析容器终端创建结果失败").with_source(e)
        })?;
        let start = ContainerExecStart {
            detach: false,
            tty: true,
        };
        let mut hijack = docker_post_json_hijack_async(&config, &format!("/exec/{}/start", created.id), &start).await?;

        run_docker_exec_io_loop(session_id, rx, ah, &config, &created.id, &mut hijack, cols, rows).await;
        Ok::<(), AppError>(())
    });

    if let Err(e) = result {
        fail_terminal(&fail_handle, &fail_session_id, e);
    }
}

async fn resize_docker_exec(config: &ServerConfig, exec_id: &str, cols: u32, rows: u32) -> bool {
    if cols == 0 || rows == 0 {
        return false;
    }
    docker_post_async(config, &format!("/exec/{exec_id}/resize?h={rows}&w={cols}"))
        .await
        .is_ok()
}

async fn run_docker_exec_io_loop(
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
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

    if resize_docker_exec(config, exec_id, initial_cols, initial_rows).await {
        last_cols = initial_cols;
        last_rows = initial_rows;
    }

    loop {
        let mut pending_resize = None;

        loop {
            match rx.try_recv() {
                Ok(TerminalMsg::Data(data)) => input_buf.extend_from_slice(&data),
                Ok(TerminalMsg::Resize { cols, rows }) => {
                    if cols != last_cols || rows != last_rows {
                        pending_resize = Some((cols, rows));
                    }
                }
                Ok(TerminalMsg::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                    hijack.close().await;
                    send_control(&ah, &session_id, WsServerMsg::Closed);
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        if let Some((cols, rows)) = pending_resize
            && resize_docker_exec(config, exec_id, cols, rows).await
        {
            last_cols = cols;
            last_rows = rows;
        }

        if !input_buf.is_empty() {
            if hijack.write_all(&input_buf).await.is_err() {
                hijack.close().await;
                send_control(&ah, &session_id, WsServerMsg::Closed);
                return;
            }
            input_buf.clear();
        }

        match tokio::time::timeout(
            Duration::from_millis(TERMINAL_SSH_READ_POLL_MS as u64),
            hijack.read(&mut read_buf),
        )
        .await
        {
            Ok(Ok(0)) => {
                hijack.close().await;
                send_control(&ah, &session_id, WsServerMsg::Closed);
                return;
            }
            Ok(Ok(n)) => send_pty_bytes(&ah, &session_id, &read_buf[..n]),
            Ok(Err(_)) => {
                hijack.close().await;
                send_control(&ah, &session_id, WsServerMsg::Closed);
                return;
            }
            Err(_) => {}
        }
    }
}

async fn run_terminal_io_loop(
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
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
        loop {
            match rx.try_recv() {
                Ok(TerminalMsg::Data(data)) => {
                    input_buf.extend_from_slice(&data);
                }
                Ok(TerminalMsg::Resize { cols, rows }) => {
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
                Ok(TerminalMsg::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close().await;
                    disconnect(handle).await;
                    send_control(&ah, &session_id, WsServerMsg::Closed);
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        if !input_buf.is_empty() {
            let _ = writer.write_all(&input_buf).await;
            input_buf.clear();
        }

        tokio::select! {
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
            _ = tokio::time::sleep(Duration::from_millis(TERMINAL_SSH_READ_POLL_MS as u64)) => {}
        }
    }
}

fn dispatch_terminal_msg(ah: &AppHandle, session_id: &str, msg: TerminalMsg) {
    let app_state = ah.state::<AppState>();
    let terminals = app_state.terminals.lock().unwrap();
    if let Some(handle) = terminals.get(session_id) {
        let _ = handle.tx.send(msg);
    }
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
                    WsClientCtrl::Resize { cols, rows } => {
                        dispatch_terminal_msg(ah, session_id, TerminalMsg::Resize { cols, rows });
                    }
                    WsClientCtrl::Close => {
                        dispatch_terminal_msg(ah, session_id, TerminalMsg::Close);
                    }
                }
            }
        }
        _ => {}
    }
}

fn run_ws_client(stream: std::net::TcpStream, ah: AppHandle) {
    let mut req_path = String::new();
    #[allow(clippy::result_large_err)]
    let mut ws = match accept_hdr(stream, |req: &Request, resp: Response| {
        req_path = req.uri().path().to_string();
        Ok(resp)
    }) {
        Ok(v) => v,
        Err(_) => return,
    };

    let session_id = req_path.strip_prefix("/terminal/").unwrap_or("").to_string();
    if session_id.is_empty() {
        let _ = ws.close(None);
        return;
    }

    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    ah.state::<AppState>()
        .terminal_ws_clients
        .lock()
        .unwrap()
        .insert(session_id.clone(), tx);

    let _ = ws.get_mut().set_nonblocking(true);

    'ws: loop {
        while let Ok(frame) = rx.try_recv() {
            let _ = ws.send(Message::Binary(frame));
        }

        let mut did_work = false;
        loop {
            match ws.read() {
                Ok(Message::Binary(bytes)) => {
                    did_work = true;
                    handle_client_frame(&ah, &session_id, &bytes);
                }
                Ok(Message::Close(_)) => break 'ws,
                Ok(_) => did_work = true,
                Err(tungstenite::Error::Io(e)) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(_) => break 'ws,
            }
        }

        if !did_work {
            std::thread::sleep(Duration::from_millis(TERMINAL_WS_IDLE_SLEEP_MS));
        }
    }

    ah.state::<AppState>()
        .terminal_ws_clients
        .lock()
        .unwrap()
        .remove(&session_id);
}

fn start_terminal_ws_server_once(app_handle: AppHandle) {
    let _ = WS_PORT.get_or_init(move || {
        let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind terminal ws server");
        let port = listener.local_addr().expect("failed to read terminal ws addr").port();

        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let ah = app_handle.clone();
                std::thread::spawn(move || run_ws_client(stream, ah));
            }
        });
        port
    });
}

fn terminal_ws_port() -> u16 {
    *WS_PORT
        .get()
        .expect("terminal ws server must be initialized before reading port")
}

pub fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app_handle: AppHandle,
) -> AppResult<TerminalSession> {
    start_terminal_ws_server_once(app_handle.clone());
    let ws_port = terminal_ws_port();
    let server = get_server_config(&state, &server_id)?;
    let session_id = generate_id();
    let (tx, rx) = mpsc::channel::<TerminalMsg>();

    let sid = session_id.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_terminal_thread(server, sid, rx, ah, cols, rows));

    state
        .terminals
        .lock()
        .unwrap()
        .insert(session_id.clone(), TerminalHandle { tx });
    Ok(TerminalSession { session_id, ws_port })
}

pub fn open_container_exec_terminal(
    server_id: String,
    params: ContainerExecTerminalParams,
    state: State<AppState>,
    app_handle: AppHandle,
) -> AppResult<TerminalSession> {
    start_terminal_ws_server_once(app_handle.clone());
    let ws_port = terminal_ws_port();
    let server = get_server_config(&state, &server_id)?;
    let session_id = generate_id();
    let (tx, rx) = mpsc::channel::<TerminalMsg>();

    let shell = params.shell.trim().to_string();

    let sid = session_id.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || {
        run_container_exec_thread(ContainerExecThreadCtx {
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
    });

    state
        .terminals
        .lock()
        .unwrap()
        .insert(session_id.clone(), TerminalHandle { tx });
    Ok(TerminalSession { session_id, ws_port })
}

pub fn close_terminal(session_id: String, state: State<AppState>) -> AppResult<()> {
    let mut terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.remove(&session_id) {
        let _ = handle.tx.send(TerminalMsg::Close);
    }
    Ok(())
}
