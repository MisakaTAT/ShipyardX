use std::path::{Path, PathBuf};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use log::{debug, info, warn};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::process::Command;

use crate::dto::appstore::{AppDetail, AppListItem, AppManifest, AppVersionInfo, VersionManifest};
use crate::error::{AppError, AppResult};

const APPSTORE_REPO_URL: &str = "https://github.com/1Panel-dev/appstore.git";
const SYNC_RETRY_LIMIT: usize = 2;

pub(crate) struct AppstoreRepo {
    cache_dir: PathBuf,
}

impl AppstoreRepo {
    pub(crate) fn new(app: &AppHandle) -> AppResult<Self> {
        let cache_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::internal("appstore.data_dir_unavailable", "无法获取应用数据目录").with_source(e))?
            .join("appstore_cache");
        Ok(Self { cache_dir })
    }

    pub(crate) fn apps_dir(&self) -> PathBuf {
        self.cache_dir.join("apps")
    }

    pub(crate) fn app_dir(&self, app_key: &str) -> PathBuf {
        self.apps_dir().join(app_key)
    }

    pub(crate) fn version_dir(&self, app_key: &str, version: &str) -> PathBuf {
        self.app_dir(app_key).join(version)
    }

    pub(crate) async fn sync(&self) -> AppResult<PathBuf> {
        let git_dir = self.cache_dir.join(".git");
        info!(target: "shipyardx_lib::services::appstore_repo", "syncing appstore; cache_dir={}", self.cache_dir.display());

        for attempt in 0..SYNC_RETRY_LIMIT {
            if fs::try_exists(&git_dir).await.unwrap_or(false) {
                let cache_dir_str = self.cache_dir.to_string_lossy().to_string();
                let output = Command::new("git")
                    .args(["-C", cache_dir_str.as_str(), "pull", "--ff-only"])
                    .output()
                    .await
                    .map_err(|e| {
                        AppError::internal("appstore.git_pull_spawn_failed", "执行 git pull 失败").with_source(e)
                    })?;
                if output.status.success() {
                    info!(target: "shipyardx_lib::services::appstore_repo", "appstore pull completed; cache_dir={}", self.cache_dir.display());
                    return Ok(self.cache_dir.clone());
                }

                let stderr = String::from_utf8_lossy(&output.stderr);
                if attempt + 1 < SYNC_RETRY_LIMIT
                    && (stderr.contains("Not a git repository") || stderr.contains("error:"))
                {
                    warn!(target: "shipyardx_lib::services::appstore_repo", "appstore cache invalid, recreating; cache_dir={} stderr={}", self.cache_dir.display(), stderr.trim());
                    let _ = fs::remove_dir_all(&self.cache_dir).await;
                    continue;
                }

                return Err(
                    AppError::unavailable("appstore.git_pull_failed", "同步应用商店失败").with_detail(stderr.trim())
                );
            }

            let _ = fs::create_dir_all(&self.cache_dir).await;
            let cache_dir_str = self.cache_dir.to_string_lossy().to_string();
            let output = Command::new("git")
                .args(["clone", "--depth", "1", APPSTORE_REPO_URL, cache_dir_str.as_str()])
                .output()
                .await
                .map_err(|e| {
                    AppError::internal("appstore.git_clone_spawn_failed", "执行 git clone 失败").with_source(e)
                })?;
            if output.status.success() {
                info!(target: "shipyardx_lib::services::appstore_repo", "appstore clone completed; cache_dir={}", self.cache_dir.display());
                return Ok(self.cache_dir.clone());
            }

            let stderr = String::from_utf8_lossy(&output.stderr);
            if attempt + 1 >= SYNC_RETRY_LIMIT {
                return Err(
                    AppError::unavailable("appstore.git_clone_failed", "克隆应用商店失败").with_detail(stderr.trim())
                );
            }
            let _ = fs::remove_dir_all(&self.cache_dir).await;
        }

        Err(AppError::unavailable("appstore.sync_failed", "同步应用商店失败"))
    }

    pub(crate) async fn list_apps(&self) -> AppResult<Vec<AppListItem>> {
        let apps_dir = self.apps_dir();
        debug!(target: "shipyardx_lib::services::appstore_repo", "listing appstore apps; apps_dir={}", apps_dir.display());
        if !fs::try_exists(&apps_dir).await.unwrap_or(false) {
            return Ok(vec![]);
        }

        let mut items = Vec::new();
        let mut entries = fs::read_dir(&apps_dir)
            .await
            .map_err(|e| AppError::internal("appstore.apps_dir_read_failed", "读取 apps 目录失败").with_source(e))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| AppError::internal("appstore.apps_dir_entry_failed", "读取应用目录项失败").with_source(e))?
        {
            if !entry
                .file_type()
                .await
                .map_err(|e| {
                    AppError::internal("appstore.apps_dir_entry_failed", "读取应用目录类型失败").with_source(e)
                })?
                .is_dir()
            {
                continue;
            }

            let app_dir = entry.path();
            let Some(file_name) = app_dir.file_name() else {
                continue;
            };
            let key = file_name.to_string_lossy().to_string();
            let manifest = match self.read_manifest(&app_dir).await {
                Ok(Some(manifest)) => manifest,
                Ok(None) => continue,
                Err(_) => continue,
            };

            items.push(AppListItem {
                key,
                name: manifest.additional.name.clone(),
                app_type: manifest.additional.app_type.clone(),
                tags: manifest.tags.clone(),
                description: pick_description(&manifest.additional.description),
                short_desc_zh: manifest.additional.short_desc_zh.clone(),
                short_desc_en: manifest.additional.short_desc_en.clone(),
                website: manifest.additional.website.clone().unwrap_or_default(),
                icon: self.read_icon_base64(&app_dir).await,
                versions: self.read_versions(&app_dir).await,
            });
        }

        items.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(items)
    }

    pub(crate) async fn get_app_detail(&self, app_key: &str) -> AppResult<AppDetail> {
        let app_dir = self.app_dir(app_key);
        if !fs::try_exists(&app_dir).await.unwrap_or(false) {
            return Err(AppError::not_found(
                "appstore.app_not_found",
                format!("应用 {} 不存在", app_key),
            ));
        }

        let manifest = self.read_manifest(&app_dir).await?.ok_or_else(|| {
            AppError::not_found(
                "appstore.manifest_not_found",
                format!("应用 {} 的 data.yml 不存在", app_key),
            )
        })?;

        let readme_zh = fs::read_to_string(app_dir.join("README.md")).await.unwrap_or_default();
        let readme_en = fs::read_to_string(app_dir.join("README_en.md"))
            .await
            .unwrap_or_default();

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
            icon: self.read_icon_base64(&app_dir).await,
            versions: self.read_version_infos(&app_dir).await,
            readme_zh,
            readme_en,
        })
    }

    async fn read_manifest(&self, app_dir: &Path) -> AppResult<Option<AppManifest>> {
        let data_yml = app_dir.join("data.yml");
        if !fs::try_exists(&data_yml).await.unwrap_or(false) {
            return Ok(None);
        }
        let yaml_str = fs::read_to_string(&data_yml)
            .await
            .map_err(|e| AppError::internal("appstore.manifest_read_failed", "读取 data.yml 失败").with_source(e))?;
        let manifest = serde_yaml::from_str(&yaml_str)
            .map_err(|e| AppError::internal("appstore.manifest_parse_failed", "解析 data.yml 失败").with_source(e))?;
        Ok(Some(manifest))
    }

    async fn read_icon_base64(&self, app_dir: &Path) -> String {
        let logo_path = app_dir.join("logo.png");
        if !fs::try_exists(&logo_path).await.unwrap_or(false) {
            return String::new();
        }
        let bytes = fs::read(&logo_path).await.unwrap_or_default();
        STANDARD.encode(&bytes)
    }

    async fn read_versions(&self, app_dir: &Path) -> Vec<String> {
        let mut versions = Vec::new();
        if let Ok(mut entries) = fs::read_dir(app_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let ver_dir = entry.path();
                let Ok(file_type) = entry.file_type().await else {
                    continue;
                };
                if !file_type.is_dir() {
                    continue;
                }
                let ver_name = entry.file_name().to_string_lossy().to_string();
                if ver_name == "latest"
                    || fs::try_exists(ver_dir.join("docker-compose.yml"))
                        .await
                        .unwrap_or(false)
                {
                    versions.push(ver_name);
                }
            }
        }
        versions
    }

    async fn read_version_infos(&self, app_dir: &Path) -> Vec<AppVersionInfo> {
        let mut version_infos = Vec::new();
        if let Ok(mut entries) = fs::read_dir(app_dir).await {
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
        version_infos
    }
}

fn pick_description(desc: &crate::dto::appstore::DescriptionI18n) -> String {
    if !desc.zh.is_empty() {
        return desc.zh.clone();
    }
    if !desc.en.is_empty() {
        return desc.en.clone();
    }
    String::new()
}
