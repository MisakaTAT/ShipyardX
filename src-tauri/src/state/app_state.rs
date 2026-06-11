use std::collections::HashMap;
use std::sync::{Arc, Mutex, atomic::AtomicU64};
use std::time::Instant;

use crate::dto::events::EventStreamStatus;
use crate::dto::server::ServerConfig;
use tokio::sync::{mpsc as tokio_mpsc, watch};

pub(crate) enum TerminalMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

pub(crate) struct TerminalHandle {
    pub(crate) tx: tokio_mpsc::UnboundedSender<TerminalMsg>,
}

#[derive(Default)]
pub(crate) struct TerminalHandshakeState {
    pub(crate) backend_ready: bool,
    pub(crate) client_ready: bool,
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
    pub(crate) server_store: Mutex<()>,
    pub(crate) servers: Mutex<Vec<ServerConfig>>,
    pub(crate) data_file: Mutex<std::path::PathBuf>,
    pub(crate) terminals: Mutex<HashMap<String, TerminalHandle>>,
    pub(crate) streams: Mutex<HashMap<String, StreamHandle>>,
    pub(crate) terminal_ws_clients: Mutex<HashMap<String, tokio_mpsc::UnboundedSender<Vec<u8>>>>,
    pub(crate) terminal_handshakes: Mutex<HashMap<String, TerminalHandshakeState>>,
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
    pub(crate) last_sample_at: Option<Instant>,
    pub(crate) last_tx_bytes: u64,
    pub(crate) last_rx_bytes: u64,
    pub(crate) tx_speed: String,
    pub(crate) rx_speed: String,
}

impl Default for PortForwardRuntimeState {
    fn default() -> Self {
        Self {
            handle: None,
            last_error: None,
            last_sample_at: None,
            last_tx_bytes: 0,
            last_rx_bytes: 0,
            tx_speed: "0 B/s".to_string(),
            rx_speed: "0 B/s".to_string(),
        }
    }
}
