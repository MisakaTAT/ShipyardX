use std::io::Read;
use std::sync::mpsc;

use tauri::{AppHandle, Emitter, State};

use crate::core::models::ServerConfig;
use crate::core::ssh::create_ssh_session;
use crate::core::state::{get_server_config, AppState, StreamHandle};
use crate::utils::id::generate_id;

fn run_log_stream_thread(
    config: ServerConfig,
    stream_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    rx: mpsc::Receiver<()>,
    ah: AppHandle,
) {
    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            let _ = ah.emit(
                &format!("log-data:{}", stream_id),
                format!("\x1b[31m连接失败: {}\x1b[0m\r\n", e).into_bytes(),
            );
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    };

    let ts_flag = if timestamps { "--timestamps " } else { "" };
    let cmd = format!("docker logs -f --tail {} {}{}  2>&1", tail, ts_flag, container_id);

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let _ = ah.emit(
                &format!("log-data:{}", stream_id),
                format!("\x1b[31m通道失败: {}\x1b[0m\r\n", e).into_bytes(),
            );
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    };

    if let Err(e) = channel.exec(&cmd) {
        let _ = ah.emit(
            &format!("log-data:{}", stream_id),
            format!("\x1b[31m启动失败: {}\x1b[0m\r\n", e).into_bytes(),
        );
        let _ = ah.emit(&format!("log-done:{}", stream_id), ());
        return;
    }

    sess.set_blocking(false);
    let mut buf = [0u8; 8192];

    loop {
        match rx.try_recv() {
            Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                return;
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }

        match channel.read(&mut buf) {
            Ok(0) => {
                let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                return;
            }
            Ok(n) => {
                let _ = ah.emit(&format!("log-data:{}", stream_id), buf[..n].to_vec());
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(_) => {
                let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                return;
            }
        }

        if channel.eof() {
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    }
}

pub fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    let stream_id = generate_id();
    let (tx, rx) = mpsc::channel::<()>();

    let sid = stream_id.clone();
    let cid = container_id.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_log_stream_thread(server, sid, cid, tail, timestamps, rx, ah));

    state
        .streams
        .lock()
        .unwrap()
        .insert(stream_id.clone(), StreamHandle { tx });
    Ok(stream_id)
}

pub fn stop_log_stream(stream_id: String, state: State<AppState>) {
    if let Some(h) = state.streams.lock().unwrap().remove(&stream_id) {
        let _ = h.tx.send(());
    }
}
