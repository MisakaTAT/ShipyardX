use russh::ChannelMsg;

use crate::models::app::server::ServerConfig;

use super::client::{block_on, connect, disconnect, map_error};

struct CommandResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

async fn run_command<F>(config: &ServerConfig, command: &str, mut on_chunk: F) -> Result<CommandResult, String>
where
    F: FnMut(&str),
{
    let mut handle = connect(config).await?;
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| map_error("创建通道失败", e))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| map_error("执行命令失败", e))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code = None;

    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => {
                let chunk = String::from_utf8_lossy(&data).to_string();
                on_chunk(&chunk);
                stdout.push_str(&chunk);
            }
            ChannelMsg::ExtendedData { data, .. } => {
                stderr.push_str(&String::from_utf8_lossy(&data));
            }
            ChannelMsg::ExitStatus { exit_status: code } => {
                exit_code = Some(code as i32);
            }
            ChannelMsg::ExitSignal { error_message, .. } => {
                if !error_message.is_empty() {
                    stderr.push_str(&error_message);
                }
            }
            _ => {}
        }
    }

    disconnect(&mut handle).await;

    Ok(CommandResult {
        stdout,
        stderr,
        exit_code: exit_code.unwrap_or(-1),
    })
}

fn command_error(result: &CommandResult) -> String {
    let stderr = result.stderr.trim();
    let stdout = result.stdout.trim();
    if !stderr.is_empty() {
        stderr.to_string()
    } else if !stdout.is_empty() {
        stdout.to_string()
    } else {
        format!("命令失败，退出码: {}", result.exit_code)
    }
}

pub fn ssh_exec_streaming<F>(config: &ServerConfig, command: &str, on_chunk: F) -> Result<String, String>
where
    F: FnMut(&str),
{
    let result = block_on(run_command(config, command, on_chunk))?;
    if result.exit_code != 0 {
        return Err(command_error(&result));
    }
    Ok(result.stdout)
}

pub fn ssh_exec(config: &ServerConfig, command: &str) -> Result<String, String> {
    ssh_exec_streaming(config, command.trim(), |_| {})
}
