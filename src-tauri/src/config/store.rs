use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, AeadCore, OsRng},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use log::{info, warn};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};

const KEYRING_SERVICE: &str = "com.mikuac.shipyardx";
const KEYRING_ACCOUNT: &str = "ShipyardX Safe Storage";

static MASTER_KEY: OnceLock<[u8; 32]> = OnceLock::new();

/// 钥匙串的读/写/访问各自成 code：原先把中文动词拼进文案，无法翻译。
fn keyring_error(code: &'static str, error: keyring::Error) -> AppError {
    AppError::internal(code).with_detail(error.to_string())
}

fn decode_key(encoded: &str) -> Option<[u8; 32]> {
    BASE64.decode(encoded).ok()?.try_into().ok()
}

fn generate_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    aes_gcm::aead::rand_core::RngCore::fill_bytes(&mut OsRng, &mut key);
    key
}

fn master_key() -> AppResult<[u8; 32]> {
    if let Some(key) = MASTER_KEY.get() {
        return Ok(*key);
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| keyring_error("config.keyring_access_failed", e))?;
    let key = match entry.get_password() {
        Ok(encoded) => decode_key(&encoded)
            .ok_or_else(|| AppError::internal("config.master_key_invalid").param("account", KEYRING_ACCOUNT))?,
        Err(keyring::Error::NoEntry) => {
            let key = generate_key();
            entry
                .set_password(&BASE64.encode(key))
                .map_err(|e| keyring_error("config.keyring_write_failed", e))?;
            info!(target: "shipyardx_lib::config::store", "created master key in system keyring");
            key
        }
        Err(error) => return Err(keyring_error("config.keyring_read_failed", error)),
    };

    let _ = MASTER_KEY.set(key);
    Ok(key)
}

fn encrypt(key: &[u8; 32], plaintext: &str) -> AppResult<String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::internal("config.cipher_encrypt_init_failed").with_source(e))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::internal("config.encrypt_failed").with_source(e))?;
    let mut buf = nonce.to_vec();
    buf.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&buf))
}

fn decrypt(key: &[u8; 32], encoded: &str) -> AppResult<String> {
    let data = BASE64
        .decode(encoded)
        .map_err(|e| AppError::internal("config.base64_decode_failed").with_source(e))?;
    if data.len() < 12 {
        return Err(AppError::internal("config.encrypted_data_invalid"));
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::internal("config.cipher_decrypt_init_failed").with_source(e))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::internal("config.decrypt_failed").with_source(e))?;
    String::from_utf8(plaintext).map_err(|e| AppError::internal("config.password_utf8_invalid").with_source(e))
}

pub fn get_data_file(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal("config.data_dir_unavailable").with_source(e))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| AppError::internal("config.data_dir_create_failed").with_source(e))?;
    Ok(data_dir.join("servers.json"))
}

pub fn data_dir_from_file(data_file: &Path) -> PathBuf {
    data_file.parent().unwrap_or(data_file).to_path_buf()
}

pub fn atomic_write(path: &Path, contents: &[u8]) -> AppResult<()> {
    let dir = data_dir_from_file(path);
    std::fs::create_dir_all(&dir).map_err(|e| AppError::internal("config.data_dir_create_failed").with_source(e))?;

    let mut temp =
        NamedTempFile::new_in(&dir).map_err(|e| AppError::internal("config.tempfile_create_failed").with_source(e))?;
    use std::io::Write;
    temp.write_all(contents)
        .map_err(|e| AppError::internal("config.tempfile_write_failed").with_source(e))?;
    temp.as_file_mut()
        .sync_all()
        .map_err(|e| AppError::internal("config.tempfile_sync_failed").with_source(e))?;
    temp.persist(path)
        .map_err(|e| AppError::internal("config.file_replace_failed").with_source(e.error))?;

    if let Ok(dir_file) = std::fs::File::open(&dir) {
        let _ = dir_file.sync_all();
    }

    Ok(())
}

pub fn load_servers(path: &Path) -> Vec<ServerConfig> {
    let mut servers: Vec<ServerConfig> = std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    let key = match master_key() {
        Ok(key) => Some(key),
        Err(error) => {
            warn!(target: "shipyardx_lib::config::store", "master key unavailable, saved passwords stay unreadable; error={}", error);
            None
        }
    };

    for server in &mut servers {
        if server.auth_type != "password" {
            server.password = None;
            continue;
        }
        let Some(encoded) = server.password.take() else {
            continue;
        };
        match key.as_ref().and_then(|key| decrypt(key, &encoded).ok()) {
            Some(plaintext) => server.password = Some(plaintext),
            None => {
                warn!(target: "shipyardx_lib::config::store", "unable to decrypt stored password, it must be re-entered; server_id={}", server.id);
            }
        }
    }

    servers
}

pub fn save_servers(path: &Path, servers: &[ServerConfig]) -> AppResult<()> {
    let key = master_key()?;
    let sanitized: Vec<ServerConfig> = servers
        .iter()
        .map(|server| {
            let password = match server.password.as_deref().filter(|value| !value.is_empty()) {
                Some(plaintext) if server.auth_type == "password" => Some(encrypt(&key, plaintext)?),
                _ => None,
            };
            Ok(ServerConfig {
                password,
                ..server.clone()
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    let json = serde_json::to_string_pretty(&sanitized)
        .map_err(|e| AppError::internal("config.server_serialize_failed").with_source(e))?;
    atomic_write(path, json.as_bytes())
        .map_err(|e| AppError::internal("config.server_write_failed").with_detail(e.detail.unwrap_or(e.code)))
}
