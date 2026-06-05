use std::sync::mpsc;

use russh::ChannelMsg;
use tauri::{AppHandle, Emitter, State};

use crate::models::app::server::ServerConfig;
use crate::ssh::client::{block_on, connect, disconnect, map_error};
use crate::state::{AppState, StreamHandle, get_server_config};
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
    let result = block_on(async move {
        let mut handle = match connect(&config).await {
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

        let mut channel = match handle.channel_open_session().await {
            Ok(c) => c,
            Err(e) => {
                let _ = ah.emit(
                    &format!("log-data:{}", stream_id),
                    format!("\x1b[31m通道失败: {}\x1b[0m\r\n", map_error("通道失败", e)).into_bytes(),
                );
                let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                return;
            }
        };

        if let Err(e) = channel.exec(true, cmd).await {
            let _ = ah.emit(
                &format!("log-data:{}", stream_id),
                format!("\x1b[31m启动失败: {}\x1b[0m\r\n", map_error("启动失败", e)).into_bytes(),
            );
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }

        loop {
            match rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close().await;
                    let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                    disconnect(&mut handle).await;
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            tokio::select! {
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                            let _ = ah.emit(&format!("log-data:{}", stream_id), data.to_vec());
                        }
                        Some(ChannelMsg::ExitStatus { .. }) => {}
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                            disconnect(&mut handle).await;
                            return;
                        }
                        _ => {}
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(20)) => {}
            }
        }
    });

    let _ = result;
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
