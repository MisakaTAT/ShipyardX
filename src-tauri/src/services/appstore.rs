use log::{debug, info, warn};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_specta::Event;
use tokio::fs;
use uuid::Uuid;

use crate::dto::appstore::{AppDetail, AppListItem, AppstoreCacheInfo, AppstoreSettings, InstallApp};
use crate::dto::events::{AppstoreSyncProgress, InstallStepEvent};
use crate::dto::server::ServerConfig;
use crate::error::{AppError, AppResult};
use crate::scripts::{APPSTORE_COMPOSE_UP_SH, APPSTORE_CREATE_NETWORK_SH, render_shell};
use crate::services::appstore_repo::AppstoreRepo;
use crate::ssh::exec::{ssh_exec, ssh_exec_streaming};
use crate::ssh::sftp::SshSftpSession;
use crate::utils::output::TextOutputBuffer;

const INSTALL_OUTPUT_CHUNK_BYTES: usize = 4 * 1024;
const DATA_UPLOAD_PROGRESS_BYTES: u64 = 4 * 1024 * 1024;

pub async fn sync_appstore(app: &AppHandle) -> AppResult<PathBuf> {
    let cache_dirs = AppstoreRepo::sync_enabled_with_progress(app).await?;
    let last_cache_dir = cache_dirs
        .last()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("appstore_cache"));
    info!(target: "shipyardx_lib::services::appstore", "appstore synced; count={} last_cache_dir={}", cache_dirs.len(), last_cache_dir.display());
    Ok(last_cache_dir)
}

pub async fn list_apps(app: &AppHandle, source_id: Option<&str>) -> AppResult<Vec<AppListItem>> {
    let repo = match source_id {
        Some(source_id) => {
            let settings = AppstoreRepo::new(app)?.load_settings().await?;
            let source = settings
                .sources
                .into_iter()
                .find(|source| source.id == source_id)
                .ok_or_else(|| {
                    AppError::not_found("appstore.source_not_found", format!("应用商店源不存在: {source_id}"))
                })?;
            AppstoreRepo::with_source(app, source)?
        }
        None => AppstoreRepo::new(app)?,
    };
    let items = repo.list_apps().await?;
    info!(target: "shipyardx_lib::services::appstore", "listed appstore apps; count={}", items.len());
    Ok(items)
}

pub async fn get_appstore_settings(app: &AppHandle) -> AppResult<AppstoreSettings> {
    AppstoreRepo::new(app)?.load_settings().await
}

pub async fn update_appstore_settings(app: &AppHandle, settings: AppstoreSettings) -> AppResult<AppstoreSettings> {
    AppstoreRepo::new(app)?.save_settings(settings).await
}

pub async fn get_appstore_cache_info(app: &AppHandle) -> AppResult<AppstoreCacheInfo> {
    AppstoreRepo::new(app)?.get_cache_info().await
}

pub async fn clear_appstore_cache(app: &AppHandle) -> AppResult<()> {
    AppstoreRepo::new(app)?.clear_cache().await
}

pub async fn get_app_detail(app: &AppHandle, source_id: Option<&str>, app_key: &str) -> AppResult<AppDetail> {
    debug!(target: "shipyardx_lib::services::appstore", "fetching app detail; source_id={:?} app_key={}", source_id, app_key);
    let repo = match source_id {
        Some(source_id) => {
            let settings = AppstoreRepo::new(app)?.load_settings().await?;
            let source = settings
                .sources
                .into_iter()
                .find(|source| source.id == source_id)
                .ok_or_else(|| {
                    AppError::not_found("appstore.source_not_found", format!("应用商店源不存在: {source_id}"))
                })?;
            AppstoreRepo::with_source(app, source)?
        }
        None => AppstoreRepo::new(app)?,
    };
    let detail = repo.get_app_detail(app_key).await?;
    info!(target: "shipyardx_lib::services::appstore", "fetched app detail; app_key={} versions={}", app_key, detail.versions.len());
    Ok(detail)
}

fn emit_step(app: &AppHandle, step: &str, status: &str, message: &str) {
    let _ = InstallStepEvent {
        step: step.to_string(),
        status: status.to_string(),
        message: message.to_string(),
        output_chunk: None,
    }
    .emit(app);
}

pub(crate) fn emit_appstore_sync_progress(
    app: &AppHandle,
    phase: &str,
    received_objects: u32,
    total_objects: u32,
    indexed_objects: u32,
    percent: f64,
) {
    let _ = AppstoreSyncProgress {
        phase: phase.to_string(),
        received_objects,
        total_objects,
        indexed_objects,
        percent,
    }
    .emit(app);
}

fn emit_output(app: &AppHandle, step: &str, chunk: &str) {
    let _ = InstallStepEvent {
        step: step.to_string(),
        status: String::new(),
        message: String::new(),
        output_chunk: Some(chunk.to_string()),
    }
    .emit(app);
}

fn emit_buffered_output(app: &AppHandle, step: &str, buffer: &mut TextOutputBuffer, chunk: &str) {
    for flushed in buffer.push(chunk) {
        emit_output(app, step, &flushed);
    }
}

