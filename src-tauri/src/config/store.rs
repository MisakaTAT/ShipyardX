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

fn keyring_error(action: &str, error: keyring::Error) -> AppError {
    AppError::internal("config.keyring_unavailable", format!("{action}失败"))
        .with_detail(error.to_string())
        .with_action("请确认系统钥匙串服务可用（Linux 需要 gnome-keyring、KWallet 等 Secret Service 实现）")
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

    let entry =
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| keyring_error("访问系统钥匙串", e))?;
    let key = match entry.get_password() {
        Ok(encoded) => decode_key(&encoded).ok_or_else(|| {
            AppError::internal("config.master_key_invalid", "钥匙串中的主密钥格式无效")
                .with_action(format!("请在钥匙串中删除「{KEYRING_ACCOUNT}」条目后重试"))
        })?,
        Err(keyring::Error::NoEntry) => {
            let key = generate_key();
            entry
                .set_password(&BASE64.encode(key))
                .map_err(|e| keyring_error("写入系统钥匙串", e))?;
            info!(target: "shipyardx_lib::config::store", "created master key in system keyring");
            key
        }
        Err(error) => return Err(keyring_error("读取系统钥匙串", error)),
    };

    let _ = MASTER_KEY.set(key);
    Ok(key)
}

fn encrypt(key: &[u8; 32], plaintext: &str) -> AppResult<String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::internal("config.cipher_init_failed", "初始化加密器失败").with_source(e))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::internal("config.encrypt_failed", "加密服务器密码失败").with_source(e))?;
    let mut buf = nonce.to_vec();
    buf.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&buf))
}

fn decrypt(key: &[u8; 32], encoded: &str) -> AppResult<String> {
    let data = BASE64
        .decode(encoded)
        .map_err(|e| AppError::internal("config.base64_decode_failed", "解码已保存凭据失败").with_source(e))?;
    if data.len() < 12 {
        return Err(AppError::internal(
            "config.encrypted_data_invalid",
            "已保存凭据格式无效",
        ));
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::internal("config.cipher_init_failed", "初始化解密器失败").with_source(e))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::internal("config.decrypt_failed", "解密服务器密码失败").with_source(e))?;
    String::from_utf8(plaintext)
        .map_err(|e| AppError::internal("config.password_utf8_invalid", "解密后的密码数据无效").with_source(e))
}

pub fn get_data_file(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal("config.data_dir_unavailable", "无法获取应用数据目录").with_source(e))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| AppError::internal("config.data_dir_create_failed", "创建配置目录失败").with_source(e))?;
    Ok(data_dir.join("servers.json"))
}

pub fn data_dir_from_file(data_file: &Path) -> PathBuf {
    data_file.parent().unwrap_or(data_file).to_path_buf()
}

pub fn atomic_write(path: &Path, contents: &[u8]) -> AppResult<()> {
    let dir = data_dir_from_file(path);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::internal("config.data_dir_create_failed", "创建配置目录失败").with_source(e))?;

    let mut temp = NamedTempFile::new_in(&dir)
        .map_err(|e| AppError::internal("config.tempfile_create_failed", "创建临时配置文件失败").with_source(e))?;
    use std::io::Write;
    temp.write_all(contents)
        .map_err(|e| AppError::internal("config.tempfile_write_failed", "写入临时配置文件失败").with_source(e))?;
    temp.as_file_mut()
        .sync_all()
        .map_err(|e| AppError::internal("config.tempfile_sync_failed", "同步临时配置文件失败").with_source(e))?;
    temp.persist(path)
        .map_err(|e| AppError::internal("config.file_replace_failed", "替换配置文件失败").with_source(e.error))?;

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
            warn!(target: "shipyardx_lib::config::store", "master key unavailable, saved passwords stay unreadable; message={}", error.message);
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
        .map_err(|e| AppError::internal("config.server_serialize_failed", "序列化服务器配置失败").with_source(e))?;
    atomic_write(path, json.as_bytes()).map_err(|e| {
        AppError::internal("config.server_write_failed", "写入服务器配置失败")
            .with_detail(e.detail.unwrap_or(e.message))
    })
}
