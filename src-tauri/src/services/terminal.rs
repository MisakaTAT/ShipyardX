use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::sync::OnceLock;
use std::sync::mpsc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};
use tungstenite::protocol::Message;
use tungstenite::{
    accept_hdr,
    handshake::server::{Request, Response},
};

use crate::models::app::server::ServerConfig;
use crate::models::app::terminal::{ContainerExecTerminalParams, TerminalSession, WsServerMsg};
use crate::ssh::limits::{TERMINAL_SSH_READ_POLL_MS, TERMINAL_WS_IDLE_SLEEP_MS};
use crate::ssh::session::create_ssh_session;
use crate::state::{AppState, TerminalHandle, TerminalMsg, get_server_config};
use crate::utils::id::generate_id;

static WS_PORT: OnceLock<u16> = OnceLock::new();

fn is_safe_docker_ident(v: &str) -> bool {
    if v.is_empty() {
        return false;
    }
    v.bytes()
        .all(|b| matches!(b, b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'-' | b'.'))
}

fn shell_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

fn terminal_ws_send(app: &AppHandle, session_id: &str, message: String) {
    let tx = app
        .state::<AppState>()
        .terminal_ws_clients
        .lock()
        .unwrap()
        .get(session_id)
        .cloned();
    if let Some(tx) = tx {
        let _ = tx.send(message);
    }
}

fn fail_terminal(app: &AppHandle, session_id: &str, message: impl AsRef<str>) {
    let msg = WsServerMsg::Error {
        message: message.as_ref().to_string(),
    };
    terminal_ws_send(app, session_id, msg.to_json());
}

fn run_terminal_thread(
    config: ServerConfig,
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
) {
    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            fail_terminal(&ah, &session_id, e);
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            fail_terminal(&ah, &session_id, format!("通道创建失败: {}", e));
            return;
        }
    };

    if let Err(e) = channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
        fail_terminal(&ah, &session_id, format!("PTY 请求失败: {}", e));
        return;
    }

    if let Err(e) = channel.shell() {
        fail_terminal(&ah, &session_id, format!("Shell 启动失败: {}", e));
        return;
    }

    run_terminal_io_loop(session_id, rx, ah, sess, channel, cols, rows);
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
        fail_terminal(&ah, &session_id, "容器 ID/名称包含非法字符");
        return;
    }

    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            fail_terminal(&ah, &session_id, e);
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            fail_terminal(&ah, &session_id, format!("通道创建失败: {}", e));
            return;
        }
    };

    if let Err(e) = channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
        fail_terminal(&ah, &session_id, format!("PTY 请求失败: {}", e));
        return;
    }

    let mut cmd = String::from("docker exec -it ");
    if let Some(raw_user) = user {
        let trimmed = raw_user.trim();
        if !trimmed.is_empty() {
            cmd.push_str("-u ");
            cmd.push_str(&shell_single_quote(trimmed));
            cmd.push(' ');
        }
    }
    cmd.push_str(&shell_single_quote(&container_id));
    cmd.push(' ');
    cmd.push_str(&shell_single_quote(&shell));
    if let Err(e) = channel.exec(&cmd) {
        fail_terminal(&ah, &session_id, format!("docker exec 启动失败: {}", e));
        return;
    }

    run_terminal_io_loop(session_id, rx, ah, sess, channel, cols, rows);
}

const TERMINAL_SSH_DRAIN_TIMEOUT_MS: u32 = 1;

