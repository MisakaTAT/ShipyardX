use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;

use ssh2::Session;

use crate::models::app::server::ServerConfig;

use super::limits::{CONNECT_TIMEOUT, SOCKET_IO_TIMEOUT};

fn validate_config(config: &ServerConfig) -> Result<(), String> {
    if config.host.trim().is_empty() {
        return Err("服务器地址不能为空".to_string());
    }
    if config.port == 0 {
        return Err("SSH 端口无效".to_string());
    }
    if config.username.trim().is_empty() {
        return Err("用户名不能为空".to_string());
    }
    Ok(())
}

fn expand_key_path(raw: &str) -> String {
    if let Some(rest) = raw.strip_prefix("~/") {
        format!("{}/{}", std::env::var("HOME").unwrap_or_default(), rest)
    } else {
        raw.to_string()
    }
}

pub fn create_ssh_session(config: &ServerConfig) -> Result<Session, String> {
    validate_config(config)?;

    let addrs: Vec<_> = (config.host.as_str(), config.port)
        .to_socket_addrs()
        .map_err(|e| format!("解析地址失败: {}", e))?
        .collect();

    let addr = addrs
        .into_iter()
        .next()
        .ok_or_else(|| "未解析到任何可用地址".to_string())?;

    let tcp =
        TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).map_err(|e| format!("连接 {} 超时或失败: {}", addr, e))?;

    let _ = tcp.set_read_timeout(Some(SOCKET_IO_TIMEOUT));
    let _ = tcp.set_write_timeout(Some(SOCKET_IO_TIMEOUT));
    let _ = tcp.set_nodelay(true);

    let mut sess = Session::new().map_err(|e| format!("SSH 会话创建失败: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.set_timeout(SOCKET_IO_TIMEOUT.as_millis() as u32);
    sess.handshake().map_err(|e| format!("SSH 握手失败: {}", e))?;

    match config.auth_type.as_str() {
        "password" => {
            let pw = config.password.as_deref().unwrap_or("");
            sess.userauth_password(&config.username, pw)
                .map_err(|e| format!("密码认证失败: {}", e))?;
        }
        "key" => {
            let raw = config.key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = expand_key_path(raw);
            let key_path = Path::new(&expanded);
            if !key_path.is_file() {
                return Err(format!("密钥文件不存在或不可读: {}", expanded));
            }
            sess.userauth_pubkey_file(&config.username, None, key_path, None)
                .map_err(|e| format!("密钥认证失败: {}", e))?;
        }
        _ => return Err(format!("不支持的认证类型: {}", config.auth_type)),
    }

    if !sess.authenticated() {
        return Err("认证未完成，请检查用户名和凭据".to_string());
    }

    Ok(sess)
}
