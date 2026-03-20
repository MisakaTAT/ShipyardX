use ssh2::Session;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{mpsc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

// ===================== 数据结构 =====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String, // "password" | "key"
    pub password: Option<String>,
    pub key_path: Option<String>,
}

/// Docker 主机信息 DTO
#[derive(Debug, Serialize, Clone)]
pub struct DockerInfo {
    pub containers: i64,
    pub containers_running: i64,
    pub containers_paused: i64,
    pub containers_stopped: i64,
    pub images: i64,
    pub server_version: String,
    pub name: String,
    pub ncpu: i64,
    pub mem_total: i64, // bytes
    pub os: String,
    pub os_version: String,
    pub kernel_version: String,
    pub architecture: String,
    pub storage_driver: String,
    pub warnings: i64,
}

/// 前端展示用 DTO（与前端 TypeScript 类型对应）
#[derive(Debug, Serialize, Clone)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created_at: String,
    pub running_for: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_at: String,
    pub created_since: String,
}

// ===================== Docker REST API 内部类型 =====================

/// Docker API: GET /containers/json?all=1
#[derive(Deserialize)]
struct ApiContainer {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Names")]
    names: Vec<String>,
    #[serde(rename = "Image")]
    image: String,
    #[serde(rename = "State")]
    state: String,
    #[serde(rename = "Status")]
    status: String,
    #[serde(rename = "Ports")]
    ports: Vec<ApiPort>,
    #[serde(rename = "Created")]
    created: i64,
}

#[derive(Deserialize)]
struct ApiPort {
    #[serde(rename = "IP")]
    ip: Option<String>,
    #[serde(rename = "PrivatePort")]
    private_port: u16,
    #[serde(rename = "PublicPort")]
    public_port: Option<u16>,
    #[serde(rename = "Type")]
    port_type: String,
}

/// Docker API: GET /images/json
#[derive(Deserialize)]
struct ApiImage {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "RepoTags")]
    repo_tags: Option<Vec<String>>,
    #[serde(rename = "Size")]
    size: i64,
    #[serde(rename = "Created")]
    created: i64,
}

// ===================== Docker API 辅助函数 =====================

/// 通过 SSH 调用 Docker REST API，返回响应体
fn docker_get(config: &ServerConfig, path: &str) -> Result<String, String> {
    let cmd = format!(
        "curl -s --unix-socket /var/run/docker.sock 'http://localhost{}'",
        path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)?;
    Ok(resp)
}

fn docker_post(config: &ServerConfig, path: &str) -> Result<(), String> {
    let cmd = format!(
        "curl -s -X POST --unix-socket /var/run/docker.sock 'http://localhost{}'",
        path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

fn docker_delete(config: &ServerConfig, path: &str) -> Result<(), String> {
    let cmd = format!(
        "curl -s -X DELETE --unix-socket /var/run/docker.sock 'http://localhost{}'",
        path
    );
    let resp = ssh_exec(config, &cmd)?;
    check_docker_error(&resp)
}

/// Docker API 错误响应格式: {"message": "..."}
fn check_docker_error(resp: &str) -> Result<(), String> {
    let trimmed = resp.trim();
    if trimmed.is_empty() {
        return Ok(()); // 204 No Content = 成功
    }
    // 304 Not Modified 时 Docker 不返回 body，此处也不会有问题
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
            return Err(msg.to_string());
        }
    }
    Ok(())
}

fn format_ports(ports: &[ApiPort]) -> String {
    let published: Vec<String> = ports
        .iter()
        .filter_map(|p| {
            p.public_port.map(|pub_port| {
                let ip = p.ip.as_deref().unwrap_or("0.0.0.0");
                format!("{}:{}->{}/{}", ip, pub_port, p.private_port, p.port_type)
            })
        })
        .collect();
    published.join(", ")
}

fn format_bytes(bytes: i64) -> String {
    const MB: f64 = 1_048_576.0;
    const GB: f64 = 1_073_741_824.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.1} MB", b / MB)
    } else {
        format!("{:.1} KB", b / 1024.0)
    }
}

