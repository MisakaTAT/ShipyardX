use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bollard::models::EventMessage;
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use tauri::{AppHandle, State};
use tauri_specta::Event;
use tokio::sync::watch;

use crate::docker::client::{docker_streaming, map_bollard_error};
use crate::dto::events::{
    DockerEvent, DockerStreamError, DockerStreamPayload, DockerStreamRefresh, DockerStreamStatus, EventStreamStatus,
};
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::services::support::{ServerContext, start_managed_event_stream, stop_managed_event_stream};
use crate::state::{AppState, EventStreamHandle, lock_mutex};
use crate::utils::formatting::format_unix_seconds_time;
use crate::utils::id::generate_id;

const HIDDEN_ATTR_KEYS: &[&str] = &["name", "image", "maintainer", "desktop.docker.binds"];

fn event_type_label(event_type: &str) -> &'static str {
    match event_type {
        "container" => "Container",
        "image" => "Image",
        "network" => "Network",
        "volume" => "Volume",
        _ => "Other",
    }
}

fn event_type_icon(event_type: &str) -> &'static str {
    match event_type {
        "container" => "box",
        "image" => "layers",
        "network" => "share-2",
        "volume" => "database",
        _ => "circle-dot",
    }
}

fn action_tone(action: &str) -> &'static str {
    if matches!(action, "start" | "create" | "pull" | "connect" | "mount") {
        return "success";
    }
    if matches!(
        action,
        "stop" | "die" | "kill" | "destroy" | "delete" | "remove" | "disconnect" | "unmount"
    ) {
        return "danger";
    }
    if matches!(
        action,
        "restart" | "pause" | "unpause" | "rename" | "update" | "tag" | "untag"
    ) {
        return "warning";
    }
    "muted"
}

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

fn parse_docker_event(raw: EventMessage) -> Option<DockerEvent> {
    let action = raw.action?;
    if action.starts_with("exec_") {
        return None;
    }
    let time = raw.time.unwrap_or(0);
    let time_nano = raw.time_nano.unwrap_or(0);
    let actor = raw.actor.unwrap_or_default();
    let actor_id_raw = actor.id.unwrap_or_default();
    let actor_id = if actor_id_raw.len() > 12 {
        actor_id_raw[..12].to_string()
    } else {
        actor_id_raw
    };
    let attrs = actor.attributes.unwrap_or_default();
    let event_type = raw.typ.map(|v| v.to_string()).unwrap_or_default();
    let actor_name = attrs.get("name").cloned().unwrap_or_default();
    let actor_image = attrs.get("image").cloned().unwrap_or_default();
    let detail = build_detail(&event_type, &action, &attrs);
    Some(DockerEvent {
        event_id: format!("{}:{}:{}:{}", time_nano, event_type, action, actor_id),
        event_type_label: event_type_label(&event_type).to_string(),
        event_type_icon: event_type_icon(&event_type).to_string(),
        action_tone: action_tone(&action).to_string(),
        event_type,
        action,
        actor_id,
        actor_name,
        actor_image,
        scope: raw.scope.map(|v| v.to_string()).unwrap_or_default(),
        time: format_unix_seconds_time(time),
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
    if let Ok(mut current) = lock_mutex(status_slot, "docker_events.status_lock_failed", "更新事件流状态失败")
    {
        *current = status;
    }
    let _ = DockerStreamStatus {
        stream_id: stream_id.to_string(),
        status,
    }
    .emit(ah);
}

async fn run_event_stream_task(
    config: ServerConfig,
    stream_id: String,
    status_slot: Arc<Mutex<EventStreamStatus>>,
    mut stop_rx: watch::Receiver<bool>,
    ah: AppHandle,
) {
    let mut attempt = 0usize;
    info!(target: "shipyardx_lib::services::docker_events", "event stream task started; stream_id={} server_id={}", stream_id, config.id);

    loop {
        if *stop_rx.borrow() {
            info!(target: "shipyardx_lib::services::docker_events", "event stream stopped before connect; stream_id={} server_id={}", stream_id, config.id);
            emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Stopped);
            return;
        }

        emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Connecting);

        let stream_result = async {
            let docker = match docker_streaming(&config).await {
                Ok(docker) => docker,
                Err(error) => {
                    warn!(
                        target: "shipyardx_lib::services::docker_events",
                        "event stream open failed; stream_id={} server_id={} attempt={} code={} message={} detail={:?}",
                        stream_id,
                        config.id,
                        attempt + 1,
                        error.code,
                        error.message,
                        error.detail
                    );
                    return Ok::<StreamLoopExit, AppError>(StreamLoopExit::Reconnect(Some(
                        AppError::unavailable("docker.events_start_failed", "启动 Docker 事件流失败")
                            .with_detail(error.detail.unwrap_or(error.message))
                            .retryable(true),
                    )));
                }
            };
            let mut stream = docker.events(None::<bollard::query_parameters::EventsOptions>);
            emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Connected);
            info!(target: "shipyardx_lib::services::docker_events", "event stream connected; stream_id={} server_id={}", stream_id, config.id);

            let mut last_refresh: Option<Instant> = None;

            loop {
                tokio::select! {
                    changed = stop_rx.changed() => {
                        if changed.is_ok() && *stop_rx.borrow() {
                            info!(target: "shipyardx_lib::services::docker_events", "event stream stop requested; stream_id={} server_id={}", stream_id, config.id);
                            return Ok::<StreamLoopExit, AppError>(StreamLoopExit::Stopped);
                        }
                    }
                    item = stream.next() => {
                        match item {
                            Some(Ok(raw)) => {
                                if let Some(event) = parse_docker_event(raw) {
                                    let event_type = event.event_type.clone();
                                    let action = event.action.clone();
                                    let _ = DockerStreamPayload {
                                        stream_id: stream_id.clone(),
                                        event,
                                    }.emit(&ah);
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
                                            }.emit(&ah);
                                            last_refresh = Some(now);
                                        }
                                    }
                                }
                            }
                            Some(Err(error)) => {
                                let error = map_bollard_error(error);
                                warn!(
                                    target: "shipyardx_lib::services::docker_events",
                                    "event stream interrupted; stream_id={} server_id={} code={} message={} detail={:?}",
                                    stream_id,
                                    config.id,
                                    error.code,
                                    error.message,
                                    error.detail
                                );
                                return Ok(StreamLoopExit::Reconnect(Some(error)));
                            }
                            None => {
                                warn!(target: "shipyardx_lib::services::docker_events", "event stream closed by remote; stream_id={} server_id={}", stream_id, config.id);
                                return Ok(StreamLoopExit::Reconnect(None));
                            }
                        }
                    }
                }
            }
        }
        .await;

        match stream_result {
            Ok(StreamLoopExit::Stopped) => {
                info!(target: "shipyardx_lib::services::docker_events", "event stream stopped; stream_id={} server_id={}", stream_id, config.id);
                emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Stopped);
                return;
            }
            Ok(StreamLoopExit::Reconnect(error)) => {
                attempt += 1;
                if let Some(error) = error {
                    warn!(target: "shipyardx_lib::services::docker_events", "event stream scheduling reconnect; stream_id={} server_id={} attempt={} code={} message={} detail={:?}", stream_id, config.id, attempt, error.code, error.message, error.detail);
                    let _ = DockerStreamError {
                        stream_id: stream_id.clone(),
                        error,
                    }
                    .emit(&ah);
                } else {
                    warn!(target: "shipyardx_lib::services::docker_events", "event stream scheduling reconnect after EOF; stream_id={} server_id={} attempt={}", stream_id, config.id, attempt);
                }
            }
            Err(error) => {
                error!(target: "shipyardx_lib::services::docker_events", "event stream loop failed; stream_id={} server_id={} attempt={} code={} message={} detail={:?}", stream_id, config.id, attempt + 1, error.code, error.message, error.detail);
                let _ = DockerStreamError {
                    stream_id: stream_id.clone(),
                    error,
                }
                .emit(&ah);
                attempt += 1;
            }
        }

        emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Disconnected);
        debug!(target: "shipyardx_lib::services::docker_events", "event stream waiting to reconnect; stream_id={} server_id={} delay_secs={}", stream_id, config.id, reconnect_delay(attempt).as_secs());
        let stopped = tokio::time::timeout(reconnect_delay(attempt), stop_rx.changed())
            .await
            .ok()
            .and_then(Result::ok)
            .is_some_and(|_| *stop_rx.borrow());
        if stopped {
            info!(target: "shipyardx_lib::services::docker_events", "event stream stopped during reconnect wait; stream_id={} server_id={}", stream_id, config.id);
            emit_stream_status(&ah, &stream_id, &status_slot, EventStreamStatus::Stopped);
            return;
        }
    }
}

