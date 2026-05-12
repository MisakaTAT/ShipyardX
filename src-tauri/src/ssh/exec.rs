use std::io::Read;
use std::time::Duration;

use crate::models::app::server::ServerConfig;

use super::session::create_ssh_session;

pub fn ssh_exec_streaming<F>(config: &ServerConfig, command: &str, mut on_chunk: F) -> Result<String, String>
where
    F: FnMut(&str),
{
    let sess = create_ssh_session(config)?;
    let mut channel = sess.channel_session().map_err(|e| format!("创建通道失败: {}", e))?;
    channel.exec(command).map_err(|e| format!("执行命令失败: {}", e))?;

    sess.set_blocking(false);
    let mut buf = [0u8; 8192];
    let mut stdout = String::new();

    loop {
        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                on_chunk(&chunk);
                stdout.push_str(&chunk);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            Err(_) => break,
        }
        if channel.eof() {
            break;
        }
    }

    let mut stderr_buf = Vec::new();
    let _ = channel.stderr().read_to_end(&mut stderr_buf);

    channel.wait_close().ok();
    let exit_code = channel.exit_status().unwrap_or(-1);

    if exit_code != 0 {
        let stderr = String::from_utf8_lossy(&stderr_buf).trim().to_string();
        let stdout_trimmed = stdout.trim().to_string();
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout_trimmed.is_empty() {
            stdout_trimmed
        } else {
            format!("命令失败，退出码: {}", exit_code)
        };
        return Err(msg);
    }

    Ok(stdout)
}

pub fn ssh_exec(config: &ServerConfig, command: &str) -> Result<String, String> {
    let command = command.trim();

    let sess = create_ssh_session(config)?;

    let mut channel = sess.channel_session().map_err(|e| format!("创建通道失败: {}", e))?;
    channel.exec(command).map_err(|e| format!("执行命令失败: {}", e))?;

    let mut stdout_raw = Vec::new();
    channel
        .read_to_end(&mut stdout_raw)
        .map_err(|e| format!("读取标准输出失败: {}", e))?;
    let stdout = String::from_utf8_lossy(&stdout_raw).into_owned();

    let mut stderr_buf = Vec::new();
    let _ = channel.stderr().read_to_end(&mut stderr_buf);

    channel.wait_close().ok();
    let exit_code = channel.exit_status().unwrap_or(-1);

    if exit_code != 0 {
        let stderr = String::from_utf8_lossy(&stderr_buf).trim().to_string();
        let stdout_trimmed = stdout.trim().to_string();
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout_trimmed.is_empty() {
            stdout_trimmed
        } else {
            format!("命令失败，退出码: {}", exit_code)
        };
        return Err(msg);
    }

    Ok(stdout)
}