fn time_ago(ts: i64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let diff = now.saturating_sub(ts);
    match diff {
        0..=59 => "刚刚".to_string(),
        60..=3599 => format!("{} 分钟前", diff / 60),
        3600..=86399 => format!("{} 小时前", diff / 3600),
        86400..=2591999 => format!("{} 天前", diff / 86400),
        _ => format!("{} 个月前", diff / 2592000),
    }
}

fn api_container_to_dto(c: ApiContainer) -> DockerContainer {
    let name = c
        .names
        .first()
        .map(|n| n.trim_start_matches('/').to_string())
        .unwrap_or_default();
    DockerContainer {
        id: c.id[..12.min(c.id.len())].to_string(),
        name,
        image: c.image,
        state: c.state,
        status: c.status,
        ports: format_ports(&c.ports),
        created_at: time_ago(c.created),
        running_for: time_ago(c.created),
    }
}

fn api_image_to_dto(img: ApiImage) -> DockerImage {
    let (repository, tag) = img
        .repo_tags
        .as_deref()
        .and_then(|tags| tags.iter().find(|t| *t != "<none>:<none>"))
        .map(|t| {
            t.rfind(':')
                .map(|i| (t[..i].to_string(), t[i + 1..].to_string()))
                .unwrap_or_else(|| (t.clone(), "latest".to_string()))
        })
        .unwrap_or_else(|| ("<none>".to_string(), "<none>".to_string()));

    DockerImage {
        id: img.id.clone(),
        repository,
        tag,
        size: format_bytes(img.size),
        created_at: time_ago(img.created),
        created_since: time_ago(img.created),
    }
}

// ===================== 容器统计 =====================

/// Docker GET /containers/{id}/stats?stream=false 的内部解析类型
#[derive(Deserialize)]
struct RawStats {
    cpu_stats: RawCpuStats,
    precpu_stats: RawCpuStats,
    memory_stats: RawMemStats,
    networks: Option<HashMap<String, RawNetStats>>,
    blkio_stats: RawBlkioStats,
}

#[derive(Deserialize)]
struct RawCpuStats {
    cpu_usage: RawCpuUsage,
    system_cpu_usage: Option<u64>,
    online_cpus: Option<u32>,
}

#[derive(Deserialize)]
struct RawCpuUsage {
    total_usage: u64,
    percpu_usage: Option<Vec<u64>>,
}

#[derive(Deserialize)]
struct RawMemStats {
    usage: Option<u64>,
    limit: Option<u64>,
    stats: Option<HashMap<String, u64>>,
}

#[derive(Deserialize)]
struct RawNetStats {
    rx_bytes: u64,
    tx_bytes: u64,
}

#[derive(Deserialize)]
struct RawBlkioStats {
    io_service_bytes_recursive: Option<Vec<RawBlkioEntry>>,
}

#[derive(Deserialize)]
struct RawBlkioEntry {
    op: String,
    value: u64,
}

/// 前端展示用 Stats DTO
#[derive(Serialize, Clone)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub mem_usage: u64,
    pub mem_limit: u64,
    pub mem_percent: f64,
    pub net_rx: u64,
    pub net_tx: u64,
    pub blk_read: u64,
    pub blk_write: u64,
}

// ===================== 日志流 / 拉取流句柄 =====================

struct StreamHandle {
    tx: mpsc::Sender<()>, // 发送 () 即停止流
}

// ===================== 终端状态 =====================

enum TerminalMsg {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

struct TerminalHandle {
    tx: mpsc::Sender<TerminalMsg>,
}

pub struct AppState {
    pub servers: Mutex<Vec<ServerConfig>>,
    pub data_file: Mutex<std::path::PathBuf>,
    terminals: Mutex<HashMap<String, TerminalHandle>>,
    streams: Mutex<HashMap<String, StreamHandle>>,
}

// ===================== 文件持久化 =====================

fn get_data_file(app: &AppHandle) -> std::path::PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("无法获取应用数据目录");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("servers.json")
}

fn load_servers(path: &std::path::Path) -> Vec<ServerConfig> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_servers(path: &std::path::Path, servers: &[ServerConfig]) -> Result<(), String> {
    serde_json::to_string_pretty(servers)
        .map_err(|e| e.to_string())
        .and_then(|json| std::fs::write(path, json).map_err(|e| e.to_string()))
}

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("{:x}{:x}", secs, nanos)
}

