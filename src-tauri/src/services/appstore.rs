use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;
use tokio::fs;
use tokio::process::Command;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::app::appstore::{AppDetail, AppListItem, AppManifest, AppVersionInfo, InstallApp, VersionManifest};
use crate::models::app::events::InstallStepEvent;
use crate::models::app::server::ServerConfig;
use crate::ssh::exec::{ssh_exec_async, ssh_exec_streaming_async};

const APPSTORE_REPO_URL: &str = "https://github.com/1Panel-dev/appstore.git";

fn appstore_cache_dir(app: &AppHandle) -> PathBuf {
    let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
    data_dir.join("appstore_cache")
}

fn apps_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join("apps")
}

fn pick_description(desc: &crate::models::app::appstore::DescriptionI18n) -> String {
    if !desc.zh.is_empty() {
        return desc.zh.clone();
    }
    if !desc.en.is_empty() {
        return desc.en.clone();
    }
    String::new()
}

pub async fn sync_appstore(app: &AppHandle) -> AppResult<PathBuf> {
    let cache_dir = appstore_cache_dir(app);
    let git_dir = cache_dir.join(".git");

    if fs::try_exists(&git_dir).await.unwrap_or(false) {
        let output = Command::new("git")
            .args(["-C", cache_dir.to_str().unwrap()])
            .arg("pull")
            .arg("--ff-only")
            .output()
            .await
            .map_err(|e| AppError::internal("appstore.git_pull_spawn_failed", "执行 git pull 失败").with_source(e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("Not a git repository") || stderr.contains("error:") {
                let _ = fs::remove_dir_all(&cache_dir).await;
                return Box::pin(sync_appstore(app)).await;
            }
            return Err(
                AppError::unavailable("appstore.git_pull_failed", "同步应用商店失败").with_detail(stderr.trim())
            );
        }
    } else {
        let _ = fs::create_dir_all(&cache_dir).await;
        let output = Command::new("git")
            .args(["clone", "--depth", "1", APPSTORE_REPO_URL])
            .arg(cache_dir.to_str().unwrap())
            .output()
            .await
            .map_err(|e| AppError::internal("appstore.git_clone_spawn_failed", "执行 git clone 失败").with_source(e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(
                AppError::unavailable("appstore.git_clone_failed", "克隆应用商店失败").with_detail(stderr.trim())
            );
        }
    }

    Ok(cache_dir)
}

pub async fn list_apps(app: &AppHandle) -> AppResult<Vec<AppListItem>> {
    let cache_dir = appstore_cache_dir(app);
    let apps_dir = apps_dir(&cache_dir);

    if !fs::try_exists(&apps_dir).await.unwrap_or(false) {
        return Ok(vec![]);
    }

    let mut items: Vec<AppListItem> = Vec::new();

    let mut entries = fs::read_dir(&apps_dir)
        .await
        .map_err(|e| AppError::internal("appstore.apps_dir_read_failed", "读取 apps 目录失败").with_source(e))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::internal("appstore.apps_dir_entry_failed", "读取应用目录项失败").with_source(e))?
    {
        let app_dir = entry.path();
        if !entry
            .file_type()
            .await
            .map_err(|e| AppError::internal("appstore.apps_dir_entry_failed", "读取应用目录类型失败").with_source(e))?
            .is_dir()
        {
            continue;
        }

        let key = app_dir.file_name().unwrap().to_string_lossy().to_string();

        let data_yml = app_dir.join("data.yml");
        if !fs::try_exists(&data_yml).await.unwrap_or(false) {
            continue;
        }

        let yaml_str = fs::read_to_string(&data_yml).await.unwrap_or_default();
        let manifest: AppManifest = match serde_yaml::from_str(&yaml_str) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let logo_path = app_dir.join("logo.png");
        let icon = if fs::try_exists(&logo_path).await.unwrap_or(false) {
            let bytes = fs::read(&logo_path).await.unwrap_or_default();
            STANDARD.encode(&bytes)
        } else {
            String::new()
        };

        let mut versions: Vec<String> = Vec::new();
        if let Ok(mut version_entries) = fs::read_dir(&app_dir).await {
            while let Ok(Some(ver_entry)) = version_entries.next_entry().await {
                let ver_dir = ver_entry.path();
                let Ok(file_type) = ver_entry.file_type().await else {
                    continue;
                };
                if !file_type.is_dir() {
                    continue;
                }
                let ver_name = ver_entry.file_name().to_string_lossy().to_string();
                if ver_name == "latest" || fs::try_exists(ver_dir.join("docker-compose.yml")).await.unwrap_or(false) {
                    versions.push(ver_name);
                }
            }
        }

        items.push(AppListItem {
            key: key.clone(),
            name: manifest.additional.name.clone(),
            app_type: manifest.additional.app_type.clone(),
            tags: manifest.tags.clone(),
            description: pick_description(&manifest.additional.description),
            short_desc_zh: manifest.additional.short_desc_zh.clone(),
            short_desc_en: manifest.additional.short_desc_en.clone(),
            website: manifest.additional.website.clone().unwrap_or_default(),
            icon,
            versions,
        });
    }

    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(items)
}

pub async fn get_app_detail(app: &AppHandle, app_key: &str) -> AppResult<AppDetail> {
    let cache_dir = appstore_cache_dir(app);
    let app_dir = apps_dir(&cache_dir).join(app_key);

    if !fs::try_exists(&app_dir).await.unwrap_or(false) {
        return Err(AppError::not_found(
            "appstore.app_not_found",
            format!("应用 {} 不存在", app_key),
        ));
    }

    let data_yml = app_dir.join("data.yml");
    if !fs::try_exists(&data_yml).await.unwrap_or(false) {
        return Err(AppError::not_found(
            "appstore.manifest_not_found",
            format!("应用 {} 的 data.yml 不存在", app_key),
        ));
    }

    let yaml_str = fs::read_to_string(&data_yml)
        .await
        .map_err(|e| AppError::internal("appstore.manifest_read_failed", "读取 data.yml 失败").with_source(e))?;
    let manifest: AppManifest = serde_yaml::from_str(&yaml_str)
        .map_err(|e| AppError::internal("appstore.manifest_parse_failed", "解析 data.yml 失败").with_source(e))?;

    let logo_path = app_dir.join("logo.png");
    let icon = if fs::try_exists(&logo_path).await.unwrap_or(false) {
        let bytes = fs::read(&logo_path).await.unwrap_or_default();
        STANDARD.encode(&bytes)
    } else {
        String::new()
    };

    let readme_zh = fs::read_to_string(app_dir.join("README.md")).await.unwrap_or_default();
    let readme_en = fs::read_to_string(app_dir.join("README_en.md")).await.unwrap_or_default();

    let mut version_infos: Vec<AppVersionInfo> = Vec::new();
    if let Ok(mut entries) = fs::read_dir(&app_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let ver_dir = entry.path();
            let Ok(file_type) = entry.file_type().await else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }
            let ver_name = entry.file_name().to_string_lossy().to_string();

            let compose_path = ver_dir.join("docker-compose.yml");
            if !fs::try_exists(&compose_path).await.unwrap_or(false) {
                continue;
            }

            let compose_preview = fs::read_to_string(&compose_path).await.unwrap_or_default();

            let ver_data = ver_dir.join("data.yml");
            let form_fields = if fs::try_exists(&ver_data).await.unwrap_or(false) {
                let ver_yaml = fs::read_to_string(&ver_data).await.unwrap_or_default();
                match serde_yaml::from_str::<VersionManifest>(&ver_yaml) {
                    Ok(vm) => vm.additional.form_fields,
                    Err(_) => vec![],
                }
            } else {
                vec![]
            };

            version_infos.push(AppVersionInfo {
                version: ver_name,
                form_fields,
                compose_preview,
            });
        }
    }

    Ok(AppDetail {
        key: app_key.to_string(),
        name: manifest.additional.name.clone(),
        tags: manifest.tags.clone(),
        description: manifest.additional.description.clone(),
        short_desc_zh: manifest.additional.short_desc_zh,
        short_desc_en: manifest.additional.short_desc_en,
        website: manifest.additional.website.clone().unwrap_or_default(),
        github: manifest.additional.github.clone().unwrap_or_default(),
        document: manifest.additional.document.clone().unwrap_or_default(),
        icon,
        versions: version_infos,
        readme_zh,
        readme_en,
    })
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

