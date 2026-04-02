use std::collections::HashMap;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64},
    mpsc,
};

use crate::models::app::server::ServerConfig;

pub enum TerminalMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

pub struct TerminalHandle {
    pub tx: mpsc::Sender<TerminalMsg>,
}

pub struct StreamHandle {
    pub tx: mpsc::Sender<()>,
}

pub struct EventStreamHandle {
    pub stream_id: String,
    pub tx: mpsc::Sender<()>,
}

pub struct AppState {
    pub servers: Mutex<Vec<ServerConfig>>,
    pub data_file: Mutex<std::path::PathBuf>,
    pub terminals: Mutex<HashMap<String, TerminalHandle>>,
    pub streams: Mutex<HashMap<String, StreamHandle>>,
    pub terminal_ws_clients: Mutex<HashMap<String, mpsc::Sender<String>>>,
    pub event_streams: Mutex<HashMap<String, EventStreamHandle>>,
    pub port_forwards: Mutex<HashMap<String, PortForwardHandle>>,
    pub port_forward_last_errors: Mutex<HashMap<String, String>>,
}

pub struct PortForwardHandle {
    pub id: String,
    pub shutdown: Arc<AtomicBool>,
    pub last_error: Arc<Mutex<Option<String>>>,
    pub server_id: String,
    pub container_id: String,
    pub container_name: Option<String>,
    pub protocol: String,
    pub container_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub local_port: u16,
    pub bind_address: String,
    pub tx_bytes: Arc<AtomicU64>,
    pub rx_bytes: Arc<AtomicU64>,
}