fn run_terminal_io_loop(
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
    ah: AppHandle,
    sess: ssh2::Session,
    mut channel: ssh2::Channel,
    initial_cols: u32,
    initial_rows: u32,
) {
    sess.set_blocking(true);
    sess.set_timeout(TERMINAL_SSH_READ_POLL_MS);
    let mut buf = [0u8; 8192];
    let mut input_buf = Vec::<u8>::new();
    let mut last_cols = initial_cols;
    let mut last_rows = initial_rows;

    loop {
        loop {
            match rx.try_recv() {
                Ok(TerminalMsg::Data(data)) => {
                    input_buf.extend_from_slice(&data);
                }
                Ok(TerminalMsg::Resize { cols, rows }) => {
                    if cols != last_cols || rows != last_rows {
                        if !input_buf.is_empty() {
                            let _ = channel.write_all(&input_buf);
                            input_buf.clear();
                        }
                        last_cols = cols;
                        last_rows = rows;
                        let _ = channel.request_pty_size(cols, rows, None, None);
                    }
                }
                Ok(TerminalMsg::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close();
                    terminal_ws_send(&ah, &session_id, WsServerMsg::Closed.to_json());
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        if !input_buf.is_empty() {
            let _ = channel.write_all(&input_buf);
            let _ = channel.flush();
            input_buf.clear();
        }

        sess.set_timeout(TERMINAL_SSH_READ_POLL_MS);
        match channel.read(&mut buf) {
            Ok(0) => {
                terminal_ws_send(&ah, &session_id, WsServerMsg::Closed.to_json());
                return;
            }
            Ok(n) => {
                let mut output = buf[..n].to_vec();
                sess.set_timeout(TERMINAL_SSH_DRAIN_TIMEOUT_MS);
                loop {
                    match channel.read(&mut buf) {
                        Ok(0) => {
                            terminal_ws_send(&ah, &session_id, WsServerMsg::Output { data: output }.to_json());
                            terminal_ws_send(&ah, &session_id, WsServerMsg::Closed.to_json());
                            return;
                        }
                        Ok(extra) => output.extend_from_slice(&buf[..extra]),
                        Err(_) => break,
                    }
                }
                terminal_ws_send(&ah, &session_id, WsServerMsg::Output { data: output }.to_json());
            }
            Err(ref e) if e.kind() == ErrorKind::TimedOut => {}
            Err(_) => {
                terminal_ws_send(&ah, &session_id, WsServerMsg::Closed.to_json());
                return;
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum WsClientMsg {
    #[serde(rename = "input")]
    Input { data: Vec<u8> },
    #[serde(rename = "resize")]
    Resize { cols: u32, rows: u32 },
    #[serde(rename = "close")]
    Close,
}

fn forward_ws_to_terminal(ah: &AppHandle, session_id: &str, msg: WsClientMsg) {
    let app_state = ah.state::<AppState>();
    let terminals = app_state.terminals.lock().unwrap();
    let Some(handle) = terminals.get(session_id) else {
        return;
    };
    let send = |m: TerminalMsg| {
        let _ = handle.tx.send(m);
    };
    match msg {
        WsClientMsg::Input { data } => send(TerminalMsg::Data(data)),
        WsClientMsg::Resize { cols, rows } => send(TerminalMsg::Resize { cols, rows }),
        WsClientMsg::Close => send(TerminalMsg::Close),
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

    let (tx, rx) = mpsc::channel::<String>();
    ah.state::<AppState>()
        .terminal_ws_clients
        .lock()
        .unwrap()
        .insert(session_id.clone(), tx);

    let _ = ws.get_mut().set_nonblocking(true);

    'ws: loop {
        while let Ok(msg) = rx.try_recv() {
            let _ = ws.send(Message::Text(msg));
        }

        let mut did_work = false;
        loop {
            match ws.read() {
                Ok(Message::Text(text)) => {
                    did_work = true;
                    if let Ok(msg) = serde_json::from_str::<WsClientMsg>(&text) {
                        forward_ws_to_terminal(&ah, &session_id, msg);
                    }
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
) -> Result<TerminalSession, String> {
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
) -> Result<TerminalSession, String> {
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

fn send_terminal_msg(state: &State<AppState>, session_id: &str, msg: TerminalMsg) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    let Some(handle) = terminals.get(session_id) else {
        return Ok(());
    };
    handle.tx.send(msg).map_err(|e| e.to_string())
}

pub fn write_terminal(session_id: String, data: Vec<u8>, state: State<AppState>) -> Result<(), String> {
    send_terminal_msg(&state, &session_id, TerminalMsg::Data(data))
}

pub fn resize_terminal(session_id: String, cols: u32, rows: u32, state: State<AppState>) -> Result<(), String> {
    send_terminal_msg(&state, &session_id, TerminalMsg::Resize { cols, rows })
}

pub fn close_terminal(session_id: String, state: State<AppState>) -> Result<(), String> {
    let mut terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.remove(&session_id) {
        let _ = handle.tx.send(TerminalMsg::Close);
    }
    Ok(())
}
