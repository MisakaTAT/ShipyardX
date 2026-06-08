use std::collections::HashMap;
use std::sync::{Arc, Mutex, atomic::AtomicU64};

use crate::contracts::frontend::events::EventStreamStatus;
use crate::contracts::frontend::server::ServerConfig;
use tokio::sync::{mpsc as tokio_mpsc, watch};

pub(crate) enum TerminalMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

pub(crate) struct TerminalHandle {
    pub(crate) tx: tokio_mpsc::UnboundedSender<TerminalMsg>,
}

pub(crate) struct StreamHandle {
    pub(crate) stop_tx: watch::Sender<bool>,
}

pub(crate) struct EventStreamHandle {
    pub(crate) stream_id: String,
    pub(crate) stop_tx: watch::Sender<bool>,
    pub(crate) status: Arc<Mutex<EventStreamStatus>>,
}

pub struct AppState {
    pub(crate) servers: Mutex<Vec<ServerConfig>>,
    pub(crate) data_file: Mutex<std::path::PathBuf>,
    pub(crate) terminals: Mutex<HashMap<String, TerminalHandle>>,
    pub(crate) streams: Mutex<HashMap<String, StreamHandle>>,
    pub(crate) terminal_ws_clients: Mutex<HashMap<String, tokio_mpsc::UnboundedSender<Vec<u8>>>>,
    pub(crate) event_streams: Mutex<HashMap<String, EventStreamHandle>>,
    pub(crate) port_forwards: Mutex<HashMap<String, PortForwardRuntimeState>>,
}

pub(crate) struct PortForwardRuntimeHandle {
    pub(crate) stop_tx: watch::Sender<bool>,
    pub(crate) server_id: String,
    pub(crate) local_port: u16,
    pub(crate) tx_bytes: Arc<AtomicU64>,
    pub(crate) rx_bytes: Arc<AtomicU64>,
}

pub(crate) struct PortForwardRuntimeState {
    pub(crate) handle: Option<PortForwardRuntimeHandle>,
    pub(crate) last_error: Option<String>,
}
