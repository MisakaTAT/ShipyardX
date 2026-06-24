use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::Utc;
use log::info;
use tauri::{AppHandle, Manager};
use tokio::fs;
use uuid::Uuid;

use crate::config::store::atomic_write;
use crate::dto::server::ServerConfig;
use crate::dto::templates::{AppTemplate, AppTemplateField, AppTemplateFile, AppTemplateInput, DeployTemplate};
use crate::error::{AppError, AppResult};
use crate::scripts::{
    APPSTORE_COMPOSE_UP_SH, APPSTORE_CREATE_NETWORK_SH, APPSTORE_DEPLOY_FILES_SH, render_shell, shell_quote,
};
use crate::services::appstore::{
    build_env_file, emit_buffered_output, emit_step, flush_buffered_output, render_compose,
};
use crate::ssh::exec::{ssh_exec, ssh_exec_streaming};
use crate::utils::output::TextOutputBuffer;

const LEGACY_TEMPLATES_FILE: &str = "app_templates.json";
const TEMPLATES_DIR: &str = "templates";
const TEMPLATE_INDEX_FILE: &str = "index.json";
const TEMPLATE_COMPOSE_FILE: &str = "docker-compose.yml";
const DEPLOY_OUTPUT_CHUNK_BYTES: usize = 4 * 1024;
const DEPLOY_OUTPUT_MAX_BYTES: usize = 256 * 1024;
const DEPLOY_OUTPUT_TRUNCATION_NOTICE: &str = "\n[输出已截断，后续部署日志已省略]\n";

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct AppTemplateIndexItem {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    directories: Vec<String>,
    #[serde(default)]
    files: Vec<AppTemplateFileIndexItem>,
    #[serde(default)]
    fields: Vec<AppTemplateField>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct AppTemplateFileIndexItem {
    path: String,
    #[serde(default)]
    executable: bool,
}

impl AppTemplateIndexItem {
    fn from_template(template: &AppTemplate) -> Self {
        Self {
            id: template.id.clone(),
            name: template.name.clone(),
            description: template.description.clone(),
            tags: template.tags.clone(),
            directories: template.directories.clone(),
            files: template
                .files
                .iter()
                .map(|file| AppTemplateFileIndexItem {
                    path: file.path.clone(),
                    executable: file.executable,
                })
                .collect(),
            fields: template.fields.clone(),
            created_at: template.created_at.clone(),
            updated_at: template.updated_at.clone(),
        }
    }
}

pub async fn list_templates(app: &AppHandle) -> AppResult<Vec<AppTemplate>> {
    let mut templates = load_templates(app).await?;
    templates.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(templates)
}

pub async fn create_template(app: &AppHandle, input: AppTemplateInput) -> AppResult<AppTemplate> {
    let mut templates = load_templates(app).await?;
    let now = Utc::now().to_rfc3339();
    let template = AppTemplate {
        id: Uuid::new_v4().to_string(),
        name: normalize_required(input.name, "templates.name_required", "模板名称不能为空")?,
        description: input.description.trim().to_string(),
        tags: normalize_tags(input.tags),
        compose: normalize_required(input.compose, "templates.compose_required", "Compose 内容不能为空")?,
        directories: normalize_directories(input.directories)?,
        files: normalize_files(input.files)?,
        fields: normalize_fields(input.fields),
        created_at: now.clone(),
        updated_at: now,
    };
    templates.push(template.clone());
    save_templates(app, &templates).await?;
    Ok(template)
}

pub async fn update_template(app: &AppHandle, template_id: String, input: AppTemplateInput) -> AppResult<AppTemplate> {
    let mut templates = load_templates(app).await?;
    let Some(existing) = templates.iter_mut().find(|template| template.id == template_id) else {
        return Err(AppError::not_found("templates.not_found", "模板不存在"));
    };

    existing.name = normalize_required(input.name, "templates.name_required", "模板名称不能为空")?;
    existing.description = input.description.trim().to_string();
    existing.tags = normalize_tags(input.tags);
    existing.compose = normalize_required(input.compose, "templates.compose_required", "Compose 内容不能为空")?;
    existing.directories = normalize_directories(input.directories)?;
    existing.files = normalize_files(input.files)?;
    existing.fields = normalize_fields(input.fields);
    existing.updated_at = Utc::now().to_rfc3339();
    let updated = existing.clone();
    save_templates(app, &templates).await?;
    Ok(updated)
}

pub async fn delete_template(app: &AppHandle, template_id: String) -> AppResult<()> {
    let mut templates = load_templates(app).await?;
    let before = templates.len();
    templates.retain(|template| template.id != template_id);
    if templates.len() == before {
        return Err(AppError::not_found("templates.not_found", "模板不存在"));
    }
    save_templates(app, &templates).await?;
    let dir = template_dir(app, &template_id)?;
    if fs::try_exists(&dir).await.unwrap_or(false) {
        fs::remove_dir_all(&dir)
            .await
            .map_err(|e| AppError::internal("templates.dir_remove_failed", "删除模板目录失败").with_source(e))?;
    }
    Ok(())
}

pub async fn extract_template_fields(compose: String) -> AppResult<Vec<AppTemplateField>> {
    let mut keys = BTreeSet::new();
    let bytes = compose.as_bytes();
    let mut i = 0usize;
    while i + 3 <= bytes.len() {
        if bytes[i] == b'$' && bytes[i + 1] == b'{' {
            let start = i + 2;
            if let Some(end_offset) = bytes[start..].iter().position(|b| *b == b'}') {
                let end = start + end_offset;
                let raw = &compose[start..end];
                let key = raw.split([':', '-', '?']).next().unwrap_or(raw).trim();
                if is_env_key(key) {
                    keys.insert(key.to_string());
                }
                i = end + 1;
                continue;
            }
        }
        i += 1;
    }

    Ok(keys
        .into_iter()
        .map(|key| AppTemplateField {
            label: key.replace('_', " ").to_ascii_lowercase(),
            env_key: key,
            default_value: String::new(),
            required: true,
            field_type: "text".to_string(),
        })
        .collect())
}

pub async fn import_template_file(file_path: String) -> AppResult<AppTemplateFile> {
    let path = std::path::PathBuf::from(&file_path);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::validation("templates.import_file_name_invalid", "文件名无效"))?
        .to_string();
    let bytes = fs::read(&path)
        .await
        .map_err(|e| AppError::internal("templates.import_file_read_failed", "读取导入文件失败").with_source(e))?;
    let content = String::from_utf8(bytes)
        .map_err(|e| AppError::validation("templates.import_file_not_text", "目前只支持导入文本文件").with_source(e))?;
    Ok(AppTemplateFile {
        path: normalize_template_path(&file_name, false)?,
        content,
        executable: false,
    })
}

