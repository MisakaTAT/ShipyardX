use std::collections::HashMap;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64},
    mpsc,
};

use crate::contracts::frontend::events::EventStreamStatus;
use crate::contracts::frontend::server::ServerConfig;

pub(crate) enum TerminalMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

pub(crate) struct TerminalHandle {
    pub(crate) tx: mpsc::Sender<TerminalMsg>,
}

pub(crate) struct StreamHandle {
    pub(crate) tx: mpsc::Sender<()>,
}

pub(crate) struct EventStreamHandle {
    pub(crate) stream_id: String,
    pub(crate) tx: mpsc::Sender<()>,
    pub(crate) status: Arc<Mutex<EventStreamStatus>>,
}

pub struct AppState {
    pub(crate) servers: Mutex<Vec<ServerConfig>>,
    pub(crate) data_file: Mutex<std::path::PathBuf>,
    pub(crate) terminals: Mutex<HashMap<String, TerminalHandle>>,
    pub(crate) streams: Mutex<HashMap<String, StreamHandle>>,
    pub(crate) terminal_ws_clients: Mutex<HashMap<String, mpsc::Sender<Vec<u8>>>>,
    pub(crate) event_streams: Mutex<HashMap<String, EventStreamHandle>>,
    pub(crate) port_forwards: Mutex<HashMap<String, PortForwardRuntimeState>>,
}

pub(crate) struct PortForwardRuntimeHandle {
    pub(crate) shutdown: Arc<AtomicBool>,
    pub(crate) server_id: String,
    pub(crate) local_port: u16,
    pub(crate) tx_bytes: Arc<AtomicU64>,
    pub(crate) rx_bytes: Arc<AtomicU64>,
}

pub(crate) struct PortForwardRuntimeState {
    pub(crate) handle: Option<PortForwardRuntimeHandle>,
    pub(crate) last_error: Option<String>,
}
