use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::sync::OnceLock;

use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tungstenite::protocol::Message;
use tungstenite::{
    accept_hdr,
    handshake::server::{Request, Response},
};

use crate::core::models::ServerConfig;
use crate::core::ssh::create_ssh_session;
use crate::core::state::{get_server_config, AppState, TerminalHandle, TerminalMsg};
use crate::utils::id::generate_id;

static WS_PORT: OnceLock<u16> = OnceLock::new();

fn run_terminal_thread(
    config: ServerConfig,
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
) {
    let send_ws = |session_id: &str, msg: String, ah: &AppHandle| {
        if let Some(tx) = ah
            .state::<AppState>()
            .terminal_ws_clients
            .lock()
            .unwrap()
            .get(session_id)
            .cloned()
        {
            let _ = tx.send(msg);
        }
    };

    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            send_ws(
                &session_id,
                json!({
                    "type": "output",
                    "data": format!("\x1b[31m{}\x1b[0m\r\n", e).into_bytes()
                })
                .to_string(),
                &ah,
            );
            send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            send_ws(
                &session_id,
                json!({
                    "type": "output",
                    "data": format!("\x1b[31m通道创建失败: {}\x1b[0m\r\n", e).into_bytes()
                })
                .to_string(),
                &ah,
            );
            send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
            return;
        }
    };

    if let Err(e) = channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
        send_ws(
            &session_id,
            json!({
                "type": "output",
                "data": format!("\x1b[31mPTY 请求失败: {}\x1b[0m\r\n", e).into_bytes()
            })
            .to_string(),
            &ah,
        );
        send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
        return;
    }

    if let Err(e) = channel.shell() {
        send_ws(
            &session_id,
            json!({
                "type": "output",
                "data": format!("\x1b[31mShell 启动失败: {}\x1b[0m\r\n", e).into_bytes()
            })
            .to_string(),
            &ah,
        );
        send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
        return;
    }

    sess.set_blocking(false);
    let mut buf = [0u8; 8192];

    loop {
        // 处理来自前端的消息
        loop {
            match rx.try_recv() {
                Ok(TerminalMsg::Data(data)) => {
                    sess.set_blocking(true);
                    let _ = channel.write_all(&data);
                    let _ = channel.flush();
                    sess.set_blocking(false);
                }
                Ok(TerminalMsg::Resize { cols, rows }) => {
                    sess.set_blocking(true);
                    let _ = channel.request_pty_size(cols, rows, None, None);
                    sess.set_blocking(false);
                }
                Ok(TerminalMsg::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close();
                    send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        // 读取 SSH 输出
        match channel.read(&mut buf) {
            Ok(0) => {
                send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
                return;
            }
            Ok(n) => {
                send_ws(
                    &session_id,
                    json!({ "type": "output", "data": buf[..n].to_vec() }).to_string(),
                    &ah,
                );
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(8));
            }
            Err(_) => {
                send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
                return;
            }
        }

        if channel.eof() {
            send_ws(&session_id, json!({ "type": "closed" }).to_string(), &ah);
            return;
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

fn start_terminal_ws_server_once(app_handle: AppHandle) {
    let _ = WS_PORT.get_or_init(move || {
        let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind terminal ws server");
        let port = listener
            .local_addr()
            .expect("failed to read terminal ws addr")
            .port();

        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let ah = app_handle.clone();
                std::thread::spawn(move || {
                    let mut req_path = String::new();
                    let mut ws = match accept_hdr(stream, |req: &Request, resp: Response| {
                        req_path = req.uri().path().to_string();
                        Ok(resp)
                    }) {
                        Ok(v) => v,
                        Err(_) => return,
                    };

                    let session_id = req_path
                        .strip_prefix("/terminal/")
                        .unwrap_or("")
                        .to_string();
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

                    loop {
                        loop {
                            match rx.try_recv() {
                                Ok(msg) => {
                                    if ws.send(Message::Text(msg)).is_err() {
                                        break;
                                    }
                                }
                                Err(mpsc::TryRecvError::Empty) => break,
                                Err(mpsc::TryRecvError::Disconnected) => break,
                            }
                        }

                        match ws.read() {
                            Ok(Message::Text(text)) => {
                                if let Ok(msg) = serde_json::from_str::<WsClientMsg>(&text) {
                                    let app_state = ah.state::<AppState>();
                                    let terminals = app_state.terminals.lock().unwrap();
                                    if let Some(handle) = terminals.get(&session_id) {
                                        match msg {
                                            WsClientMsg::Input { data } => {
                                                let _ = handle.tx.send(TerminalMsg::Data(data));
                                            }
                                            WsClientMsg::Resize { cols, rows } => {
                                                let _ = handle
                                                    .tx
                                                    .send(TerminalMsg::Resize { cols, rows });
                                            }
                                            WsClientMsg::Close => {
                                                let _ = handle.tx.send(TerminalMsg::Close);
                                            }
                                        }
                                    }
                                }
                            }
                            Ok(Message::Close(_)) => break,
                            Ok(_) => {}
                            Err(tungstenite::Error::Io(e))
                                if e.kind() == std::io::ErrorKind::WouldBlock => {}
                            Err(_) => break,
                        }

                        std::thread::sleep(std::time::Duration::from_millis(8));
                    }

                    ah.state::<AppState>()
                        .terminal_ws_clients
                        .lock()
                        .unwrap()
                        .remove(&session_id);
                });
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

#[derive(Serialize)]
pub struct OpenTerminalResult {
    pub session_id: String,
    pub ws_port: u16,
}

#[tauri::command]
pub fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<OpenTerminalResult, String> {
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
    Ok(OpenTerminalResult {
        session_id,
        ws_port,
    })
}

#[tauri::command]
pub fn write_terminal(
    session_id: String,
    data: Vec<u8>,
    state: State<AppState>,
) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.get(&session_id) {
        handle
            .tx
            .send(TerminalMsg::Data(data))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    session_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.get(&session_id) {
        handle
            .tx
            .send(TerminalMsg::Resize { cols, rows })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_terminal(session_id: String, state: State<AppState>) -> Result<(), String> {
    let mut terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.remove(&session_id) {
        let _ = handle.tx.send(TerminalMsg::Close);
    }
    Ok(())
}
