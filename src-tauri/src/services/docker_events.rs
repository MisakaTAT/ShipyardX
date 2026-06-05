use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::contracts::docker_api::events::StreamEvent;
use crate::contracts::frontend::events::{
    DockerEvent, DockerStreamError, DockerStreamPayload, DockerStreamRefresh, DockerStreamStatus, EventStreamStatus,
};
use crate::contracts::frontend::server::ServerConfig;
use crate::docker::client::docker_stream_async;
use crate::error::{AppError, AppResult};
use crate::ssh::client::block_on;
use crate::state::{AppState, EventStreamHandle, get_server_config};
use crate::utils::id::generate_id;

const HIDDEN_ATTR_KEYS: &[&str] = &["name", "image", "maintainer", "desktop.docker.binds"];

fn build_detail(event_type: &str, action: &str, attrs: &std::collections::HashMap<String, String>) -> String {
    let mut parts: Vec<String> = Vec::new();

    if let Some(code) = attrs.get("exitCode") {
        parts.push(format!("exit={}", code));
    }
    if let Some(sig) = attrs.get("signal") {
        parts.push(format!("signal={}", sig));
    }
    if event_type == "network" {
        if let Some(ntype) = attrs.get("type") {
            parts.push(format!("driver={}", ntype));
        }
        if let Some(container) = attrs.get("container") {
            let short = if container.len() > 12 {
                &container[..12]
            } else {
                container.as_str()
            };
            parts.push(format!("container={}", short));
        }
    }
    if event_type == "volume"
        && let Some(driver) = attrs.get("driver")
    {
        parts.push(format!("driver={}", driver));
    }
    if action == "health_status"
        && let Some(hs) = attrs.get("health_status")
    {
        parts.push(hs.clone());
    }

    if parts.is_empty() {
        for (k, v) in attrs {
            if HIDDEN_ATTR_KEYS.contains(&k.as_str()) {
                continue;
            }
            if !v.is_empty() && parts.len() < 3 {
                parts.push(format!("{}={}", k, if v.len() > 24 { &v[..24] } else { v }));
            }
        }
    }

    parts.join(", ")
}

fn parse_docker_event(json: &str) -> Option<DockerEvent> {
    let raw: StreamEvent = serde_json::from_str(json).ok()?;
    if raw.action.starts_with("exec_") {
        return None;
    }
    let actor_id = if raw.actor.id.len() > 12 {
        raw.actor.id[..12].to_string()
    } else {
        raw.actor.id
    };
    let actor_name = raw.actor.attributes.get("name").cloned().unwrap_or_default();
    let actor_image = raw.actor.attributes.get("image").cloned().unwrap_or_default();
    let detail = build_detail(&raw.event_type, &raw.action, &raw.actor.attributes);
    Some(DockerEvent {
        event_type: raw.event_type,
        action: raw.action,
        actor_id,
        actor_name,
        actor_image,
        scope: raw.scope.unwrap_or_default(),
        time: raw.time.unwrap_or(0),
        time_nano: raw.time_nano.unwrap_or(0),
        detail,
    })
}

fn is_refresh_event(event_type: &str, action: &str) -> bool {
    match event_type {
        "container" => matches!(
            action,
            "create" | "destroy" | "start" | "stop" | "restart" | "die" | "pause" | "unpause" | "kill" | "rename"
        ),
        "image" => matches!(action, "delete" | "import" | "load" | "pull" | "push" | "tag" | "untag"),
        "network" => matches!(action, "create" | "destroy" | "connect" | "disconnect" | "remove"),
        "volume" => matches!(action, "create" | "destroy" | "mount" | "unmount"),
        _ => false,
    }
}

const RECONNECT_DELAYS: &[u64] = &[1, 2, 4, 8, 15, 30];
const THROTTLE_MS: u128 = 500;

enum StreamLoopExit {
    Stopped,
    Reconnect(Option<AppError>),
}

fn emit_stream_status(
    ah: &AppHandle,
    stream_id: &str,
    status_slot: &Arc<Mutex<EventStreamStatus>>,
    status: EventStreamStatus,
) {
    *status_slot.lock().unwrap() = status;
    let _ = DockerStreamStatus {
        stream_id: stream_id.to_string(),
        status,
    }
    .emit(ah);
}

