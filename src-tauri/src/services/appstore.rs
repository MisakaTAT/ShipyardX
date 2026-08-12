use log::{debug, info, warn};
use std::collections::{BTreeMap, HashMap};
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
                .ok_or_else(|| AppError::not_found("appstore.source_not_found").param("source_id", source_id))?;
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
    AppstoreRepo::ensure_safe_component("appstore.app_key_invalid", app_key)?;
    let repo = match source_id {
        Some(source_id) => {
            let settings = AppstoreRepo::new(app)?.load_settings().await?;
            let source = settings
                .sources
                .into_iter()
                .find(|source| source.id == source_id)
                .ok_or_else(|| AppError::not_found("appstore.source_not_found").param("source_id", source_id))?;
            AppstoreRepo::with_source(app, source)?
        }
        None => AppstoreRepo::new(app)?,
    };
    let detail = repo.get_app_detail(app_key).await?;
    info!(target: "shipyardx_lib::services::appstore", "fetched app detail; app_key={} versions={}", app_key, detail.versions.len());
    Ok(detail)
}

fn emit_step(app: &AppHandle, step: &str, status: &str, message_code: &str) {
    emit_step_with(app, step, status, message_code, BTreeMap::new());
}

/// 带插值参数的版本，例如上传进度里的字节数
fn emit_step_with(app: &AppHandle, step: &str, status: &str, message_code: &str, params: BTreeMap<String, String>) {
    let _ = InstallStepEvent {
        step: step.to_string(),
        status: status.to_string(),
        message_code: message_code.to_string(),
        params,
        output_chunk: None,
    }
    .emit(app);
}

