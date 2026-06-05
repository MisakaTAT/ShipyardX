use std::sync::mpsc;

use tauri::{AppHandle, Emitter, State};

use crate::docker::client::docker_stream_async;
use crate::models::app::server::ServerConfig;
use crate::state::{AppState, StreamHandle, get_server_config};
use crate::utils::id::generate_id;

struct LogFrameDecoder {
    buffer: Vec<u8>,
    plain_text: bool,
}

impl LogFrameDecoder {
    fn new() -> Self {
        Self {
            buffer: Vec::new(),
            plain_text: false,
        }
    }

    fn push(&mut self, chunk: &[u8]) -> Vec<Vec<u8>> {
        if self.plain_text {
            return vec![chunk.to_vec()];
        }

        self.buffer.extend_from_slice(chunk);
        if !self.looks_like_multiplexed() {
            self.plain_text = true;
            let plain = std::mem::take(&mut self.buffer);
            return (!plain.is_empty()).then_some(plain).into_iter().collect();
        }

        let mut frames = Vec::new();
        let mut offset = 0usize;
        while offset + 8 <= self.buffer.len() {
            let stream_type = self.buffer[offset];
            let size = u32::from_be_bytes([
                self.buffer[offset + 4],
                self.buffer[offset + 5],
                self.buffer[offset + 6],
                self.buffer[offset + 7],
            ]) as usize;

            if stream_type > 2 || offset + 8 + size > self.buffer.len() {
                break;
            }

            offset += 8;
            frames.push(self.buffer[offset..offset + size].to_vec());
            offset += size;
        }

        if offset > 0 {
            self.buffer.drain(..offset);
        }

        frames
    }

    fn finish(self) -> Option<Vec<u8>> {
        if self.plain_text && !self.buffer.is_empty() {
            return Some(self.buffer);
        }
        None
    }

    fn looks_like_multiplexed(&self) -> bool {
        if self.buffer.len() < 8 {
            return true;
        }
        self.buffer[0] <= 2 && self.buffer[1] == 0 && self.buffer[2] == 0 && self.buffer[3] == 0
    }
}

fn run_log_stream_thread(
    config: ServerConfig,
    stream_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    rx: mpsc::Receiver<()>,
    ah: AppHandle,
) {
    crate::ssh::client::block_on(async move {
        let ts = if timestamps { "&timestamps=1" } else { "" };
        let path = format!(
            "/containers/{}/logs?stdout=1&stderr=1&follow=1&tail={}{}",
            container_id, tail, ts
        );

        let mut stream = match docker_stream_async(&config, &path).await {
            Ok(stream) => stream,
            Err(error) => {
                let _ = ah.emit(
                    &format!("log-data:{}", stream_id),
                    format!("\x1b[31m连接失败: {}\x1b[0m\r\n", error.message).into_bytes(),
                );
                let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                return;
            }
        };

        let mut decoder = LogFrameDecoder::new();
        loop {
            match rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            tokio::select! {
                chunk = stream.next_chunk() => {
                    match chunk {
                        Ok(Some(bytes)) => {
                            for frame in decoder.push(&bytes) {
                                let _ = ah.emit(&format!("log-data:{}", stream_id), frame);
                            }
                        }
                        Ok(None) => {
                            if let Some(tail) = decoder.finish() {
                                let _ = ah.emit(&format!("log-data:{}", stream_id), tail);
                            }
                            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                            return;
                        }
                        Err(error) => {
                            let _ = ah.emit(
                                &format!("log-data:{}", stream_id),
                                format!("\x1b[31m日志流中断: {}\x1b[0m\r\n", error.message).into_bytes(),
                            );
                            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(20)) => {}
            }
        }
    });
}

pub fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<AppState>,
    app_handle: AppHandle,
) -> crate::error::AppResult<String> {
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
    if let Some(handle) = state.streams.lock().unwrap().remove(&stream_id) {
        let _ = handle.tx.send(());
    }
}