pub async fn deploy_template_inner(app: &AppHandle, server: &ServerConfig, req: &DeployTemplate) -> AppResult<()> {
    let templates = load_templates(app).await?;
    let template = templates
        .into_iter()
        .find(|template| template.id == req.template_id)
        .ok_or_else(|| AppError::not_found("templates.not_found", "模板不存在"))?;

    let mut env_values = template
        .fields
        .iter()
        .filter_map(|field| {
            if field.default_value.is_empty() {
                None
            } else {
                Some((field.env_key.clone(), field.default_value.clone()))
            }
        })
        .collect::<HashMap<_, _>>();
    env_values.extend(req.env_values.clone());
    env_values
        .entry("CONTAINER_NAME".to_string())
        .or_insert_with(|| format!("shipyardx-template-{}", short_id(&template.id)));

    info!(target: "shipyardx_lib::services::templates", "deploying template; server_id={} template_id={} env_keys={}", server.id, template.id, env_values.len());

    emit_step(app, "prepare", "running", "正在准备模板...");
    let rendered = render_compose(&template.compose, &env_values);
    let rendered_files = template
        .files
        .iter()
        .map(|file| AppTemplateFile {
            path: file.path.clone(),
            content: render_compose(&file.content, &env_values),
            executable: file.executable,
        })
        .collect::<Vec<_>>();
    emit_step(app, "prepare", "done", "模板准备完成");

    emit_step(app, "deploy", "running", "正在部署文件到远程服务器...");
    let install_id = Uuid::new_v4().to_string();
    let remote_rel_base = format!("shipyardx/templates/{}", install_id);
    let compose_b64 = STANDARD.encode(rendered.as_bytes());
    let env_content = build_env_file(&env_values);
    let env_b64 = STANDARD.encode(env_content.as_bytes());
    let mut setup_cmd = render_shell(
        APPSTORE_DEPLOY_FILES_SH,
        &[("__COMPOSE_B64__", &compose_b64), ("__ENV_B64__", &env_b64)],
        &[("__REMOTE_REL_BASE__", &remote_rel_base)],
    );
    let extra_files_cmd = render_template_files_script(&remote_rel_base, &template.directories, &rendered_files);
    if !extra_files_cmd.is_empty() {
        setup_cmd.push_str(" && ");
        setup_cmd.push_str(&extra_files_cmd);
    }

    let mut deploy_output_buffer = TextOutputBuffer::new(
        DEPLOY_OUTPUT_CHUNK_BYTES,
        Some(DEPLOY_OUTPUT_MAX_BYTES),
        DEPLOY_OUTPUT_TRUNCATION_NOTICE,
    );
    ssh_exec_streaming(server, &setup_cmd, |chunk| {
        emit_buffered_output(app, "deploy", &mut deploy_output_buffer, chunk);
    })
    .await
    .map_err(|e| {
        flush_buffered_output(app, "deploy", &mut deploy_output_buffer);
        emit_step(app, "deploy", "error", &format!("部署文件失败: {}", e));
        AppError::internal("templates.deploy_files_failed", "部署文件失败").with_detail(e.detail.unwrap_or(e.message))
    })?;
    flush_buffered_output(app, "deploy", &mut deploy_output_buffer);
    emit_step(app, "deploy", "done", "文件部署完成");

    emit_step(app, "network", "running", "正在创建 Docker 网络...");
    let _ = ssh_exec(server, APPSTORE_CREATE_NETWORK_SH).await;
    emit_step(app, "network", "done", "Docker 网络就绪");

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
    let mut start_output_buffer = TextOutputBuffer::new(
        DEPLOY_OUTPUT_CHUNK_BYTES,
        Some(DEPLOY_OUTPUT_MAX_BYTES),
        DEPLOY_OUTPUT_TRUNCATION_NOTICE,
    );
    let result = ssh_exec_streaming(server, &up_cmd_v2, |chunk| {
        emit_buffered_output(app, "start", &mut start_output_buffer, chunk);
    })
    .await;
    if let Err(primary) = result {
        flush_buffered_output(app, "start", &mut start_output_buffer);
        let mut fallback_output_buffer = TextOutputBuffer::new(
            DEPLOY_OUTPUT_CHUNK_BYTES,
            Some(DEPLOY_OUTPUT_MAX_BYTES),
            DEPLOY_OUTPUT_TRUNCATION_NOTICE,
        );
        ssh_exec_streaming(server, &up_cmd_v1, |chunk| {
            emit_buffered_output(app, "start", &mut fallback_output_buffer, chunk);
        })
        .await
        .map_err(|fallback| {
            flush_buffered_output(app, "start", &mut fallback_output_buffer);
            emit_step(app, "start", "error", "容器启动失败");
            AppError::unavailable("templates.compose_up_failed", "容器启动失败").with_detail(format!(
                "docker compose: {}\ndocker-compose: {}",
                primary.detail.unwrap_or(primary.message),
                fallback.detail.unwrap_or(fallback.message)
            ))
        })?;
        flush_buffered_output(app, "start", &mut fallback_output_buffer);
    }
    flush_buffered_output(app, "start", &mut start_output_buffer);
    emit_step(app, "start", "done", "容器服务已启动");
    info!(target: "shipyardx_lib::services::templates", "template deploy completed; server_id={} template_id={} install_id={}", server.id, template.id, install_id);

    Ok(())
}

