use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::app::appstore::{
    AppDetail, AppListItem, AppManifest, AppVersionInfo, InstallAppRequest, InstalledApp, VersionManifest,
};
use crate::models::app::server::ServerConfig;
use crate::ssh::exec::ssh_exec;

const APPSTORE_REPO_URL: &str = "https://github.com/1Panel-dev/appstore.git";
const INSTALLED_APPS_FILE: &str = "installed_apps.json";

fn appstore_cache_dir(app: &AppHandle) -> PathBuf {
    let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
    data_dir.join("appstore_cache")
}

fn installed_apps_path(app: &AppHandle) -> PathBuf {
    let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
    data_dir.join(INSTALLED_APPS_FILE)
}

fn apps_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join("apps")
}

/// 解析描述 i18n 的 JSON 对象，优先取中文
fn pick_description(desc: &crate::models::app::appstore::DescriptionI18n) -> String {
    if !desc.zh.is_empty() {
        return desc.zh.clone();
    }
    if !desc.en.is_empty() {
        return desc.en.clone();
    }
    String::new()
}

/// 同步 App Store：如果本地未克隆则 clone，否则 git pull
pub fn sync_appstore(app: &AppHandle) -> Result<PathBuf, String> {
    let cache_dir = appstore_cache_dir(app);
    let git_dir = cache_dir.join(".git");

    if git_dir.exists() {
        let output = std::process::Command::new("git")
            .args(["-C", cache_dir.to_str().unwrap()])
            .arg("pull")
            .arg("--ff-only")
            .output()
            .map_err(|e| format!("git pull 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("Not a git repository") || stderr.contains("error:") {
                let _ = fs::remove_dir_all(&cache_dir);
                return sync_appstore(app);
            }
            return Err(format!("git pull 失败: {}", stderr.trim()));
        }
    } else {
        let _ = fs::create_dir_all(&cache_dir);
        let output = std::process::Command::new("git")
            .args(["clone", "--depth", "1", APPSTORE_REPO_URL])
            .arg(cache_dir.to_str().unwrap())
            .output()
            .map_err(|e| format!("git clone 失败: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("克隆应用商店失败: {}", stderr.trim()));
        }
    }

    Ok(cache_dir)
}

/// 加载所有已安装应用（公开版本，用于命令层获取安装记录）
pub fn load_installed_for_handle(app: &AppHandle) -> Vec<InstalledApp> {
    let path = installed_apps_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn load_installed(app: &AppHandle) -> Vec<InstalledApp> {
    load_installed_for_handle(app)
}

/// 保存已安装应用列表
fn save_installed(app: &AppHandle, apps: &[InstalledApp]) -> Result<(), String> {
    let path = installed_apps_path(app);
    let json = serde_json::to_string_pretty(apps).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// 列出所有应用商店中的 App（传给前端）
pub fn list_apps(app: &AppHandle) -> Result<Vec<AppListItem>, String> {
    let cache_dir = appstore_cache_dir(app);
    let apps_dir = apps_dir(&cache_dir);

    if !apps_dir.exists() {
        return Ok(vec![]);
    }

    let installed = load_installed(app);
    let installed_keys: std::collections::HashSet<String> =
        installed.iter().map(|a| a.app_key.clone()).collect();

    let mut items: Vec<AppListItem> = Vec::new();

    for entry in fs::read_dir(&apps_dir).map_err(|e| format!("读取 apps 目录失败: {}", e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let app_dir = entry.path();
        if !app_dir.is_dir() {
            continue;
        }

        let key = app_dir.file_name().unwrap().to_string_lossy().to_string();

        let data_yml = app_dir.join("data.yml");
        if !data_yml.exists() {
            continue;
        }

        let yaml_str = fs::read_to_string(&data_yml).unwrap_or_default();
        let manifest: AppManifest = match serde_yaml::from_str(&yaml_str) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let logo_path = app_dir.join("logo.png");
        let icon = if logo_path.exists() {
            let bytes = fs::read(&logo_path).unwrap_or_default();
            STANDARD.encode(&bytes)
        } else {
            String::new()
        };

        let mut versions: Vec<String> = Vec::new();
        if let Ok(entries) = fs::read_dir(&app_dir) {
            for ver_entry in entries.flatten() {
                let ver_dir = ver_entry.path();
                if !ver_dir.is_dir() {
                    continue;
                }
                let ver_name = ver_entry.file_name().to_string_lossy().to_string();
                if ver_name == "latest" || ver_dir.join("docker-compose.yml").exists() {
                    versions.push(ver_name);
                }
            }
        }

        items.push(AppListItem {
            key: key.clone(),
            name: manifest.additional.name.clone(),
            app_type: manifest.additional.app_type.clone(),
            tags: manifest.additional.tags.clone(),
            description: pick_description(&manifest.additional.description),
            short_desc_zh: manifest.additional.short_desc_zh.clone(),
            short_desc_en: manifest.additional.short_desc_en.clone(),
            website: manifest.additional.website.clone().unwrap_or_default(),
            icon,
            installed: installed_keys.contains(&key),
            versions,
        });
    }

    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(items)
}

/// 获取应用详情
pub fn get_app_detail(app: &AppHandle, app_key: &str) -> Result<AppDetail, String> {
    let cache_dir = appstore_cache_dir(app);
    let app_dir = apps_dir(&cache_dir).join(app_key);

    if !app_dir.exists() {
        return Err(format!("应用 {} 不存在", app_key));
    }

    let data_yml = app_dir.join("data.yml");
    if !data_yml.exists() {
        return Err(format!("应用 {} 的 data.yml 不存在", app_key));
    }

    let yaml_str = fs::read_to_string(&data_yml).map_err(|e| e.to_string())?;
    let manifest: AppManifest =
        serde_yaml::from_str(&yaml_str).map_err(|e| format!("解析 data.yml 失败: {}", e))?;

    let logo_path = app_dir.join("logo.png");
    let icon = if logo_path.exists() {
        let bytes = fs::read(&logo_path).unwrap_or_default();
        STANDARD.encode(&bytes)
    } else {
        String::new()
    };

    let readme_zh = fs::read_to_string(app_dir.join("README.md")).unwrap_or_default();
    let readme_en = fs::read_to_string(app_dir.join("README_en.md")).unwrap_or_default();

    let mut version_infos: Vec<AppVersionInfo> = Vec::new();
    if let Ok(entries) = fs::read_dir(&app_dir) {
        for entry in entries.flatten() {
            let ver_dir = entry.path();
            if !ver_dir.is_dir() {
                continue;
            }
            let ver_name = entry.file_name().to_string_lossy().to_string();

            let compose_path = ver_dir.join("docker-compose.yml");
            if !compose_path.exists() {
                continue;
            }

            let compose_preview = fs::read_to_string(&compose_path).unwrap_or_default();

            let ver_data = ver_dir.join("data.yml");
            let form_fields = if ver_data.exists() {
                let ver_yaml = fs::read_to_string(&ver_data).unwrap_or_default();
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

    let installed = load_installed(app);
    let installed_keys: std::collections::HashSet<String> =
        installed.iter().map(|a| a.app_key.clone()).collect();

    Ok(AppDetail {
        key: app_key.to_string(),
        name: manifest.additional.name.clone(),
        tags: manifest.additional.tags.clone(),
        description: manifest.additional.description.clone(),
        short_desc_zh: manifest.additional.short_desc_zh,
        short_desc_en: manifest.additional.short_desc_en,
        website: manifest.additional.website.clone().unwrap_or_default(),
        github: manifest.additional.github.clone().unwrap_or_default(),
        document: manifest.additional.document.clone().unwrap_or_default(),
        icon,
        installed: installed_keys.contains(app_key),
        versions: version_infos,
        readme_zh,
        readme_en,
    })
}

/// 安装应用到远程服务器（接收已解析的 ServerConfig）
pub fn install_app_inner(
    app: &AppHandle,
    server: &ServerConfig,
    req: &InstallAppRequest,
) -> Result<InstalledApp, String> {
    let cache_dir = appstore_cache_dir(app);
    let app_dir = apps_dir(&cache_dir).join(&req.app_key);
    let version_dir = app_dir.join(&req.version);

    if !version_dir.exists() {
        return Err(format!(
            "应用 {} 版本 {} 的 docker-compose.yml 不存在",
            req.app_key, req.version
        ));
    }

    let compose_template =
        fs::read_to_string(version_dir.join("docker-compose.yml")).map_err(|e| e.to_string())?;

    // 注入 1Panel 标准变量：CONTAINER_NAME
    let mut env_values = req.env_values.clone();
    let container_name = format!("shipyardx-{}", &req.app_key);
    env_values.entry("CONTAINER_NAME".to_string()).or_insert_with(|| container_name);

    let rendered = render_compose(&compose_template, &env_values);

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

    ssh_exec(server, &setup_cmd).map_err(|e| format!("部署文件失败: {}", e))?;

    let local_data_dir = version_dir.join("data");
    if local_data_dir.exists() && local_data_dir.is_dir() {
        copy_data_dir_to_remote(server, &local_data_dir, &format!("{}/data", remote_base))?;
    }

    // 确保 shipyardx-network 存在（忽略已存在的错误）
    let net_cmd = "docker network create shipyardx-network 2>/dev/null; true".to_string();
    let _ = ssh_exec(server, &net_cmd);

    // 尝试 docker compose (v2)，失败则回退到 docker-compose (v1)
    let up_cmd_v2 = format!(
        "cd \"{0}\" && docker compose -f docker-compose.yml up -d 2>&1",
        remote_base
    );
    let up_cmd_v1 = format!(
        "cd \"{0}\" && docker-compose -f docker-compose.yml up -d 2>&1",
        remote_base
    );

    let result = ssh_exec(server, &up_cmd_v2);
    match result {
        Ok(output) => {
            let _output = output;
        }
        Err(e) => {
            // 回退到 docker-compose (v1)
            let result_v1 = ssh_exec(server, &up_cmd_v1)
                .map_err(|e2| format!("docker compose 失败: {}\ndocker-compose 也失败: {}", e, e2))?;
            let _output = result_v1;
        }
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let installed_app = InstalledApp {
        install_id: install_id.clone(),
        app_key: req.app_key.clone(),
        app_name: req.app_key.clone(),
        version: req.version.clone(),
        server_id: server.id.clone(),
        install_path: remote_base,
        status: "running".to_string(),
        created_at: now,
    };

    let mut installed = load_installed(app);
    installed.push(installed_app.clone());
    save_installed(app, &installed)?;

    Ok(installed_app)
}

/// 卸载远程服务器上的应用
pub fn uninstall_app_inner(
    app: &AppHandle,
    install_id: &str,
    server: &ServerConfig,
    remote_base: &str,
) -> Result<(), String> {
    let down_cmd_v2 = format!(
        "cd \"{0}\" && docker compose -f docker-compose.yml down -v 2>&1",
        remote_base
    );
    let down_cmd_v1 = format!(
        "cd \"{0}\" && docker-compose -f docker-compose.yml down -v 2>&1",
        remote_base
    );
    let _ = ssh_exec(server, &down_cmd_v2).or_else(|_| ssh_exec(server, &down_cmd_v1));

    let rm_cmd = format!("rm -rf \"{}\"", remote_base);
    let _ = ssh_exec(server, &rm_cmd);

    let mut installed = load_installed(app);
    installed.retain(|a| a.install_id != install_id);
    save_installed(app, &installed)?;

    Ok(())
}

/// 列出某服务器上已安装的应用
pub fn list_installed(app: &AppHandle, server_id: Option<String>) -> Vec<InstalledApp> {
    let installed = load_installed(app);
    if let Some(sid) = server_id {
        installed.into_iter().filter(|a| a.server_id == sid).collect()
    } else {
        installed
    }
}

/// 启动/停止/重启已安装应用
pub fn operate_app_inner(
    _app: &AppHandle,
    install_id: &str,
    operation: &str,
    server: &ServerConfig,
    remote_base: &str,
) -> Result<String, String> {
    let cmd_v2 = format!(
        "cd \"{0}\" && docker compose -f docker-compose.yml {1} 2>&1",
        remote_base, operation
    );
    let cmd_v1 = format!(
        "cd \"{0}\" && docker-compose -f docker-compose.yml {1} 2>&1",
        remote_base, operation
    );

    let output = ssh_exec(server, &cmd_v2)
        .or_else(|_| ssh_exec(server, &cmd_v1))?;

    // 更新状态
    let mut installed = load_installed(_app);
    if let Some(target) = installed.iter_mut().find(|a| a.install_id == install_id) {
        target.status = match operation {
            "start" => "running".to_string(),
            "stop" => "stopped".to_string(),
            _ => target.status.clone(),
        };
    }
    let _ = save_installed(_app, &installed);

    Ok(output)
}

/// 获取已安装应用状态
pub fn get_app_status_inner(server: &ServerConfig, remote_base: &str) -> Result<String, String> {
    let cmd_v2 = format!(
        "cd \"{}\" && docker compose -f docker-compose.yml ps --format json 2>&1",
        remote_base
    );
    let cmd_v1 = format!(
        "cd \"{}\" && docker-compose -f docker-compose.yml ps --format json 2>&1",
        remote_base
    );
    let output = ssh_exec(server, &cmd_v2)
        .or_else(|_| ssh_exec(server, &cmd_v1))?;

    if output.trim().is_empty() {
        Ok("stopped".to_string())
    } else if output.contains("\"State\":\"exited\"") {
        Ok("stopped".to_string())
    } else {
        Ok("running".to_string())
    }
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

/// 通过 SSH 将本地 data 目录复制到远程
fn copy_data_dir_to_remote(
    server: &ServerConfig,
    local_dir: &Path,
    remote_dir: &str,
) -> Result<(), String> {
    let parent = local_dir.parent().unwrap_or(local_dir);
    let dir_name = local_dir.file_name().unwrap().to_str().unwrap();

    let mut tar_cmd = std::process::Command::new("tar");
    tar_cmd
        .arg("-czf")
        .arg("-")
        .arg("-C")
        .arg(parent.to_str().unwrap())
        .arg(dir_name);

    let output = tar_cmd.output().map_err(|e| format!("tar 失败: {}", e))?;
    let tar_b64 = STANDARD.encode(&output.stdout);

    let remote_parent = Path::new(remote_dir)
        .parent()
        .unwrap_or(Path::new(remote_dir))
        .display();

    let remote_cmd = format!(
        "mkdir -p \"{}\" && printf '%s' \"{}\" | base64 -d | tar -xzf - -C \"{}\"",
        remote_dir, tar_b64, remote_parent
    );

    ssh_exec(server, &remote_cmd)?;
    Ok(())
}