fn step_params<const N: usize>(pairs: [(&str, String); N]) -> BTreeMap<String, String> {
    pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect()
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
        message_code: String::new(),
        params: BTreeMap::new(),
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
    AppstoreRepo::ensure_safe_component("appstore.app_key_invalid", &req.app_key)?;
    AppstoreRepo::ensure_safe_component("appstore.version_invalid", &req.version)?;
    let repo = AppstoreRepo::new(app)?;
    let version_dir = repo.version_dir(&req.app_key, &req.version);

    if !fs::try_exists(&version_dir).await.unwrap_or(false) {
        return Err(AppError::not_found("appstore.version_not_found")
            .param("app", &req.app_key)
            .param("version", &req.version)
            .with_detail(format!("app_key={}, version={}", req.app_key, req.version)));
    }

    // Step 1: 准备模板
    emit_step(app, "prepare", "running", "install.prepare_running");
    validate_env_values(&req.env_values).inspect_err(|_| {
        emit_step(app, "prepare", "error", "install.env_validate_failed");
    })?;
    let compose_template = fs::read_to_string(version_dir.join("docker-compose.yml"))
        .await
        .map_err(|e| {
            emit_step(app, "prepare", "error", "install.template_read_failed");
            AppError::internal("appstore.compose_template_read_failed").with_source(e)
        })?;

    let rendered = render_compose(&compose_template, &req.env_values).inspect_err(|_| {
        emit_step(app, "prepare", "error", "install.template_render_failed");
    })?;
    debug!(target: "shipyardx_lib::services::appstore", "app compose rendered; server_id={} app_key={} version={} env_keys={}", server.id, req.app_key, req.version, req.env_values.len());
    emit_step(app, "prepare", "done", "install.prepare_done");

    // Step 2: 部署文件
    emit_step(app, "deploy", "running", "install.deploy_running");
    let install_id = Uuid::new_v4().to_string();
    let remote_rel_base = format!("shipyardx/apps/{}", install_id);
    info!(target: "shipyardx_lib::services::appstore", "deploying app files; server_id={} app_key={} version={} install_id={}", server.id, req.app_key, req.version, install_id);

    let env_content = build_env_file(&req.env_values);
    let sftp = SshSftpSession::connect(server).await.map_err(|e| {
        emit_step(app, "deploy", "error", "install.sftp_connect_failed");
        e
    })?;
    let remote_base_dir = sftp.home_path(&remote_rel_base);
    sftp.create_dir_all(&remote_base_dir).await.map_err(|e| {
        emit_step(app, "deploy", "error", "install.remote_mkdir_failed");
        e
    })?;
    sftp.upload_bytes(&format!("{}/docker-compose.yml", remote_base_dir), rendered.as_bytes())
        .await
        .map_err(|e| {
            emit_step(app, "deploy", "error", "install.compose_upload_failed");
            e
        })?;
    sftp.upload_bytes(&format!("{}/.env", remote_base_dir), env_content.as_bytes())
        .await
        .map_err(|e| {
            emit_step(app, "deploy", "error", "install.env_upload_failed");
            e
        })?;

    let local_data_dir = version_dir.join("data");
    let local_data_meta = fs::metadata(&local_data_dir).await.ok();
    if local_data_meta.as_ref().is_some_and(|meta| meta.is_dir()) {
        info!(target: "shipyardx_lib::services::appstore", "copying app data dir; server_id={} app_key={} version={}", server.id, req.app_key, req.version);
        emit_step(app, "deploy", "running", "install.data_copy_running");
        copy_data_dir_to_remote(app, &sftp, &local_data_dir, &format!("{}/data", remote_base_dir))
            .await
            .map_err(|e| {
                emit_step(app, "deploy", "error", "install.data_copy_failed");
                e
            })?;
    }
    emit_step(app, "deploy", "done", "install.deploy_done");
    info!(target: "shipyardx_lib::services::appstore", "app files deployed; server_id={} app_key={} version={} install_id={}", server.id, req.app_key, req.version, install_id);

    // Step 3: 创建网络
    emit_step(app, "network", "running", "install.network_running");
    let net_cmd = APPSTORE_CREATE_NETWORK_SH.to_string();
    let _ = ssh_exec(server, &net_cmd).await;
    emit_step(app, "network", "done", "install.network_done");
    info!(target: "shipyardx_lib::services::appstore", "app network ensured; server_id={} app_key={} version={}", server.id, req.app_key, req.version);

    // Step 4: 启动容器
    emit_step(app, "start", "running", "install.start_running");
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
            warn!(target: "shipyardx_lib::services::appstore", "docker compose v2 failed, falling back; server_id={} app_key={} version={} code={} message={} detail={:?}", server.id, req.app_key, req.version, e.code, e, e.detail);
            flush_buffered_output(app, "start", &mut start_output_buffer);
            let mut fallback_output_buffer = TextOutputBuffer::new(INSTALL_OUTPUT_CHUNK_BYTES, None, "");
            ssh_exec_streaming(server, &up_cmd_v1, |chunk| {
                emit_buffered_output(app, "start", &mut fallback_output_buffer, chunk);
            })
            .await
            .map_err(|e2| {
                warn!(target: "shipyardx_lib::services::appstore", "docker compose fallback failed; server_id={} app_key={} version={} primary_code={} fallback_code={}", server.id, req.app_key, req.version, e.code, e2.code);
                flush_buffered_output(app, "start", &mut fallback_output_buffer);
                emit_step(app, "start", "error", "install.start_failed");
                AppError::unavailable("appstore.compose_up_failed").with_detail(format!(
                    "docker compose: {}\ndocker-compose: {}",
                    e.detail.unwrap_or(e.code),
                    e2.detail.unwrap_or(e2.code)
                ))
            })?;
            flush_buffered_output(app, "start", &mut fallback_output_buffer);
        }
    };
    flush_buffered_output(app, "start", &mut start_output_buffer);
    emit_step(app, "start", "done", "install.start_done");
    info!(target: "shipyardx_lib::services::appstore", "app install completed; server_id={} app_key={} version={} install_id={}", server.id, req.app_key, req.version, install_id);

    Ok(())
}

fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_alphabetic() || first == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// 变量值会写进 docker-compose.yml 和 .env，换行会被当成新的配置项
fn validate_env_values(env_values: &HashMap<String, String>) -> AppResult<()> {
    for (key, value) in env_values {
        if !is_valid_env_key(key) {
            return Err(AppError::validation("appstore.env_key_invalid").param("key", key));
        }
        if let Some(bad) = value
            .chars()
            .find(|c| *c == '\n' || *c == '\r' || (c.is_control() && *c != '\t'))
        {
            return Err(AppError::validation("appstore.env_value_invalid")
                .param("key", key)
                .with_detail(format!("U+{:04X}", bad as u32)));
        }
    }
    Ok(())
}

/// 渲染 docker-compose 模板：将 ${VAR} 替换为实际值
fn render_compose(template: &str, env_values: &HashMap<String, String>) -> AppResult<String> {
    let mut result = template.to_string();
    for (key, value) in env_values {
        let placeholder = format!("${{{}}}", key);
        result = result.replace(&placeholder, value);
    }
    // 渲染结果必须仍是合法 YAML
    serde_yaml::from_str::<serde_yaml::Value>(&result)
        .map_err(|e| AppError::validation("appstore.compose_render_invalid").with_detail(e.to_string()))?;
    Ok(result)
}

/// .env 只支持单行 KEY=VALUE；`$` 会被 compose 当作插值，`$$` 才是字面量
fn quote_env_value(value: &str) -> String {
    let escaped = value.replace('$', "$$");
    let needs_quotes = escaped.is_empty()
        || escaped
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '"' | '\'' | '#' | '\\' | '`'));
    if !needs_quotes {
        return escaped;
    }
    format!("\"{}\"", escaped.replace('\\', r"\\").replace('"', "\\\""))
}