async fn load_templates(app: &AppHandle) -> AppResult<Vec<AppTemplate>> {
    migrate_legacy_templates(app).await?;
    let index_path = templates_index_file(app)?;
    if !fs::try_exists(&index_path).await.unwrap_or(false) {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&index_path)
        .await
        .map_err(|e| AppError::internal("templates.read_failed", "读取应用模板失败").with_source(e))?;
    if raw.trim().is_empty() {
        return Ok(vec![]);
    }
    let index = serde_json::from_str::<Vec<AppTemplateIndexItem>>(&raw)
        .map_err(|e| AppError::internal("templates.parse_failed", "解析应用模板索引失败").with_source(e))?;
    let mut templates = Vec::new();
    for item in index {
        let dir = template_dir(app, &item.id)?;
        let compose = fs::read_to_string(dir.join(TEMPLATE_COMPOSE_FILE))
            .await
            .unwrap_or_default();
        let mut files = Vec::new();
        for file in item.files {
            let content = read_template_file_content(&dir, &file.path).await.unwrap_or_default();
            files.push(AppTemplateFile {
                path: file.path,
                content,
                executable: file.executable,
            });
        }
        templates.push(AppTemplate {
            id: item.id,
            name: item.name,
            description: item.description,
            tags: item.tags,
            compose,
            directories: item.directories,
            files,
            fields: item.fields,
            created_at: item.created_at,
            updated_at: item.updated_at,
        });
    }
    Ok(templates)
}

