use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;

use crate::core::models::ServerConfig;

/// 建立认证完成的 SSH Session
pub fn create_ssh_session(config: &ServerConfig) -> Result<Session, String> {
    let addr = format!("{}:{}", config.host, config.port);
    let tcp = TcpStream::connect(&addr).map_err(|e| format!("无法连接到 {}: {}", addr, e))?;
    let _ = tcp.set_read_timeout(Some(std::time::Duration::from_secs(30)));
    let _ = tcp.set_write_timeout(Some(std::time::Duration::from_secs(30)));

    let mut sess = Session::new().map_err(|e| format!("SSH 会话创建失败: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("SSH 握手失败: {}", e))?;

    match config.auth_type.as_str() {
        "password" => {
            sess.userauth_password(&config.username, config.password.as_deref().unwrap_or(""))
                .map_err(|e| format!("密码认证失败: {}", e))?;
        }
        "key" => {
            let raw = config.key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = if raw.starts_with("~/") {
                format!("{}{}", std::env::var("HOME").unwrap_or_default(), &raw[1..])
            } else {
                raw.to_string()
            };
            sess.userauth_pubkey_file(&config.username, None, std::path::Path::new(&expanded), None)
                .map_err(|e| format!("密钥认证失败: {}", e))?;
        }
        _ => return Err("不支持的认证类型".to_string()),
    }

    if !sess.authenticated() {
        return Err("认证失败，请检查用户名和凭据".to_string());
    }

    Ok(sess)
}

/// 通过 SSH 执行单条命令，返回 stdout
pub fn ssh_exec(config: &ServerConfig, command: &str) -> Result<String, String> {
    let sess = create_ssh_session(config)?;

    let mut channel = sess.channel_session().map_err(|e| format!("创建通道失败: {}", e))?;
    channel.exec(command).map_err(|e| format!("执行命令失败: {}", e))?;

    let mut stdout = String::new();
    channel
        .read_to_string(&mut stdout)
        .map_err(|e| format!("读取输出失败: {}", e))?;

    let mut stderr = String::new();
    channel.stderr().read_to_string(&mut stderr).ok();

    channel.wait_close().ok();
    let exit_code = channel.exit_status().unwrap_or(-1);

    if exit_code != 0 {
        let msg = if !stderr.is_empty() {
            stderr.trim().to_string()
        } else {
            format!("命令失败，退出码: {}", exit_code)
        };
        return Err(msg);
    }

    Ok(stdout)
}
