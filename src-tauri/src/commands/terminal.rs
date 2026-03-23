use std::io::{Read, Write};
use std::sync::mpsc;

use tauri::{AppHandle, Emitter, State};

use crate::models::ServerConfig;
use crate::ssh::create_ssh_session;
use crate::state::{get_server_config, AppState, TerminalHandle, TerminalMsg};
use crate::store::generate_id;

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
            let _ = ah.emit(
                &format!("terminal-output:{}", session_id),
                format!("\x1b[31m{}\x1b[0m\r\n", e).into_bytes(),
            );
            let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let _ = ah.emit(
                &format!("terminal-output:{}", session_id),
                format!("\x1b[31m通道创建失败: {}\x1b[0m\r\n", e),
            );
            let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
            return;
        }
    };

    if let Err(e) = channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
        let _ = ah.emit(
            &format!("terminal-output:{}", session_id),
            format!("\x1b[31mPTY 请求失败: {}\x1b[0m\r\n", e),
        );
        let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
        return;
    }

    if let Err(e) = channel.shell() {
        let _ = ah.emit(
            &format!("terminal-output:{}", session_id),
            format!("\x1b[31mShell 启动失败: {}\x1b[0m\r\n", e).into_bytes(),
        );
        let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
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
                    let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        // 读取 SSH 输出
        match channel.read(&mut buf) {
            Ok(0) => {
                let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
                return;
            }
            Ok(n) => {
                let _ = ah.emit(
                    &format!("terminal-output:{}", session_id),
                    buf[..n].to_vec(),
                );
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(8));
            }
            Err(_) => {
                let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
                return;
            }
        }

        if channel.eof() {
            let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
            return;
        }
    }
}

#[tauri::command]
pub fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
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
    Ok(session_id)
}

#[tauri::command]
pub fn write_terminal(
    session_id: String,
    data: Vec<u8>,
    state: State<AppState>,
) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.get(&session_id) {
        handle.tx.send(TerminalMsg::Data(data)).map_err(|e| e.to_string())?;
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