async fn save_templates(app: &AppHandle, templates: &[AppTemplate]) -> AppResult<()> {
    let root = templates_root_dir(app)?;
    fs::create_dir_all(&root)
        .await
        .map_err(|e| AppError::internal("templates.root_create_failed", "创建模板目录失败").with_source(e))?;
    let mut index = Vec::new();
    for template in templates {
        save_template_files(app, template).await?;
        index.push(AppTemplateIndexItem::from_template(template));
    }
    let path = templates_index_file(app)?;
    let payload = serde_json::to_vec_pretty(&index)
        .map_err(|e| AppError::internal("templates.serialize_failed", "序列化应用模板索引失败").with_source(e))?;
    tokio::task::spawn_blocking(move || atomic_write(&path, &payload))
        .await
        .map_err(|e| AppError::internal("templates.write_join_failed", "写入应用模板失败").with_source(e))?
}

async fn save_template_files(app: &AppHandle, template: &AppTemplate) -> AppResult<()> {
    let dir = template_dir(app, &template.id)?;
    if fs::try_exists(&dir).await.unwrap_or(false) {
        fs::remove_dir_all(&dir)
            .await
            .map_err(|e| AppError::internal("templates.dir_clear_failed", "清理模板目录失败").with_source(e))?;
    }
    fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::internal("templates.dir_create_failed", "创建模板目录失败").with_source(e))?;
    fs::write(dir.join(TEMPLATE_COMPOSE_FILE), template.compose.as_bytes())
        .await
        .map_err(|e| AppError::internal("templates.compose_write_failed", "写入模板 Compose 失败").with_source(e))?;
    for directory in &template.directories {
        fs::create_dir_all(template_file_path(&dir, directory))
            .await
            .map_err(|e| {
                AppError::internal("templates.directory_create_failed", "创建模板子目录失败").with_source(e)
            })?;
    }
    for file in &template.files {
        let path = template_file_path(&dir, &file.path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                AppError::internal("templates.file_parent_create_failed", "创建模板文件目录失败").with_source(e)
            })?;
        }
        fs::write(&path, file.content.as_bytes())
            .await
            .map_err(|e| AppError::internal("templates.file_write_failed", "写入模板文件失败").with_source(e))?;
    }
    Ok(())
}

async fn migrate_legacy_templates(app: &AppHandle) -> AppResult<()> {
    let index_path = templates_index_file(app)?;
    if fs::try_exists(&index_path).await.unwrap_or(false) {
        return Ok(());
    }
    let legacy_path = legacy_templates_file(app)?;
    if !fs::try_exists(&legacy_path).await.unwrap_or(false) {
        return Ok(());
    }
    let raw = fs::read_to_string(&legacy_path)
        .await
        .map_err(|e| AppError::internal("templates.legacy_read_failed", "读取旧模板文件失败").with_source(e))?;
    if raw.trim().is_empty() {
        return Ok(());
    }
    let templates = serde_json::from_str::<Vec<AppTemplate>>(&raw)
        .map_err(|e| AppError::internal("templates.legacy_parse_failed", "解析旧模板文件失败").with_source(e))?;
    save_templates(app, &templates).await
}

fn templates_root_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal("templates.data_dir_unavailable", "无法获取应用数据目录").with_source(e))?;
    Ok(data_dir.join(TEMPLATES_DIR))
}

fn templates_index_file(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(templates_root_dir(app)?.join(TEMPLATE_INDEX_FILE))
}

fn legacy_templates_file(app: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal("templates.data_dir_unavailable", "无法获取应用数据目录").with_source(e))?;
    Ok(data_dir.join(LEGACY_TEMPLATES_FILE))
}

fn template_dir(app: &AppHandle, template_id: &str) -> AppResult<PathBuf> {
    Ok(templates_root_dir(app)?.join(template_id))
}

fn template_file_path(template_dir: &Path, relative_path: &str) -> PathBuf {
    template_dir.join(relative_path)
}

async fn read_template_file_content(template_dir: &Path, relative_path: &str) -> AppResult<String> {
    let path = template_file_path(template_dir, relative_path);
    if fs::try_exists(&path).await.unwrap_or(false) {
        return fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::internal("templates.file_read_failed", "读取模板文件失败").with_source(e));
    }
    let legacy_path = template_dir.join("files").join(relative_path);
    fs::read_to_string(&legacy_path)
        .await
        .map_err(|e| AppError::internal("templates.file_read_failed", "读取模板文件失败").with_source(e))
}