fn reconnect_delay(attempt: usize) -> Duration {
    let secs = RECONNECT_DELAYS
        .get(attempt)
        .copied()
        .unwrap_or_else(|| RECONNECT_DELAYS.last().copied().unwrap_or(30));
    Duration::from_secs(secs)
}

pub fn start_event_stream(server_id: String, state: State<AppState>, app_handle: AppHandle) -> AppResult<String> {
    let server = ServerContext::from_state(&state, &server_id)?.server().clone();
    info!(target: "shipyardx_lib::services::docker_events", "starting event stream; server_id={}", server_id);

    {
        let streams = lock_mutex(
            &state.event_streams,
            "docker_events.streams_lock_failed",
            "读取事件流状态失败",
        )?;
        if let Some(existing) = streams.get(&server_id) {
            debug!(target: "shipyardx_lib::services::docker_events", "reusing existing event stream; server_id={} stream_id={}", server_id, existing.stream_id);
            let current = *lock_mutex(
                &existing.status,
                "docker_events.status_lock_failed",
                "读取事件流状态失败",
            )?;
            let _ = DockerStreamStatus {
                stream_id: existing.stream_id.clone(),
                status: current,
            }
            .emit(&app_handle);
            return Ok(existing.stream_id.clone());
        }
    }

    let stream_id = generate_id();
    let (stop_tx, stop_rx) = watch::channel(false);
    let status = Arc::new(Mutex::new(EventStreamStatus::Connecting));

    let sid = stream_id.clone();
    let status_for_thread = status.clone();
    let ah = app_handle.clone();
    start_managed_event_stream(
        &state,
        server_id.clone(),
        EventStreamHandle {
            stream_id: stream_id.clone(),
            stop_tx,
            status,
        },
        async move {
            run_event_stream_task(server, sid, status_for_thread, stop_rx, ah).await;
        },
        "docker_events.streams_lock_failed",
        "记录事件流状态失败",
    )?;
    info!(target: "shipyardx_lib::services::docker_events", "event stream registered; server_id={} stream_id={}", server_id, stream_id);

    Ok(stream_id)
}

pub fn stop_event_stream(server_id: String, state: State<AppState>) -> AppResult<()> {
    if let Some(h) = stop_managed_event_stream(
        &state,
        &server_id,
        "docker_events.streams_lock_failed",
        "停止事件流失败",
    )? {
        info!(target: "shipyardx_lib::services::docker_events", "stopping event stream; server_id={} stream_id={}", server_id, h.stream_id);
        let _ = h.stop_tx.send(true);
    } else {
        warn!(target: "shipyardx_lib::services::docker_events", "stop requested for missing event stream; server_id={}", server_id);
    }
    Ok(())
}
