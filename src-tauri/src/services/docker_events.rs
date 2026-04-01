use std::io::Read;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, State};

use crate::core::docker::resolve_api_version;
use crate::core::ssh::create_ssh_session;
use crate::core::state::{get_server_config, AppState, EventStreamHandle};
use crate::models::docker::events::StreamEvent;
use crate::models::app::events::DockerEvent;
use crate::models::app::server::ServerConfig;
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
    if event_type == "volume" && let Some(driver) = attrs.get("driver") {
        parts.push(format!("driver={}", driver));
    }
    if action == "health_status" && let Some(hs) = attrs.get("health_status") {
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

fn run_event_stream_thread(config: ServerConfig, stream_id: String, rx: mpsc::Receiver<()>, ah: AppHandle) {
    let mut attempt = 0usize;

    loop {
        if rx.try_recv().is_ok() || matches!(rx.try_recv(), Err(mpsc::TryRecvError::Disconnected)) {
            let _ = ah.emit(&format!("docker-events-status:{}", stream_id), "stopped");
            return;
        }

        let _ = ah.emit(&format!("docker-events-status:{}", stream_id), "connecting");

        let ver = match resolve_api_version(&config) {
            Ok(v) => v,
            Err(e) => {
                let _ = ah.emit(
                    &format!("docker-events-error:{}", stream_id),
                    format!("获取 API 版本失败: {}", e),
                );
                wait_or_stop(&rx, reconnect_delay(attempt));
                attempt += 1;
                continue;
            }
        };

        let sess = match create_ssh_session(&config) {
            Ok(s) => s,
            Err(e) => {
                let _ = ah.emit(
                    &format!("docker-events-error:{}", stream_id),
                    format!("SSH 连接失败: {}", e),
                );
                wait_or_stop(&rx, reconnect_delay(attempt));
                attempt += 1;
                continue;
            }
        };

        let mut channel = match sess.channel_session() {
            Ok(c) => c,
            Err(e) => {
                let _ = ah.emit(
                    &format!("docker-events-error:{}", stream_id),
                    format!("通道创建失败: {}", e),
                );
                wait_or_stop(&rx, reconnect_delay(attempt));
                attempt += 1;
                continue;
            }
        };

        let cmd = format!(
            "curl -s -N --unix-socket /var/run/docker.sock 'http://localhost/v{}/events'",
            ver
        );

        if let Err(e) = channel.exec(&cmd) {
            let _ = ah.emit(
                &format!("docker-events-error:{}", stream_id),
                format!("启动事件流失败: {}", e),
            );
            wait_or_stop(&rx, reconnect_delay(attempt));
            attempt += 1;
            continue;
        }

        sess.set_blocking(false);
        let _ = ah.emit(&format!("docker-events-status:{}", stream_id), "connected");
        attempt = 0;

        let mut buf = [0u8; 4096];
        let mut line_buf = String::new();
        let mut last_refresh: Option<Instant> = None;

        loop {
            match rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = ah.emit(&format!("docker-events-status:{}", stream_id), "stopped");
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }

            match channel.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    line_buf.push_str(&chunk);

                    while let Some(pos) = line_buf.find('\n') {
                        let line: String = line_buf.drain(..=pos).collect();
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        if let Some(event) = parse_docker_event(trimmed) {
                            let _ = ah.emit(&format!("docker-event:{}", stream_id), &event);

                            if is_refresh_event(&event.event_type, &event.action) {
                                let now = Instant::now();
                                let should_emit = match last_refresh {
                                    Some(t) => now.duration_since(t).as_millis() >= THROTTLE_MS,
                                    None => true,
                                };
                                if should_emit {
                                    let _ = ah.emit(&format!("docker-events-refresh:{}", stream_id), &event.event_type);
                                    last_refresh = Some(now);
                                }
                            }
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(_) => break,
            }

            if channel.eof() {
                break;
            }
        }

        let _ = ah.emit(&format!("docker-events-status:{}", stream_id), "disconnected");
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

pub fn start_event_stream(server_id: String, state: State<AppState>, app_handle: AppHandle) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;

    {
        let streams = state.event_streams.lock().unwrap();
        if let Some(existing) = streams.get(&server_id) {
            return Ok(existing.stream_id.clone());
        }
    }

    let stream_id = generate_id();
    let (tx, rx) = mpsc::channel::<()>();

    let sid = stream_id.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_event_stream_thread(server, sid, rx, ah));

    state.event_streams.lock().unwrap().insert(
        server_id,
        EventStreamHandle {
            stream_id: stream_id.clone(),
            tx,
        },
    );

    Ok(stream_id)
}

pub fn stop_event_stream(server_id: String, state: State<AppState>) {
    if let Some(h) = state.event_streams.lock().unwrap().remove(&server_id) {
        let _ = h.tx.send(());
    }
}
