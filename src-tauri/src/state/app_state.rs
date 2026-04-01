use std::collections::HashMap;
use std::sync::{Mutex, mpsc};

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
}