/// 构建 .env 文件内容
fn build_env_file(env_values: &HashMap<String, String>) -> String {
    let mut lines: Vec<String> = env_values
        .iter()
        .map(|(key, value)| format!("{}={}", key, quote_env_value(value)))
        .collect();
    lines.sort();
    lines.join("\n")
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
            .map_err(|e| AppError::internal("appstore.data_dir_stat_failed").with_source(e))?;
        if meta.is_file() {
            total = total.saturating_add(meta.len());
            continue;
        }

        let mut entries = fs::read_dir(&current)
            .await
            .map_err(|e| AppError::internal("appstore.data_dir_read_failed").with_source(e))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| AppError::internal("appstore.data_dir_entry_failed").with_source(e))?
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
    emit_step_with(
        app,
        "deploy",
        "running",
        if total_bytes > 0 {
            "install.data_copy_progress"
        } else {
            "install.data_copy_progress_unknown"
        },
        step_params([
            ("transferred", format_bytes(0)),
            ("total", format_bytes(total_bytes)),
            ("percent", "0".to_string()),
        ]),
    );
    let mut last_reported = 0u64;
    let uploaded = sftp
        .upload_dir_recursive(local_dir, remote_dir, |transferred| {
            if transferred < total_bytes && transferred.saturating_sub(last_reported) < DATA_UPLOAD_PROGRESS_BYTES {
                return;
            }
            last_reported = transferred;
            let percent = if total_bytes > 0 {
                ((transferred as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            emit_step_with(
                app,
                "deploy",
                "running",
                if total_bytes > 0 {
                    "install.data_copy_progress"
                } else {
                    "install.data_copy_progress_unknown"
                },
                step_params([
                    ("transferred", format_bytes(transferred)),
                    ("total", format_bytes(total_bytes)),
                    ("percent", format!("{percent:.0}")),
                ]),
            );
        })
        .await?;
    info!(target: "shipyardx_lib::services::appstore", "data dir uploaded; remote_dir={} bytes={}", remote_dir, uploaded);

    emit_step_with(
        app,
        "deploy",
        "running",
        if total_bytes > 0 {
            "install.data_copy_done"
        } else {
            "install.data_copy_done_unknown"
        },
        step_params([("total", format_bytes(total_bytes))]),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn rejects_newlines_in_env_values() {
        let values = env(&[("PORT", "8080\n    privileged: true")]);
        let error = validate_env_values(&values).expect_err("值里的换行必须被拒绝");
        assert_eq!(error.code, "appstore.env_value_invalid");
    }

    #[test]
    fn rejects_invalid_env_keys() {
        assert!(validate_env_values(&env(&[("1PORT", "80")])).is_err());
        assert!(validate_env_values(&env(&[("PORT-A", "80")])).is_err());
        assert!(validate_env_values(&env(&[("_PORT_A1", "80")])).is_ok());
    }

    #[test]
    fn renders_compose_with_substituted_values() {
        let template = "services:\n  web:\n    image: nginx\n    ports:\n      - \"${PORT}:80\"\n";
        let rendered = render_compose(template, &env(&[("PORT", "8080")])).expect("模板应渲染成功");
        assert!(rendered.contains("\"8080:80\""));
    }

    #[test]
    fn rejects_values_that_break_compose_structure() {
        let template = "services:\n  web:\n    image: ${IMAGE}\n";
        let error = render_compose(template, &env(&[("IMAGE", "nginx: latest: broken")]))
            .expect_err("破坏 YAML 结构的值必须被拒绝");
        assert_eq!(error.code, "appstore.compose_render_invalid");
    }

    #[test]
    fn quotes_env_values_that_need_it() {
        assert_eq!(quote_env_value("simple"), "simple");
        assert_eq!(quote_env_value("with space"), "\"with space\"");
        assert_eq!(quote_env_value("say \"hi\""), "\"say \\\"hi\\\"\"");
    }

    #[test]
    fn escapes_dollar_without_adding_quotes() {
        // $$ 才是 compose 里的字面量 $，值本身不含空白或元字符时无需加引号
        assert_eq!(quote_env_value("p@ss$word"), "p@ss$$word");
        assert_eq!(quote_env_value("a $b c"), "\"a $$b c\"");
    }

    #[test]
    fn builds_env_file_deterministically() {
        let values = env(&[("B_KEY", "2"), ("A_KEY", "1")]);
        assert_eq!(build_env_file(&values), "A_KEY=1\nB_KEY=2");
    }
}
