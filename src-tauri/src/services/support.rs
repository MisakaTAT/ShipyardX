use std::future::Future;

use bollard::Docker;
use tauri::State;
use tokio::sync::watch;

use crate::docker::client::{docker, docker_streaming};
use crate::dto::server::ServerConfig;
use crate::error::AppResult;
use crate::ssh::client::spawn_on_runtime;
use crate::state::{
    AppState, EventStreamHandle, register_event_stream_handle, register_stream_handle, remove_event_stream_handle,
    remove_stream_handle,
};

pub(crate) struct ServerContext {
    server_id: String,
    server: ServerConfig,
}

impl ServerContext {
    pub(crate) fn from_state(state: &State<'_, AppState>, server_id: &str) -> AppResult<Self> {
        Ok(Self {
            server_id: server_id.to_string(),
            server: crate::state::get_server_config(state, server_id)?,
        })
    }

    pub(crate) fn from_server(server: ServerConfig) -> Self {
        let server_id = server.id.clone();
        Self { server_id, server }
    }

    pub(crate) fn server(&self) -> &ServerConfig {
        &self.server
    }

    pub(crate) fn server_id(&self) -> &str {
        &self.server_id
    }

    pub(crate) async fn docker(&self) -> AppResult<Docker> {
        docker(&self.server).await
    }

    pub(crate) async fn streaming(&self) -> AppResult<Docker> {
        docker_streaming(&self.server).await
    }
}

pub(crate) fn start_managed_stream<F>(
    state: &State<'_, AppState>,
    stream_id: String,
    stop_tx: watch::Sender<bool>,
    task: F,
    code: &'static str,
) -> AppResult<String>
where
    F: Future<Output = ()> + Send + 'static,
{
    spawn_on_runtime(task)?;
    register_stream_handle(state, stream_id.clone(), stop_tx, code)?;
    Ok(stream_id)
}

pub(crate) fn stop_managed_stream(state: &State<'_, AppState>, stream_id: &str, code: &'static str) -> AppResult<bool> {
    if let Some(handle) = remove_stream_handle(state, stream_id, code)? {
        let _ = handle.stop_tx.send(true);
        return Ok(true);
    }
    Ok(false)
}

pub(crate) fn start_managed_event_stream<F>(
    state: &State<'_, AppState>,
    server_id: String,
    handle: EventStreamHandle,
    task: F,
    code: &'static str,
) -> AppResult<String>
where
    F: Future<Output = ()> + Send + 'static,
{
    let stream_id = handle.stream_id.clone();
    spawn_on_runtime(task)?;
    register_event_stream_handle(state, server_id, handle, code)?;
    Ok(stream_id)
}

pub(crate) fn stop_managed_event_stream(
    state: &State<'_, AppState>,
    server_id: &str,
    code: &'static str,
) -> AppResult<Option<EventStreamHandle>> {
    remove_event_stream_handle(state, server_id, code)
}