fn emit_output(app: &AppHandle, step: &str, chunk: &str) {
    let _ = InstallStepEvent {
        step: step.to_string(),
        status: String::new(),
        message: String::new(),
        output_chunk: Some(chunk.to_string()),
    }
    .emit(app);
}

pub async fn install_app_inner(app: &AppHandle, server: &ServerConfig, req: &InstallApp) -> AppResult<()> {
    let cache_dir = appstore_cache_dir(app);
    let app_dir = apps_dir(&cache_dir).join(&req.app_key);
    let version_dir = app_dir.join(&req.version);

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

    // 注入 1Panel 标准变量：CONTAINER_NAME
    let mut env_values = req.env_values.clone();
    let container_name = format!("shipyardx-{}", &req.app_key);
    env_values
        .entry("CONTAINER_NAME".to_string())
        .or_insert_with(|| container_name);

    let rendered = render_compose(&compose_template, &env_values);
    emit_step(app, "prepare", "done", "部署模板准备完成");

    // Step 2: 部署文件
    emit_step(app, "deploy", "running", "正在部署文件到远程服务器...");
    let install_id = Uuid::new_v4().to_string();
    let remote_base = format!("$HOME/shipyardx/apps/{}", install_id);

    let compose_b64 = STANDARD.encode(rendered.as_bytes());
    let env_content = build_env_file(&env_values);
    let env_b64 = STANDARD.encode(env_content.as_bytes());

    // 使用双引号让 shell 展开 $HOME
    let setup_cmd = format!(
        "mkdir -p \"{0}\" && printf '%s' \"{1}\" | base64 -d > \"{0}/docker-compose.yml\" && printf '%s' \"{2}\" | base64 -d > \"{0}/.env\"",
        remote_base, compose_b64, env_b64
    );

    ssh_exec_streaming_async(server, &setup_cmd, |chunk| {
        emit_output(app, "deploy", chunk);
    })
    .await
    .map_err(|e| {
        emit_step(app, "deploy", "error", &format!("部署文件失败: {}", e));
        AppError::internal("appstore.deploy_files_failed", "部署文件失败").with_detail(e.detail.unwrap_or(e.message))
    })?;

    let local_data_dir = version_dir.join("data");
    let local_data_meta = fs::metadata(&local_data_dir).await.ok();
    if local_data_meta.as_ref().is_some_and(|meta| meta.is_dir()) {
        emit_step(app, "deploy", "running", "正在复制数据目录...");
        copy_data_dir_to_remote(server, &local_data_dir, &format!("{}/data", remote_base))
            .await
            .map_err(|e| {
                emit_step(app, "deploy", "error", &format!("复制数据失败: {}", e));
                e
            })?;
    }
    emit_step(app, "deploy", "done", "文件部署完成");

    // Step 3: 创建网络
    emit_step(app, "network", "running", "正在创建 Docker 网络...");
    let net_cmd = "docker network create shipyardx-network 2>/dev/null; true".to_string();
    let _ = ssh_exec_async(server, &net_cmd).await;
    emit_step(app, "network", "done", "Docker 网络就绪");

    // Step 4: 启动容器
    emit_step(app, "start", "running", "正在启动容器服务...");
    let up_cmd_v2 = format!(
        "cd \"{0}\" && docker compose -f docker-compose.yml up -d 2>&1",
        remote_base
    );
    let up_cmd_v1 = format!(
        "cd \"{0}\" && docker-compose -f docker-compose.yml up -d 2>&1",
        remote_base
    );

    let result = ssh_exec_streaming_async(server, &up_cmd_v2, |chunk| {
        emit_output(app, "start", chunk);
    })
    .await;
    match result {
        Ok(_) => {}
        Err(e) => {
            ssh_exec_streaming_async(server, &up_cmd_v1, |chunk| {
                emit_output(app, "start", chunk);
            })
            .await
            .map_err(|e2| {
                emit_step(app, "start", "error", "容器启动失败");
                AppError::unavailable("appstore.compose_up_failed", "容器启动失败").with_detail(format!(
                    "docker compose: {}\ndocker-compose: {}",
                    e.detail.unwrap_or(e.message),
                    e2.detail.unwrap_or(e2.message)
                ))
            })?;
        }
    };
    emit_step(app, "start", "done", "容器服务已启动");

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

async fn copy_data_dir_to_remote(server: &ServerConfig, local_dir: &Path, remote_dir: &str) -> AppResult<()> {
    let parent = local_dir.parent().unwrap_or(local_dir);
    let dir_name = local_dir.file_name().unwrap().to_str().unwrap();

    let mut tar_cmd = Command::new("tar");
    tar_cmd
        .arg("-czf")
        .arg("-")
        .arg("-C")
        .arg(parent.to_str().unwrap())
        .arg(dir_name);

    let output = tar_cmd
        .output()
        .await
        .map_err(|e| AppError::internal("appstore.tar_spawn_failed", "打包数据目录失败").with_source(e))?;
    let tar_b64 = STANDARD.encode(&output.stdout);

    let remote_parent = Path::new(remote_dir)
        .parent()
        .unwrap_or(Path::new(remote_dir))
        .display();

    let remote_cmd = format!(
        "mkdir -p \"{}\" && printf '%s' \"{}\" | base64 -d | tar -xzf - -C \"{}\"",
        remote_dir, tar_b64, remote_parent
    );

    ssh_exec_async(server, &remote_cmd).await?;
    Ok(())
}
