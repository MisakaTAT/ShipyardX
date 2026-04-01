use std::path::{Path, PathBuf};

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, AeadCore, OsRng},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use tauri::{AppHandle, Manager};

use crate::models::app::server::ServerConfig;

const KEY_FILE: &str = "encryption.key";

fn get_or_create_key(data_dir: &Path) -> Result<[u8; 32], String> {
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
    std::fs::write(&key_path, key).map_err(|e| format!("写入密钥文件失败: {e}"))?;
    Ok(key)
}

fn encrypt(key: &[u8; 32], plaintext: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| format!("encrypt: {e}"))?;
    let mut buf = nonce.to_vec();
    buf.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&buf))
}

fn decrypt(key: &[u8; 32], encoded: &str) -> Result<String, String> {
    let data = BASE64.decode(encoded).map_err(|e| format!("base64: {e}"))?;
    if data.len() < 12 {
        return Err("invalid encrypted data".into());
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|e| format!("decrypt: {e}"))?;
    String::from_utf8(plaintext).map_err(|e| format!("utf8: {e}"))
}

pub fn get_data_file(app: &AppHandle) -> std::path::PathBuf {
    let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("servers.json")
}

pub fn data_dir_from_file(data_file: &Path) -> PathBuf {
    data_file.parent().unwrap_or(data_file).to_path_buf()
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

pub fn save_servers(path: &Path, servers: &[ServerConfig]) -> Result<(), String> {
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

    serde_json::to_string_pretty(&out)
        .map_err(|e| e.to_string())
        .and_then(|json| std::fs::write(path, json).map_err(|e| e.to_string()))
}