fn run_event_stream_thread(
    config: ServerConfig,
    stream_id: String,
    status_slot: Arc<Mutex<EventStreamStatus>>,
    rx: mpsc::Receiver<()>,
    ah: AppHandle,
) {
    let mut attempt = 0usize;

    loop {
        if rx.try_recv().is_ok() || matches!(rx.try_recv(), Err(mpsc::TryRecvError::Disconnected)) {
            emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Stopped);
            return;
        }

        emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Connecting);

        let stream_result = block_on(async {
            let mut stream = match docker_stream_async(&config, "/events").await {
                Ok(stream) => stream,
                Err(error) => {
                    return Ok::<StreamLoopExit, AppError>(StreamLoopExit::Reconnect(Some(
                        AppError::unavailable("docker.events_start_failed", "启动 Docker 事件流失败")
                            .with_detail(error.detail.unwrap_or(error.message))
                            .retryable(true),
                    )));
                }
            };

            emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Connected);

            let mut line_buf = String::new();
            let mut last_refresh: Option<Instant> = None;

            loop {
                match rx.try_recv() {
                    Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                        return Ok::<StreamLoopExit, AppError>(StreamLoopExit::Stopped);
                    }
                    Err(mpsc::TryRecvError::Empty) => {}
                }

                tokio::select! {
                    chunk = stream.next_chunk() => {
                        match chunk {
                            Ok(Some(data)) => {
                                let chunk = String::from_utf8_lossy(&data);
                                line_buf.push_str(&chunk);

                                while let Some(pos) = line_buf.find('\n') {
                                    let line: String = line_buf.drain(..=pos).collect();
                                    let trimmed = line.trim();
                                    if trimmed.is_empty() {
                                        continue;
                                    }

                                    if let Some(event) = parse_docker_event(trimmed) {
                                        let event_type = event.event_type.clone();
                                        let action = event.action.clone();
                                        let _ = DockerStreamPayload {
                                            stream_id: stream_id.clone(),
                                            event,
                                        }
                                        .emit(&ah);

                                        if is_refresh_event(&event_type, &action) {
                                            let now = Instant::now();
                                            let should_emit = match last_refresh {
                                                Some(t) => now.duration_since(t).as_millis() >= THROTTLE_MS,
                                                None => true,
                                            };
                                            if should_emit {
                                                let _ = DockerStreamRefresh {
                                                    stream_id: stream_id.clone(),
                                                    resource: event_type,
                                                }
                                                .emit(&ah);
                                                last_refresh = Some(now);
                                            }
                                        }
                                    }
                                }
                            }
                            Ok(None) => return Ok(StreamLoopExit::Reconnect(None)),
                            Err(error) => return Ok(StreamLoopExit::Reconnect(Some(error))),
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_millis(50)) => {}
                }
            }
        });

        match stream_result {
            Ok(StreamLoopExit::Stopped) => {
                emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Stopped);
                return;
            }
            Ok(StreamLoopExit::Reconnect(error)) => {
                attempt = 0;
                if let Some(error) = error {
                    let _ = DockerStreamError {
                        stream_id: stream_id.clone(),
                        error,
                    }
                    .emit(&ah);
                }
            }
            Err(error) => {
                let _ = DockerStreamError {
                    stream_id: stream_id.clone(),
                    error,
                }
                .emit(&ah);
                attempt += 1;
            }
        }

        emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Disconnected);
        if wait_or_stop(&rx, reconnect_delay(attempt)) {
            emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Stopped);
            return;
        }
    }
}

fn reconnect_delay(attempt: usize) -> Duration {
    let secs = RECONNECT_DELAYS
        .get(attempt)
        .copied()
        .unwrap_or(*RECONNECT_DELAYS.last().unwrap());
    Duration::from_secs(secs)
}

fn wait_or_stop(rx: &mpsc::Receiver<()>, duration: Duration) -> bool {
    match rx.recv_timeout(duration) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => true,
        Err(mpsc::RecvTimeoutError::Timeout) => false,
    }
}

pub fn start_event_stream(server_id: String, state: State<AppState>, app_handle: AppHandle) -> AppResult<String> {
    let server = get_server_config(&state, &server_id)?;

    {
        let streams = state.event_streams.lock().unwrap();
        if let Some(existing) = streams.get(&server_id) {
            let current = *existing.status.lock().unwrap();
            let _ = DockerStreamStatus {
                stream_id: existing.stream_id.clone(),
                status: current,
            }
            .emit(&app_handle);
            return Ok(existing.stream_id.clone());
        }
    }

    let stream_id = generate_id();
    let (tx, rx) = mpsc::channel::<()>();
    let status = Arc::new(Mutex::new(EventStreamStatus::Connecting));

    let sid = stream_id.clone();
    let status_for_thread = status.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_event_stream_thread(server, sid, status_for_thread, rx, ah));

    state.event_streams.lock().unwrap().insert(
        server_id,
        EventStreamHandle {
            stream_id: stream_id.clone(),
            tx,
            status,
        },
    );

    Ok(stream_id)
}

pub fn stop_event_stream(server_id: String, state: State<AppState>) {
    if let Some(h) = state.event_streams.lock().unwrap().remove(&server_id) {
        let _ = h.tx.send(());
    }
}