// ===================== SSH 执行 =====================

/// 建立认证完成的 SSH Session（可在多处复用）
fn create_ssh_session(config: &ServerConfig) -> Result<Session, String> {
    let addr = format!("{}:{}", config.host, config.port);
    let tcp = TcpStream::connect(&addr)
        .map_err(|e| format!("无法连接到 {}: {}", addr, e))?;
    let _ = tcp.set_read_timeout(Some(std::time::Duration::from_secs(30)));
    let _ = tcp.set_write_timeout(Some(std::time::Duration::from_secs(30)));

    let mut sess = Session::new().map_err(|e| format!("SSH 会话创建失败: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("SSH 握手失败: {}", e))?;

    match config.auth_type.as_str() {
        "password" => {
            sess.userauth_password(
                &config.username,
                config.password.as_deref().unwrap_or(""),
            )
            .map_err(|e| format!("密码认证失败: {}", e))?;
        }
        "key" => {
            let raw_path = config.key_path.as_deref().unwrap_or("~/.ssh/id_rsa");
            let expanded = if raw_path.starts_with("~/") {
                format!("{}{}", std::env::var("HOME").unwrap_or_default(), &raw_path[1..])
            } else {
                raw_path.to_string()
            };
            sess.userauth_pubkey_file(
                &config.username,
                None,
                std::path::Path::new(&expanded),
                None,
            )
            .map_err(|e| format!("密钥认证失败: {}", e))?;
        }
        _ => return Err("不支持的认证类型".to_string()),
    }

    if !sess.authenticated() {
        return Err("认证失败，请检查用户名和凭据".to_string());
    }

    Ok(sess)
}

fn ssh_exec(config: &ServerConfig, command: &str) -> Result<String, String> {
    let sess = create_ssh_session(config)?;

    let mut channel = sess
        .channel_session()
        .map_err(|e| format!("创建通道失败: {}", e))?;
    channel.exec(command).map_err(|e| format!("执行命令失败: {}", e))?;

    let mut stdout = String::new();
    channel.read_to_string(&mut stdout).map_err(|e| format!("读取输出失败: {}", e))?;

    let mut stderr = String::new();
    channel.stderr().read_to_string(&mut stderr).ok();

    channel.wait_close().ok();
    let exit_code = channel.exit_status().unwrap_or(-1);

    if exit_code != 0 {
        let msg = if !stderr.is_empty() { stderr.trim().to_string() }
                  else { format!("命令失败，退出码: {}", exit_code) };
        return Err(msg);
    }

    Ok(stdout)
}

fn get_server_config(state: &State<AppState>, id: &str) -> Result<ServerConfig, String> {
    state
        .servers
        .lock()
        .unwrap()
        .iter()
        .find(|s| s.id == id)
        .cloned()
        .ok_or_else(|| "服务器不存在".to_string())
}

// ===================== 服务器管理命令 =====================

#[tauri::command]
fn get_servers(state: State<AppState>) -> Vec<ServerConfig> {
    state.servers.lock().unwrap().clone()
}

#[tauri::command]
fn add_server(
    mut server: ServerConfig,
    state: State<AppState>,
) -> Result<Vec<ServerConfig>, String> {
    server.id = generate_id();
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    servers.push(server);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

#[tauri::command]
fn update_server(
    server: ServerConfig,
    state: State<AppState>,
) -> Result<Vec<ServerConfig>, String> {
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    if let Some(existing) = servers.iter_mut().find(|s| s.id == server.id) {
        *existing = server;
    }
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

#[tauri::command]
fn delete_server(id: String, state: State<AppState>) -> Result<Vec<ServerConfig>, String> {
    let mut servers = state.servers.lock().unwrap();
    let data_file = state.data_file.lock().unwrap();
    servers.retain(|s| s.id != id);
    save_servers(&data_file, &servers)?;
    Ok(servers.clone())
}

#[tauri::command]
async fn test_connection(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        ssh_exec(
            &server,
            "docker version --format 'Server: {{.Server.Version}}'",
        )
        .map(|v| format!("连接成功！Docker {}", v.trim()))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ===================== 容器管理命令 =====================

#[tauri::command]
async fn list_containers(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DockerContainer>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/v1.41/containers/json?all=1")?;
        let api: Vec<ApiContainer> = serde_json::from_str(&resp)
            .map_err(|e| format!("解析容器列表失败: {} — 原始响应: {}", e, &resp[..resp.len().min(200)]))?;
        Ok(api.into_iter().map(api_container_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn start_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_post(&server, &format!("/v1.41/containers/{}/start", container_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stop_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_post(&server, &format!("/v1.41/containers/{}/stop", container_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn restart_container(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_post(&server, &format!("/v1.41/containers/{}/restart", container_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_container(
    server_id: String,
    container_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_delete(
            &server,
            &format!("/v1.41/containers/{}?force={}", container_id, force),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 日志通过 Docker API 流式获取，去掉 8 字节 multiplexing 帧头
#[tauri::command]
async fn get_container_logs(
    server_id: String,
    container_id: String,
    tail: u32,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        // Docker logs API 返回 multiplexed stream（8 字节帧头 + payload）
        // 用 curl 的 -o- 直接输出二进制，再通过 base64 在 SSH 管道传回
        let cmd = format!(
            "curl -s --unix-socket /var/run/docker.sock \
            'http://localhost/v1.41/containers/{}/logs?stdout=1&stderr=1&tail={}&follow=0' | base64",
            container_id, tail
        );
        let b64 = ssh_exec(&server, &cmd)?;
        let raw = base64_decode(b64.trim())?;
        Ok(demux_docker_log_stream(&raw))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ===================== 镜像管理命令 =====================

#[tauri::command]
async fn list_images(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DockerImage>, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/v1.41/images/json")?;
        let api: Vec<ApiImage> = serde_json::from_str(&resp)
            .map_err(|e| format!("解析镜像列表失败: {}", e))?;
        Ok(api.into_iter().map(api_image_to_dto).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_image(
    server_id: String,
    image_id: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        docker_delete(
            &server,
            &format!("/v1.41/images/{}?force={}", image_id, force),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 拉取镜像保留 CLI 方式，因为 API 返回 chunked NDJSON 进度流，CLI 更易处理
#[tauri::command]
async fn pull_image(
    server_id: String,
    image: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || ssh_exec(&server, &format!("docker pull {}", image)))
        .await
        .map_err(|e| e.to_string())?
}

// ===================== 日志流解码工具 =====================

/// Docker multiplexed log stream 帧格式：
/// [stream_type(1)] [padding(3)] [payload_size_be(4)] [payload...]
fn demux_docker_log_stream(data: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0usize;
    while i + 8 <= data.len() {
        let stream_type = data[i];
        let size = u32::from_be_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]) as usize;
        i += 8;
        if i + size > data.len() {
            break;
        }
        // 0=stdin 1=stdout 2=stderr，都输出到展示面板
        if stream_type <= 2 {
            out.push_str(&String::from_utf8_lossy(&data[i..i + size]));
        }
        i += size;
    }
    // 若帧解码失败（极少数情况），降级为原始文本
    if out.is_empty() && !data.is_empty() {
        out = String::from_utf8_lossy(data).to_string();
    }
    out
}

/// 简单的 Base64 解码（不引入额外 crate）
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [255u8; 256];
    for (i, &c) in CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let clean: Vec<u8> = input
        .bytes()
        .filter(|&b| b != b'\n' && b != b'\r' && b != b' ')
        .collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &c in &clean {
        if c == b'=' {
            break;
        }
        let v = table[c as usize];
        if v == 255 {
            return Err(format!("无效的 base64 字符: {}", c as char));
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

// ===================== Docker 主机信息 =====================

#[tauri::command]
async fn get_docker_info(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<DockerInfo, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(&server, "/v1.41/info")?;
        let v: serde_json::Value =
            serde_json::from_str(&resp).map_err(|e| format!("解析失败: {}", e))?;
        Ok(DockerInfo {
            containers: v["Containers"].as_i64().unwrap_or(0),
            containers_running: v["ContainersRunning"].as_i64().unwrap_or(0),
            containers_paused: v["ContainersPaused"].as_i64().unwrap_or(0),
            containers_stopped: v["ContainersStopped"].as_i64().unwrap_or(0),
            images: v["Images"].as_i64().unwrap_or(0),
            server_version: v["ServerVersion"].as_str().unwrap_or("").to_string(),
            name: v["Name"].as_str().unwrap_or("").to_string(),
            ncpu: v["NCPU"].as_i64().unwrap_or(0),
            mem_total: v["MemTotal"].as_i64().unwrap_or(0),
            os: v["OperatingSystem"].as_str().unwrap_or("").to_string(),
            os_version: v["OSVersion"].as_str().unwrap_or("").to_string(),
            kernel_version: v["KernelVersion"].as_str().unwrap_or("").to_string(),
            architecture: v["Architecture"].as_str().unwrap_or("").to_string(),
            storage_driver: v["Driver"].as_str().unwrap_or("").to_string(),
            warnings: v["Warnings"].as_array().map(|a| a.len() as i64).unwrap_or(0),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ===================== 容器 Stats 命令 =====================

#[tauri::command]
async fn get_container_stats(
    server_id: String,
    container_id: String,
    state: State<'_, AppState>,
) -> Result<ContainerStats, String> {
    let server = get_server_config(&state, &server_id)?;
    tokio::task::spawn_blocking(move || {
        let resp = docker_get(
            &server,
            &format!("/v1.41/containers/{}/stats?stream=false&one-shot=true", container_id),
        )?;
        let raw: RawStats =
            serde_json::from_str(&resp).map_err(|e| format!("解析 stats 失败: {}", e))?;

        // CPU %
        let cpu_delta = raw.cpu_stats.cpu_usage.total_usage
            .saturating_sub(raw.precpu_stats.cpu_usage.total_usage);
        let sys_delta = raw.cpu_stats.system_cpu_usage.unwrap_or(0)
            .saturating_sub(raw.precpu_stats.system_cpu_usage.unwrap_or(0));
        let num_cpus = raw.cpu_stats.online_cpus.unwrap_or_else(|| {
            raw.cpu_stats.cpu_usage.percpu_usage.as_ref()
                .map(|v| v.len() as u32)
                .unwrap_or(1)
        });
        let cpu_percent = if sys_delta > 0 {
            ((cpu_delta as f64 / sys_delta as f64) * num_cpus as f64 * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        };

        // 内存（减去 page cache）
        let usage = raw.memory_stats.usage.unwrap_or(0);
        let cache = raw.memory_stats.stats.as_ref()
            .and_then(|s| s.get("cache").or(s.get("inactive_file")).copied())
            .unwrap_or(0);
        let mem_usage = usage.saturating_sub(cache);
        let mem_limit = raw.memory_stats.limit.unwrap_or(1);
        let mem_percent = ((mem_usage as f64 / mem_limit as f64) * 100.0 * 10.0).round() / 10.0;

        // 网络 I/O（汇总所有接口）
        let (net_rx, net_tx) = raw.networks.as_ref()
            .map(|nets| nets.values()
                .fold((0u64, 0u64), |(rx, tx), n| (rx + n.rx_bytes, tx + n.tx_bytes)))
            .unwrap_or((0, 0));

        // 块 I/O
        let (blk_read, blk_write) = raw.blkio_stats.io_service_bytes_recursive.as_ref()
            .map(|entries| entries.iter()
                .fold((0u64, 0u64), |(r, w), e| match e.op.to_lowercase().as_str() {
                    "read" => (r + e.value, w),
                    "write" => (r, w + e.value),
                    _ => (r, w),
                }))
            .unwrap_or((0, 0));

        Ok(ContainerStats {
            cpu_percent,
            mem_usage,
            mem_limit,
            mem_percent,
            net_rx,
            net_tx,
            blk_read,
            blk_write,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ===================== 日志流线程 =====================

fn run_log_stream_thread(
    config: ServerConfig,
    stream_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    rx: mpsc::Receiver<()>,
    ah: AppHandle,
) {
    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("\x1b[31m连接失败: {}\x1b[0m\r\n", e);
            let _ = ah.emit(&format!("log-data:{}", stream_id), msg.into_bytes());
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    };

    let ts_flag = if timestamps { "--timestamps " } else { "" };
    let cmd = format!("docker logs -f --tail {} {}{}  2>&1", tail, ts_flag, container_id);

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let _ = ah.emit(&format!("log-data:{}", stream_id),
                format!("\x1b[31m通道失败: {}\x1b[0m\r\n", e).into_bytes());
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    };

    if let Err(e) = channel.exec(&cmd) {
        let _ = ah.emit(&format!("log-data:{}", stream_id),
            format!("\x1b[31m启动失败: {}\x1b[0m\r\n", e).into_bytes());
        let _ = ah.emit(&format!("log-done:{}", stream_id), ());
        return;
    }

    sess.set_blocking(false);
    let mut buf = [0u8; 8192];

    loop {
        match rx.try_recv() {
            Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                let _ = ah.emit(&format!("log-done:{}", stream_id), ());
                return;
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }

        match channel.read(&mut buf) {
            Ok(0) => { let _ = ah.emit(&format!("log-done:{}", stream_id), ()); return; }
            Ok(n) => { let _ = ah.emit(&format!("log-data:{}", stream_id), buf[..n].to_vec()); }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(_) => { let _ = ah.emit(&format!("log-done:{}", stream_id), ()); return; }
        }

        if channel.eof() {
            let _ = ah.emit(&format!("log-done:{}", stream_id), ());
            return;
        }
    }
}

#[tauri::command]
fn start_log_stream(
    server_id: String,
    container_id: String,
    tail: u32,
    timestamps: bool,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    let stream_id = generate_id();
    let (tx, rx) = mpsc::channel::<()>();

    let sid = stream_id.clone();
    let cid = container_id.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_log_stream_thread(server, sid, cid, tail, timestamps, rx, ah));

    state.streams.lock().unwrap().insert(stream_id.clone(), StreamHandle { tx });
    Ok(stream_id)
}

#[tauri::command]
fn stop_log_stream(stream_id: String, state: State<AppState>) {
    if let Some(h) = state.streams.lock().unwrap().remove(&stream_id) {
        let _ = h.tx.send(());
    }
}

// ===================== 镜像拉取流线程 =====================

fn run_pull_thread(
    config: ServerConfig,
    pull_id: String,
    image: String,
    rx: mpsc::Receiver<()>,
    ah: AppHandle,
) {
    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            let _ = ah.emit(&format!("pull-data:{}", pull_id),
                format!("连接失败: {}\n", e));
            let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let _ = ah.emit(&format!("pull-data:{}", pull_id), format!("通道失败: {}\n", e));
            let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
            return;
        }
    };

    if let Err(e) = channel.exec(&format!("docker pull {} 2>&1", image)) {
        let _ = ah.emit(&format!("pull-data:{}", pull_id), format!("执行失败: {}\n", e));
        let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
        return;
    }

    sess.set_blocking(false);
    let mut buf = [0u8; 4096];

    loop {
        match rx.try_recv() {
            Ok(()) | Err(mpsc::TryRecvError::Disconnected) => {
                let _ = ah.emit(&format!("pull-done:{}", pull_id), false);
                return;
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }

        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let text = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = ah.emit(&format!("pull-data:{}", pull_id), text);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(_) => break,
        }

        if channel.eof() { break; }
    }

    channel.wait_close().ok();
    let success = channel.exit_status().unwrap_or(-1) == 0;
    let _ = ah.emit(&format!("pull-done:{}", pull_id), success);
}

#[tauri::command]
fn start_image_pull(
    server_id: String,
    image: String,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    let pull_id = generate_id();
    let (tx, rx) = mpsc::channel::<()>();

    let pid = pull_id.clone();
    let img = image.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || run_pull_thread(server, pid, img, rx, ah));

    state.streams.lock().unwrap().insert(pull_id.clone(), StreamHandle { tx });
    Ok(pull_id)
}

#[tauri::command]
fn cancel_stream(stream_id: String, state: State<AppState>) {
    if let Some(h) = state.streams.lock().unwrap().remove(&stream_id) {
        let _ = h.tx.send(());
    }
}

// ===================== 终端 PTY 线程 =====================

fn run_terminal_thread(
    config: ServerConfig,
    session_id: String,
    rx: mpsc::Receiver<TerminalMsg>,
    ah: AppHandle,
    cols: u32,
    rows: u32,
) {
    let sess = match create_ssh_session(&config) {
        Ok(s) => s,
        Err(e) => {
            let _ = ah.emit(&format!("terminal-output:{}", session_id),
                format!("\x1b[31m{}\x1b[0m\r\n", e).into_bytes());
            let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
            return;
        }
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("\x1b[31m通道创建失败: {}\x1b[0m\r\n", e);
            let _ = ah.emit(&format!("terminal-output:{}", session_id), msg);
            let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
            return;
        }
    };

    if let Err(e) = channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
        let msg = format!("\x1b[31mPTY 请求失败: {}\x1b[0m\r\n", e);
        let _ = ah.emit(&format!("terminal-output:{}", session_id), msg);
        let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
        return;
    }

    if let Err(e) = channel.shell() {
        let msg = format!("\x1b[31mShell 启动失败: {}\x1b[0m\r\n", e);
        let _ = ah.emit(&format!("terminal-output:{}", session_id), msg.into_bytes());
        let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
        return;
    }

    // 切换到非阻塞模式，轮询读写
    sess.set_blocking(false);

    let mut buf = [0u8; 8192];

    loop {
        // 处理来自前端的消息
        loop {
            match rx.try_recv() {
                Ok(TerminalMsg::Data(data)) => {
                    sess.set_blocking(true);
                    let _ = channel.write_all(&data);
                    let _ = channel.flush();
                    sess.set_blocking(false);
                }
                Ok(TerminalMsg::Resize { cols, rows }) => {
                    sess.set_blocking(true);
                    let _ = channel.request_pty_size(cols, rows, None, None);
                    sess.set_blocking(false);
                }
                Ok(TerminalMsg::Close) | Err(mpsc::TryRecvError::Disconnected) => {
                    let _ = channel.close();
                    let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
                    return;
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        // 读取 SSH 输出
        match channel.read(&mut buf) {
            Ok(0) => {
                let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
                return;
            }
            Ok(n) => {
                let _ = ah.emit(
                    &format!("terminal-output:{}", session_id),
                    buf[..n].to_vec(),
                );
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(8));
            }
            Err(_) => {
                let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
                return;
            }
        }

        if channel.eof() {
            let _ = ah.emit(&format!("terminal-closed:{}", session_id), ());
            return;
        }
    }
}

// ===================== 终端 Tauri 命令 =====================

#[tauri::command]
fn open_terminal(
    server_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let server = get_server_config(&state, &server_id)?;
    let session_id = generate_id();
    let (tx, rx) = mpsc::channel::<TerminalMsg>();

    let sid = session_id.clone();
    let ah = app_handle.clone();
    std::thread::spawn(move || {
        run_terminal_thread(server, sid, rx, ah, cols, rows);
    });

    state
        .terminals
        .lock()
        .unwrap()
        .insert(session_id.clone(), TerminalHandle { tx });

    Ok(session_id)
}

#[tauri::command]
fn write_terminal(
    session_id: String,
    data: Vec<u8>,
    state: State<AppState>,
) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.get(&session_id) {
        handle
            .tx
            .send(TerminalMsg::Data(data))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_terminal(
    session_id: String,
    cols: u32,
    rows: u32,
    state: State<AppState>,
) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.get(&session_id) {
        handle
            .tx
            .send(TerminalMsg::Resize { cols, rows })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_terminal(session_id: String, state: State<AppState>) -> Result<(), String> {
    let mut terminals = state.terminals.lock().unwrap();
    if let Some(handle) = terminals.remove(&session_id) {
        let _ = handle.tx.send(TerminalMsg::Close);
    }
    Ok(())
}

// ===================== 应用入口 =====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_file = get_data_file(app.handle());
            let servers = load_servers(&data_file);
            app.manage(AppState {
                servers: Mutex::new(servers),
                data_file: Mutex::new(data_file),
                terminals: Mutex::new(HashMap::new()),
                streams: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_servers,
            add_server,
            update_server,
            delete_server,
            test_connection,
            list_containers,
            start_container,
            stop_container,
            restart_container,
            remove_container,
            get_container_logs,
            list_images,
            remove_image,
            pull_image,
            get_docker_info,
            get_container_stats,
            start_log_stream,
            stop_log_stream,
            start_image_pull,
            cancel_stream,
            open_terminal,
            write_terminal,
            resize_terminal,
            close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("运行应用时出错");
}
