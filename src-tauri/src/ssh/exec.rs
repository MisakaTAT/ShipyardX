use std::io::Read;

use crate::models::app::server::ServerConfig;

use super::session::create_ssh_session;

pub fn ssh_exec(config: &ServerConfig, command: &str) -> Result<String, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("远程命令不能为空".to_string());
    }

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
        let msg = if !stderr.is_empty() {
            stderr
        } else {
            format!("命令失败，退出码: {}", exit_code)
        };
        return Err(msg);
    }

    Ok(stdout)
}