fn flush_buffered_output(app: &AppHandle, step: &str, buffer: &mut TextOutputBuffer) {
    for flushed in buffer.finish() {
        emit_output(app, step, &flushed);
    }
}

pub async fn install_app_inner(app: &AppHandle, server: &ServerConfig, req: &InstallApp) -> AppResult<()> {
    info!(target: "shipyardx_lib::services::appstore", "installing app; server_id={} app_key={} version={} env_keys={}", server.id, req.app_key, req.version, req.env_values.len());
    let repo = AppstoreRepo::new(app)?;
    let version_dir = repo.version_dir(&req.app_key, &req.version);

    if !fs::try_exists(&version_dir).await.unwrap_or(false) {
        return Err(AppError::not_found(
            "appstore.version_not_found",
            format!("应用 {} 版本 {} 的 docker-compose.yml 不存在", req.app_key, req.version),
        )
        .with_detail(format!("app_key={}, version={}", req.app_key, req.version)));
    }

    // Step 1: 准备模板
    emit_step(app, "prepare", "running", "正在准备部署模板...");
    let compose_template = fs::read_to_string(version_dir.join("docker-compose.yml"))
        .await
        .map_err(|e| {
            emit_step(app, "prepare", "error", &format!("读取模板失败: {}", e));
            AppError::internal("appstore.compose_template_read_failed", "读取部署模板失败").with_source(e)
        })?;

    let rendered = render_compose(&compose_template, &req.env_values);
    debug!(target: "shipyardx_lib::services::appstore", "app compose rendered; server_id={} app_key={} version={} env_keys={}", server.id, req.app_key, req.version, req.env_values.len());
    emit_step(app, "prepare", "done", "部署模板准备完成");

    // Step 2: 部署文件
    emit_step(app, "deploy", "running", "正在部署文件到远程服务器...");
    let install_id = Uuid::new_v4().to_string();
    let remote_rel_base = format!("shipyardx/apps/{}", install_id);
    info!(target: "shipyardx_lib::services::appstore", "deploying app files; server_id={} app_key={} version={} install_id={}", server.id, req.app_key, req.version, install_id);

    let env_content = build_env_file(&req.env_values);
    let sftp = SshSftpSession::connect(server).await.map_err(|e| {
        emit_step(app, "deploy", "error", &format!("建立 SFTP 连接失败: {}", e));
        e
    })?;
    let remote_base_dir = sftp.home_path(&remote_rel_base);
    sftp.create_dir_all(&remote_base_dir).await.map_err(|e| {
        emit_step(app, "deploy", "error", &format!("创建远程目录失败: {}", e));
        e
    })?;
    sftp.upload_bytes(&format!("{}/docker-compose.yml", remote_base_dir), rendered.as_bytes())
        .await
        .map_err(|e| {
            emit_step(app, "deploy", "error", &format!("上传 docker-compose.yml 失败: {}", e));
            e
        })?;
    sftp.upload_bytes(&format!("{}/.env", remote_base_dir), env_content.as_bytes())
        .await
        .map_err(|e| {
            emit_step(app, "deploy", "error", &format!("上传 .env 失败: {}", e));
            e
        })?;

    let local_data_dir = version_dir.join("data");
    let local_data_meta = fs::metadata(&local_data_dir).await.ok();
    if local_data_meta.as_ref().is_some_and(|meta| meta.is_dir()) {
        info!(target: "shipyardx_lib::services::appstore", "copying app data dir; server_id={} app_key={} version={}", server.id, req.app_key, req.version);
        emit_step(app, "deploy", "running", "正在复制数据目录...");
        copy_data_dir_to_remote(app, &sftp, &local_data_dir, &format!("{}/data", remote_base_dir))
            .await
            .map_err(|e| {
                emit_step(app, "deploy", "error", &format!("复制数据失败: {}", e));
                e
            })?;
    }
    emit_step(app, "deploy", "done", "文件部署完成");
    info!(target: "shipyardx_lib::services::appstore", "app files deployed; server_id={} app_key={} version={} install_id={}", server.id, req.app_key, req.version, install_id);

    // Step 3: 创建网络
    emit_step(app, "network", "running", "正在创建 Docker 网络...");
    let net_cmd = APPSTORE_CREATE_NETWORK_SH.to_string();
    let _ = ssh_exec(server, &net_cmd).await;
    emit_step(app, "network", "done", "Docker 网络就绪");
    info!(target: "shipyardx_lib::services::appstore", "app network ensured; server_id={} app_key={} version={}", server.id, req.app_key, req.version);

    // Step 4: 启动容器
    emit_step(app, "start", "running", "正在启动容器服务...");
    let up_cmd_v2 = render_shell(
        APPSTORE_COMPOSE_UP_SH,
        &[("__COMPOSE_BIN__", "docker compose")],
        &[("__REMOTE_REL_BASE__", &remote_rel_base)],
    );
    let up_cmd_v1 = render_shell(
        APPSTORE_COMPOSE_UP_SH,
        &[("__COMPOSE_BIN__", "docker-compose")],
        &[("__REMOTE_REL_BASE__", &remote_rel_base)],
    );

    let mut start_output_buffer = TextOutputBuffer::new(INSTALL_OUTPUT_CHUNK_BYTES, None, "");
    let result = ssh_exec_streaming(server, &up_cmd_v2, |chunk| {
        emit_buffered_output(app, "start", &mut start_output_buffer, chunk);
    })
    .await;
    match result {
        Ok(_) => {}
        Err(e) => {
            warn!(target: "shipyardx_lib::services::appstore", "docker compose v2 failed, falling back; server_id={} app_key={} version={} code={} message={} detail={:?}", server.id, req.app_key, req.version, e.code, e.message, e.detail);
            flush_buffered_output(app, "start", &mut start_output_buffer);
            let mut fallback_output_buffer = TextOutputBuffer::new(INSTALL_OUTPUT_CHUNK_BYTES, None, "");
            ssh_exec_streaming(server, &up_cmd_v1, |chunk| {
                emit_buffered_output(app, "start", &mut fallback_output_buffer, chunk);
            })
            .await
            .map_err(|e2| {
                warn!(target: "shipyardx_lib::services::appstore", "docker compose fallback failed; server_id={} app_key={} version={} primary_code={} fallback_code={}", server.id, req.app_key, req.version, e.code, e2.code);
                flush_buffered_output(app, "start", &mut fallback_output_buffer);
                emit_step(app, "start", "error", "容器启动失败");
                AppError::unavailable("appstore.compose_up_failed", "容器启动失败").with_detail(format!(
                    "docker compose: {}\ndocker-compose: {}",
                    e.detail.unwrap_or(e.message),
                    e2.detail.unwrap_or(e2.message)
                ))
            })?;
            flush_buffered_output(app, "start", &mut fallback_output_buffer);
        }
    };
    flush_buffered_output(app, "start", &mut start_output_buffer);
    emit_step(app, "start", "done", "容器服务已启动");
    info!(target: "shipyardx_lib::services::appstore", "app install completed; server_id={} app_key={} version={} install_id={}", server.id, req.app_key, req.version, install_id);

    Ok(())
}

