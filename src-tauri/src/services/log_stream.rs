use bollard::container::LogOutput;
use bollard::query_parameters::LogsOptionsBuilder;
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::watch;

use crate::docker::client::{docker_streaming, map_bollard_error};
use crate::dto::server::ServerConfig;
use crate::services::support::{ServerContext, start_managed_stream, stop_managed_stream};
use crate::state::AppState;
use crate::utils::id::generate_id;
use crate::utils::output::TextOutputBuffer;

const LOG_CHUNK_BYTES: usize = 8 * 1024;

async fn run_log_stream_task(
    config: ServerConfig,
    stream_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    mut stop_rx: watch::Receiver<bool>,
    ah: AppHandle,
) {
    info!(
        target: "shipyardx_lib::services::log_stream",
        "log stream task started; stream_id={} server_id={} container_id={} tail={} timestamps={}",
        stream_id,
        config.id,
        container_id,
        tail,
        timestamps
    );
    let docker = match docker_streaming(&config).await {
        Ok(docker) => docker,
        Err(error) => {
            error!(
                target: "shipyardx_lib::services::log_stream",
                "log stream client open failed; stream_id={} server_id={} container_id={} code={} message={} detail={:?}",
                stream_id,
                config.id,
                container_id,
                error.code,
                error.message,
                error.detail
            );
            let _ = ah.emit(
                &format!("log-data:{}", stream_id),
                format!("\x1b[31m连接失败: {}\x1b[0m\r\n", error.message).into_bytes(),
            );
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    };
    let options = LogsOptionsBuilder::default()
        .stdout(true)
        .stderr(true)
        .follow(true)
        .timestamps(timestamps)
        .tail(&tail.to_string())
        .build();
    let mut stream = docker.logs(&container_id, Some(options));

    let mut output_buffer = TextOutputBuffer::new(LOG_CHUNK_BYTES, None, "");

    let emit_buffered = |text: &str, ah: &AppHandle, stream_id: &str, output_buffer: &mut TextOutputBuffer| {
        for chunk in output_buffer.push(text) {
            let _ = ah.emit(&format!("log-data:{}", stream_id), chunk.into_bytes());
        }
    };

    let flush_buffered = |ah: &AppHandle, stream_id: &str, output_buffer: &mut TextOutputBuffer| {
        for chunk in output_buffer.finish() {
            let _ = ah.emit(&format!("log-data:{}", stream_id), chunk.into_bytes());
        }
    };

    loop {
        tokio::select! {
            changed = stop_rx.changed() => {
                if changed.is_ok() && *stop_rx.borrow() {
                    info!(target: "shipyardx_lib::services::log_stream", "log stream stopped by request; stream_id={} server_id={} container_id={}", stream_id, config.id, container_id);
                    flush_buffered(&ah, &stream_id, &mut output_buffer);
                    let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                    return;
                }
            }
            item = stream.next() => {
                match item {
                    Some(Ok(log)) => {
                        let text = match log {
                            LogOutput::StdOut { message }
                            | LogOutput::StdErr { message }
                            | LogOutput::StdIn { message }
                            | LogOutput::Console { message } => String::from_utf8_lossy(&message).to_string(),
                        };
                        emit_buffered(&text, &ah, &stream_id, &mut output_buffer);
                    }
                    None => {
                        info!(target: "shipyardx_lib::services::log_stream", "log stream completed; stream_id={} server_id={} container_id={}", stream_id, config.id, container_id);
                        flush_buffered(&ah, &stream_id, &mut output_buffer);
                        let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                        return;
                    }
                    Some(Err(error)) => {
                        let error = map_bollard_error(error);
                        warn!(
                            target: "shipyardx_lib::services::log_stream",
                            "log stream interrupted; stream_id={} server_id={} container_id={} code={} message={} detail={:?}",
                            stream_id,
                            config.id,
                            container_id,
                            error.code,
                            error.message,
                            error.detail
                        );
                        emit_buffered(
                            &format!("\x1b[31m日志流中断: {}\x1b[0m\r\n", error.message),
                            &ah,
                            &stream_id,
                            &mut output_buffer,
                        );
                        flush_buffered(&ah, &stream_id, &mut output_buffer);
                        let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                        return;
                    }
                }
            }
        }
    }
}

pub async fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> crate::error::AppResult<String> {
    let server = ServerContext::from_state(&state, &server_id)?.server().clone();
    let stream_id = generate_id();
    let (stop_tx, stop_rx) = watch::channel(false);
    info!(target: "shipyardx_lib::services::log_stream", "starting log stream; stream_id={} server_id={} container_id={} tail={} timestamps={}", stream_id, server_id, container_id, tail, timestamps);

    let sid = stream_id.clone();
    let cid = container_id.clone();
    let ah = app_handle.clone();
    let stream_id = start_managed_stream(
        &state,
        stream_id,
        stop_tx,
        async move {
            run_log_stream_task(server, sid, cid, tail, timestamps, stop_rx, ah).await;
        },
        "log_stream.start_lock_failed",
        "记录日志流状态失败",
    )?;
    debug!(target: "shipyardx_lib::services::log_stream", "log stream registered; stream_id={}", stream_id);
    Ok(stream_id)
}

pub async fn stop_log_stream(stream_id: String, state: State<'_, AppState>) -> crate::error::AppResult<()> {
    if stop_managed_stream(&state, &stream_id, "log_stream.stop_lock_failed", "停止日志流失败")? {
        info!(target: "shipyardx_lib::services::log_stream", "stopping log stream; stream_id={}", stream_id);
    } else {
        warn!(target: "shipyardx_lib::services::log_stream", "stop requested for missing log stream; stream_id={}", stream_id);
    }
    Ok(())
}
