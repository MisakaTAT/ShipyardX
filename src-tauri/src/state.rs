use std::collections::HashMap;
use std::sync::{mpsc, Mutex};
use tauri::State;

use crate::models::ServerConfig;

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

pub struct AppState {
    pub servers: Mutex<Vec<ServerConfig>>,
    pub data_file: Mutex<std::path::PathBuf>,
    pub(crate) terminals: Mutex<HashMap<String, TerminalHandle>>,
    pub(crate) streams: Mutex<HashMap<String, StreamHandle>>,
    pub(crate) terminal_ws_clients: Mutex<HashMap<String, mpsc::Sender<String>>>,
}

pub fn get_server_config(state: &State<AppState>, id: &str) -> Result<ServerConfig, String> {
    state
        .servers
        .lock()
        .unwrap()
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| "服务器不存在".to_string())
}