fn normalize_required(value: String, code: &'static str, message: &'static str) -> AppResult<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::validation(code, message));
    }
    Ok(trimmed)
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    tags.into_iter()
        .flat_map(|tag| tag.split(',').map(str::to_string).collect::<Vec<_>>())
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .filter(|tag| seen.insert(tag.clone()))
        .collect()
}

fn normalize_fields(fields: Vec<AppTemplateField>) -> Vec<AppTemplateField> {
    let mut seen = BTreeSet::new();
    fields
        .into_iter()
        .map(|field| AppTemplateField {
            env_key: field.env_key.trim().to_string(),
            label: field.label.trim().to_string(),
            default_value: field.default_value,
            required: field.required,
            field_type: if field.field_type.trim().is_empty() {
                "text".to_string()
            } else {
                field.field_type.trim().to_string()
            },
        })
        .filter(|field| is_env_key(&field.env_key))
        .map(|mut field| {
            if field.label.is_empty() {
                field.label = field.env_key.clone();
            }
            field
        })
        .filter(|field| seen.insert(field.env_key.clone()))
        .collect()
}

fn normalize_files(files: Vec<AppTemplateFile>) -> AppResult<Vec<AppTemplateFile>> {
    let mut seen = BTreeSet::new();
    let mut normalized = Vec::new();
    for file in files {
        let path = normalize_template_path(&file.path, false)?;
        if !seen.insert(path.clone()) {
            return Err(AppError::conflict(
                "templates.file_path_duplicate",
                format!("文件路径重复: {path}"),
            ));
        }
        normalized.push(AppTemplateFile {
            path,
            content: file.content,
            executable: file.executable,
        });
    }
    Ok(normalized)
}

fn normalize_directories(directories: Vec<String>) -> AppResult<Vec<String>> {
    let mut seen = BTreeSet::new();
    let mut normalized = Vec::new();
    for directory in directories {
        let path = normalize_template_path(&directory, true)?;
        if seen.insert(path.clone()) {
            normalized.push(path);
        }
    }
    Ok(normalized)
}

fn normalize_template_path(path: &str, directory: bool) -> AppResult<String> {
    let normalized = path.trim().replace('\\', "/");
    if normalized.is_empty() {
        return Err(AppError::validation("templates.path_required", "路径不能为空"));
    }
    if normalized.starts_with('/') || normalized.starts_with('~') {
        return Err(AppError::validation("templates.path_invalid", "路径必须是相对路径"));
    }
    let trimmed = normalized.trim_end_matches('/').to_string();
    if !directory && (trimmed == "docker-compose.yml" || trimmed == ".env" || trimmed == TEMPLATE_INDEX_FILE) {
        return Err(AppError::validation(
            "templates.file_path_reserved",
            format!("{} 是保留文件名", trimmed),
        ));
    }
    let mut parts = Vec::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return Err(AppError::validation(
                "templates.path_invalid",
                format!("路径无效: {trimmed}"),
            ));
        }
        parts.push(part);
    }
    Ok(parts.join("/"))
}

fn render_template_files_script(remote_rel_base: &str, directories: &[String], files: &[AppTemplateFile]) -> String {
    let directory_cmds = directories.iter().map(|directory| {
        let base = shell_quote(remote_rel_base);
        let directory = shell_quote(directory);
        format!("mkdir -p \"$HOME\"/{base}/{directory}")
    });
    let file_cmds = files
        .iter()
        .map(|file| {
            let path = shell_quote(&file.path);
            let parent = std::path::Path::new(&file.path)
                .parent()
                .and_then(|p| p.to_str())
                .filter(|p| !p.is_empty())
                .unwrap_or(".");
            let parent = shell_quote(parent);
            let base = shell_quote(remote_rel_base);
            let content_b64 = STANDARD.encode(file.content.as_bytes());
            let chmod = if file.executable {
                format!(" && chmod +x \"$HOME\"/{base}/{path}")
            } else {
                String::new()
            };
            format!(
                "mkdir -p \"$HOME\"/{base}/{parent} && printf '%s' \"{content_b64}\" | base64 -d > \"$HOME\"/{base}/{path}{chmod}"
            )
        });
    directory_cmds.chain(file_cmds).collect::<Vec<_>>().join(" && ")
}

fn is_env_key(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first == '_' || first.is_ascii_alphabetic()) && chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

fn short_id(value: &str) -> String {
    value.chars().filter(|ch| ch.is_ascii_alphanumeric()).take(8).collect()
}