/// 渲染 docker-compose 模板：将 ${VAR} 替换为实际值，网络替换为 shipyardx-network
fn render_compose(template: &str, env_values: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in env_values {
        let placeholder = format!("${{{}}}", key);
        result = result.replace(&placeholder, value);
    }
    // 将 1Panel 的 1panel-network 替换为 shipyardx-network
    result = result.replace("1panel-network", "shipyardx-network");
    result
}

/// 构建 .env 文件内容
fn build_env_file(env_values: &HashMap<String, String>) -> String {
    env_values
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

async fn measure_dir_size(path: &Path) -> AppResult<u64> {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let meta = fs::metadata(&current)
            .await
            .map_err(|e| AppError::internal("appstore.data_dir_stat_failed", "读取数据目录信息失败").with_source(e))?;
        if meta.is_file() {
            total = total.saturating_add(meta.len());
            continue;
        }

        let mut entries = fs::read_dir(&current)
            .await
            .map_err(|e| AppError::internal("appstore.data_dir_read_failed", "读取数据目录失败").with_source(e))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| AppError::internal("appstore.data_dir_entry_failed", "读取数据目录项失败").with_source(e))?
        {
            stack.push(entry.path());
        }
    }
    Ok(total)
}

async fn copy_data_dir_to_remote(
    app: &AppHandle,
    sftp: &SshSftpSession,
    local_dir: &Path,
    remote_dir: &str,
) -> AppResult<()> {
    debug!(target: "shipyardx_lib::services::appstore", "measuring data dir for upload; local_dir={} remote_dir={}", local_dir.display(), remote_dir);
    let total_bytes = measure_dir_size(local_dir).await.unwrap_or(0);
    let total_display = if total_bytes > 0 {
        format!(" / {}", format_bytes(total_bytes))
    } else {
        String::new()
    };
    emit_step(
        app,
        "deploy",
        "running",
        &format!("正在复制数据目录... 已上传 0 B{}", total_display),
    );
    let mut last_reported = 0u64;
    let uploaded = sftp
        .upload_dir_recursive(local_dir, remote_dir, |transferred| {
            if transferred < total_bytes && transferred.saturating_sub(last_reported) < DATA_UPLOAD_PROGRESS_BYTES {
                return;
            }
            last_reported = transferred;
            let message = if total_bytes > 0 {
                let percent = ((transferred as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0);
                format!(
                    "正在复制数据目录... 已上传 {} / {} ({percent:.0}%)",
                    format_bytes(transferred),
                    format_bytes(total_bytes)
                )
            } else {
                format!("正在复制数据目录... 已上传 {}", format_bytes(transferred))
            };
            emit_step(app, "deploy", "running", &message);
        })
        .await?;
    info!(target: "shipyardx_lib::services::appstore", "data dir uploaded; remote_dir={} bytes={}", remote_dir, uploaded);

    let done_message = if total_bytes > 0 {
        format!("数据目录复制完成，共 {}", format_bytes(total_bytes))
    } else {
        "数据目录复制完成".to_string()
    };
    emit_step(app, "deploy", "running", &done_message);
    Ok(())
}
