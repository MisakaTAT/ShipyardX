use std::path::{Path, PathBuf};

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, AeadCore, OsRng},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppResult};

const KEY_FILE: &str = "encryption.key";

fn get_or_create_key(data_dir: &Path) -> AppResult<[u8; 32]> {
    let key_path = data_dir.join(KEY_FILE);
    if let Ok(bytes) = std::fs::read(&key_path)
        && bytes.len() == 32
    {
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }
    let mut key = [0u8; 32];
    aes_gcm::aead::rand_core::RngCore::fill_bytes(&mut OsRng, &mut key);
    std::fs::write(&key_path, key)
        .map_err(|e| AppError::internal("config.key_write_failed", "写入加密密钥失败").with_source(e))?;
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
    let key = match get_or_create_key(&data_dir_from_file(path)) {
        Ok(k) => k,
        Err(e) => {
            eprintln!("[crypto] key init failed: {e}");
            return std::fs::read_to_string(path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
        }
    };

    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<ServerConfig>>(&s).ok())
        .map(|mut servers| {
            for s in &mut servers {
                if s.auth_type == "password"
                    && let Some(ref enc) = s.password
                {
                    match decrypt(&key, enc) {
                        Ok(p) => s.password = Some(p),
                        Err(e) => eprintln!("[crypto] decrypt failed for {}: {e}", s.id),
                    }
                }
            }
            servers
        })
        .unwrap_or_default()
}

pub fn save_servers(path: &Path, servers: &[ServerConfig]) -> AppResult<()> {
    let key = get_or_create_key(&data_dir_from_file(path))?;

    let mut out: Vec<ServerConfig> = servers.to_vec();
    for s in &mut out {
        if s.auth_type == "password" {
            if let Some(ref p) = s.password {
                s.password = Some(encrypt(&key, p)?);
            }
        } else {
            s.password = None;
        }
    }

    let json = serde_json::to_string_pretty(&out)
        .map_err(|e| AppError::internal("config.server_serialize_failed", "序列化服务器配置失败").with_source(e))?;
    atomic_write(path, json.as_bytes()).map_err(|e| {
        AppError::internal("config.server_write_failed", "写入服务器配置失败")
            .with_detail(e.detail.unwrap_or(e.message))
    })
}
