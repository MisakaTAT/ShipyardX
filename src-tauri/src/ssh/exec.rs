use russh::ChannelMsg;

use crate::contracts::frontend::server::ServerConfig;
use crate::error::{AppError, AppResult};

use super::client::{connect, disconnect};

struct CommandResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

async fn run_command<F>(config: &ServerConfig, command: &str, mut on_chunk: F) -> AppResult<CommandResult>
where
    F: FnMut(&str),
{
    let mut handle = connect(config).await?;
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::internal("ssh.channel_open_failed", "创建 SSH 通道失败").with_source(e))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| AppError::internal("ssh.exec_failed", "执行远程命令失败").with_source(e))?;

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

fn command_error(result: &CommandResult) -> AppError {
    let stderr = result.stderr.trim();
    let stdout = result.stdout.trim();
    let detail = if !stderr.is_empty() {
        stderr.to_string()
    } else if !stdout.is_empty() {
        stdout.to_string()
    } else {
        format!("命令失败，退出码: {}", result.exit_code)
    };

    AppError::internal("ssh.command_failed", "远程命令执行失败").with_detail(detail)
}

pub async fn ssh_exec_streaming_async<F>(config: &ServerConfig, command: &str, on_chunk: F) -> AppResult<String>
where
    F: FnMut(&str),
{
    let result = run_command(config, command, on_chunk).await?;
    if result.exit_code != 0 {
        return Err(command_error(&result));
    }
    Ok(result.stdout)
}

pub async fn ssh_exec_async(config: &ServerConfig, command: &str) -> AppResult<String> {
    ssh_exec_streaming_async(config, command.trim(), |_| {}).await
}
