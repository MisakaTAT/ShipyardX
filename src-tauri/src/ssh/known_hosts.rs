use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use log::{info, warn};
use tauri::AppHandle;
use tauri_specta::Event;

use crate::config::store::atomic_write;
use crate::dto::events::HostKeyPromptRequired;
use crate::dto::server::HostKeyPrompt;
use crate::error::{AppError, AppResult};

const KNOWN_HOSTS_FILE: &str = "known_hosts.json";

static KNOWN_HOSTS_PATH: OnceLock<PathBuf> = OnceLock::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static WRITE_LOCK: Mutex<()> = Mutex::new(());
static PENDING_PROMPT: Mutex<Option<HostKeyPrompt>> = Mutex::new(None);

pub fn init(app: &AppHandle, data_dir: &Path) {
    let path = data_dir.join(KNOWN_HOSTS_FILE);
    info!(target: "shipyardx_lib::ssh::known_hosts", "known hosts store: {}", path.display());
    let _ = KNOWN_HOSTS_PATH.set(path);
    let _ = APP_HANDLE.set(app.clone());
}

fn store_path() -> AppResult<&'static PathBuf> {
    KNOWN_HOSTS_PATH
        .get()
        .ok_or_else(|| AppError::internal("ssh.known_hosts_uninitialized", "主机密钥存储尚未初始化"))
}

/// 大小写和空白差异视为同一条目
pub fn entry_key(host: &str, port: u16) -> String {
    format!("{}:{}", host.trim().to_lowercase(), port)
}

fn load() -> AppResult<BTreeMap<String, String>> {
    let path = store_path()?;
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Ok(BTreeMap::new());
    };
    if raw.trim().is_empty() {
        return Ok(BTreeMap::new());
    }
    serde_json::from_str(&raw)
        .map_err(|e| AppError::internal("ssh.known_hosts_parse_failed", "解析已信任主机密钥失败").with_source(e))
}

fn persist(entries: &BTreeMap<String, String>) -> AppResult<()> {
    let path = store_path()?;
    let payload = serde_json::to_vec_pretty(entries).map_err(|e| {
        AppError::internal("ssh.known_hosts_serialize_failed", "序列化已信任主机密钥失败").with_source(e)
    })?;
    atomic_write(path, &payload)
}

pub fn lookup(host: &str, port: u16) -> Option<String> {
    match load() {
        Ok(entries) => entries.get(&entry_key(host, port)).cloned(),
        Err(error) => {
            warn!(
                target: "shipyardx_lib::ssh::known_hosts",
                "failed to read known hosts, treating host as untrusted; host={} port={} message={}",
                host,
                port,
                error.message
            );
            None
        }
    }
}

pub fn trust(host: &str, port: u16, fingerprint: &str) -> AppResult<()> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut entries = load()?;
    entries.insert(entry_key(host, port), fingerprint.to_string());
    persist(&entries)?;
    info!(
        target: "shipyardx_lib::ssh::known_hosts",
        "host key trusted; host={} port={} fingerprint={}",
        host,
        port,
        fingerprint
    );
    clear_pending_for(host, port);
    Ok(())
}

/// 记录待确认的主机密钥并通知前端；错误码在冒泡途中会被多处重写，前端不能只靠它识别
pub fn set_pending(prompt: HostKeyPrompt) {
    if let Ok(mut slot) = PENDING_PROMPT.lock() {
        *slot = Some(prompt.clone());
    }
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    if let Err(error) = (HostKeyPromptRequired { prompt }).emit(app) {
        warn!(target: "shipyardx_lib::ssh::known_hosts", "failed to emit host key prompt event; error={}", error);
    }
}

pub fn pending() -> Option<HostKeyPrompt> {
    PENDING_PROMPT.lock().ok().and_then(|slot| slot.clone())
}

fn clear_pending_for(host: &str, port: u16) {
    if let Ok(mut slot) = PENDING_PROMPT.lock()
        && slot
            .as_ref()
            .is_some_and(|prompt| entry_key(&prompt.host, prompt.port) == entry_key(host, port))
    {
        *slot = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_entry_keys() {
        assert_eq!(entry_key(" Example.COM ", 22), "example.com:22");
        assert_eq!(entry_key("example.com", 2222), "example.com:2222");
        assert_ne!(entry_key("example.com", 22), entry_key("example.com", 2222));
    }
}
