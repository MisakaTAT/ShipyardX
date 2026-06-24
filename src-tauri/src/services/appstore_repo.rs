use base64::{Engine as _, engine::general_purpose::STANDARD};
use git2::{AutotagOption, FetchOptions, ProxyOptions, Repository, ResetType, build::RepoBuilder};
use log::{debug, info, warn};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::task;
use tokio::time::{Duration, sleep};
use uuid::Uuid;

use crate::config::store::atomic_write;
use crate::dto::appstore::{
    AppDetail, AppListItem, AppManifest, AppVersionInfo, AppstoreCacheInfo, AppstoreSettings, VersionManifest,
};
use crate::error::{AppError, AppResult};
use crate::services::appstore::emit_appstore_sync_progress;
use crate::utils::formatting::format_bytes_u64;

const DEFAULT_APPSTORE_REPO_URL: &str = "https://github.com/1Panel-dev/appstore.git";
const APPSTORE_SETTINGS_FILE: &str = "appstore-settings.json";
const APPSTORE_CACHE_REMOVE_RETRIES: usize = 3;
const APPSTORE_CACHE_REMOVE_RETRY_DELAY_MS: u64 = 250;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CacheRepoState {
    Missing,
    ValidGitRepo,
    Incomplete,
}

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

    fn settings_file(&self) -> PathBuf {
        self.cache_dir
            .parent()
            .unwrap_or(&self.cache_dir)
            .join(APPSTORE_SETTINGS_FILE)
    }

    pub(crate) async fn sync_with_progress(&self, app: &AppHandle) -> AppResult<PathBuf> {
        info!(target: "shipyardx_lib::services::appstore_repo", "syncing appstore; cache_dir={}", self.cache_dir.display());
        let settings = self.load_settings().await?;

        match detect_cache_repo_state(self.cache_dir.clone()).await? {
            CacheRepoState::ValidGitRepo => {
                git_sync_existing_repo(self.cache_dir.clone(), settings.clone(), Some(app.clone())).await?;
                info!(target: "shipyardx_lib::services::appstore_repo", "appstore sync completed; cache_dir={}", self.cache_dir.display());
                return Ok(self.cache_dir.clone());
            }
            CacheRepoState::Incomplete => {
                warn!(
                    target: "shipyardx_lib::services::appstore_repo",
                    "detected incomplete appstore cache; cache_dir={}",
                    self.cache_dir.display()
                );
                recover_incomplete_cache_dir(&self.cache_dir).await?;
            }
            CacheRepoState::Missing => {}
        }

        git_clone_repo(self.cache_dir.clone(), settings, Some(app.clone())).await?;
        info!(target: "shipyardx_lib::services::appstore_repo", "appstore clone completed; cache_dir={}", self.cache_dir.display());
        Ok(self.cache_dir.clone())
    }

    pub(crate) async fn load_settings(&self) -> AppResult<AppstoreSettings> {
        let path = self.settings_file();
        if !fs::try_exists(&path).await.unwrap_or(false) {
            return Ok(default_appstore_settings());
        }

        let raw = fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::internal("appstore.settings_read_failed", "读取应用商店设置失败").with_source(e))?;
        serde_json::from_str::<AppstoreSettings>(&raw)
            .map(normalize_appstore_settings)
            .map_err(|e| AppError::internal("appstore.settings_parse_failed", "解析应用商店设置失败").with_source(e))
    }

    pub(crate) async fn save_settings(&self, settings: AppstoreSettings) -> AppResult<AppstoreSettings> {
        let normalized = normalize_appstore_settings(settings);
        let path = self.settings_file();
        let payload = serde_json::to_vec_pretty(&normalized).map_err(|e| {
            AppError::internal("appstore.settings_serialize_failed", "序列化应用商店设置失败").with_source(e)
        })?;

        task::spawn_blocking(move || atomic_write(&path, &payload))
            .await
            .map_err(|e| {
                AppError::internal("appstore.settings_write_join_failed", "写入应用商店设置失败").with_source(e)
            })??;
        Ok(normalized)
    }

    pub(crate) async fn get_cache_info(&self) -> AppResult<AppstoreCacheInfo> {
        let cache_dir = self.cache_dir.clone();
        task::spawn_blocking(move || {
            let exists = cache_dir.exists();
            let size_bytes = if exists { dir_size(&cache_dir)? } else { 0 };
            Ok(AppstoreCacheInfo {
                cache_dir: cache_dir.display().to_string(),
                exists,
                size: format_bytes_u64(size_bytes),
            })
        })
        .await
        .map_err(|e| AppError::internal("appstore.cache_info_join_failed", "读取应用商店缓存信息失败").with_source(e))?
    }

    pub(crate) async fn clear_cache(&self) -> AppResult<()> {
        let cache_dir = self.cache_dir.clone();
        task::spawn_blocking(move || {
            if cache_dir.exists() {
                std::fs::remove_dir_all(&cache_dir).map_err(|e| {
                    AppError::internal("appstore.cache_clear_failed", "清除应用商店缓存失败").with_source(e)
                })?;
            }
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal("appstore.cache_clear_join_failed", "清除应用商店缓存失败").with_source(e))?
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

async fn git_sync_existing_repo(
    cache_dir: PathBuf,
    settings: AppstoreSettings,
    app: Option<AppHandle>,
) -> AppResult<()> {
    task::spawn_blocking(move || sync_existing_repo_blocking(&cache_dir, &settings, app.as_ref()))
        .await
        .map_err(|e| AppError::internal("appstore.sync_join_failed", "等待应用商店同步任务失败").with_source(e))?
}

async fn git_clone_repo(cache_dir: PathBuf, settings: AppstoreSettings, app: Option<AppHandle>) -> AppResult<()> {
    task::spawn_blocking(move || clone_repo_blocking(&cache_dir, &settings, app.as_ref()))
        .await
        .map_err(|e| AppError::internal("appstore.sync_join_failed", "等待应用商店同步任务失败").with_source(e))?
}

fn sync_existing_repo_blocking(
    cache_dir: &Path,
    settings: &AppstoreSettings,
    app: Option<&AppHandle>,
) -> AppResult<()> {
    let repo = Repository::open(cache_dir)
        .map_err(|e| AppError::unavailable("appstore.sync_failed", "同步应用商店失败").with_source(e))?;

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| AppError::unavailable("appstore.sync_failed", "同步应用商店失败").with_source(e))?;

    let mut fetch_options = build_fetch_options("fetch", settings, app);
    remote
        .fetch(&["HEAD"], Some(&mut fetch_options), None)
        .map_err(|e| AppError::unavailable("appstore.sync_failed", "同步应用商店失败").with_source(e))?;

    let target = repo
        .revparse_single("FETCH_HEAD")
        .map_err(|e| AppError::unavailable("appstore.sync_failed", "同步应用商店失败").with_source(e))?;

    repo.reset(&target, ResetType::Hard, None)
        .map_err(|e| AppError::unavailable("appstore.sync_failed", "同步应用商店失败").with_source(e))?;
    Ok(())
}

fn clone_repo_blocking(cache_dir: &Path, settings: &AppstoreSettings, app: Option<&AppHandle>) -> AppResult<()> {
    let fetch_options = build_fetch_options("clone", settings, app);

    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_options);

    builder
        .clone(&settings.repo_url, cache_dir)
        .map_err(|e| AppError::unavailable("appstore.sync_failed", "同步应用商店失败").with_source(e))?;
    Ok(())
}

fn build_fetch_options(
    phase: &'static str,
    settings: &AppstoreSettings,
    app: Option<&AppHandle>,
) -> FetchOptions<'static> {
    let mut fetch_options = FetchOptions::new();
    if let Some(app) = app {
        let app = app.clone();
        let mut callbacks = git2::RemoteCallbacks::new();
        let mut last_percent: usize = 0;
        callbacks.transfer_progress(move |stats| {
            let total = stats.total_objects();
            let received = stats.received_objects();
            let indexed = stats.indexed_objects();
            if total == 0 {
                return true;
            }

            let percent = received.saturating_mul(100) / total;
            if percent >= last_percent + 5 || percent == 100 {
                last_percent = percent;
                debug!(
                    target: "shipyardx_lib::services::appstore_repo",
                    "appstore {} progress; received={}/{} indexed={} percent={}%",
                    phase,
                    received,
                    total,
                    indexed,
                    percent
                );
                emit_appstore_sync_progress(
                    &app,
                    phase,
                    u32::try_from(received).unwrap_or(u32::MAX),
                    u32::try_from(total).unwrap_or(u32::MAX),
                    u32::try_from(indexed).unwrap_or(u32::MAX),
                    percent as f64,
                );
            }
            true
        });
        fetch_options.remote_callbacks(callbacks);
    }
    if settings.proxy_enabled && !settings.proxy_url.trim().is_empty() {
        let mut proxy_options = ProxyOptions::new();
        proxy_options.url(settings.proxy_url.trim());
        fetch_options.proxy_options(proxy_options);
    }
    fetch_options.download_tags(AutotagOption::None);
    fetch_options.depth(1);
    fetch_options
}

fn default_appstore_settings() -> AppstoreSettings {
    AppstoreSettings {
        repo_url: DEFAULT_APPSTORE_REPO_URL.to_string(),
        proxy_enabled: false,
        proxy_url: "http://127.0.0.1:7890".to_string(),
    }
}

fn normalize_appstore_settings(settings: AppstoreSettings) -> AppstoreSettings {
    AppstoreSettings {
        repo_url: if settings.repo_url.trim().is_empty() {
            DEFAULT_APPSTORE_REPO_URL.to_string()
        } else {
            settings.repo_url.trim().to_string()
        },
        proxy_enabled: settings.proxy_enabled,
        proxy_url: if settings.proxy_url.trim().is_empty() {
            "http://127.0.0.1:7890".to_string()
        } else {
            settings.proxy_url.trim().to_string()
        },
    }
}

fn dir_size(path: &Path) -> AppResult<u64> {
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)
        .map_err(|e| AppError::internal("appstore.cache_read_failed", "读取应用商店缓存目录失败").with_source(e))?
    {
        let entry = entry.map_err(|e| {
            AppError::internal("appstore.cache_entry_failed", "读取应用商店缓存目录项失败").with_source(e)
        })?;
        let metadata = entry
            .metadata()
            .map_err(|e| AppError::internal("appstore.cache_stat_failed", "读取应用商店缓存信息失败").with_source(e))?;
        if metadata.is_dir() {
            total = total.saturating_add(dir_size(&entry.path())?);
        } else {
            total = total.saturating_add(metadata.len());
        }
    }
    Ok(total)
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

async fn detect_cache_repo_state(cache_dir: PathBuf) -> AppResult<CacheRepoState> {
    task::spawn_blocking(move || {
        if !cache_dir.exists() {
            return Ok(CacheRepoState::Missing);
        }
        if !cache_dir.join(".git").exists() {
            return Ok(CacheRepoState::Incomplete);
        }
        match Repository::open(&cache_dir) {
            Ok(_) => Ok(CacheRepoState::ValidGitRepo),
            Err(_) => Ok(CacheRepoState::Incomplete),
        }
    })
    .await
    .map_err(|e| AppError::internal("appstore.cache_state_join_failed", "检查应用商店缓存状态失败").with_source(e))?
}

async fn recover_incomplete_cache_dir(cache_dir: &Path) -> AppResult<()> {
    if !fs::try_exists(cache_dir).await.unwrap_or(false) {
        return Ok(());
    }

    if try_remove_dir_all(cache_dir).await? {
        return Ok(());
    }

    let parent = cache_dir
        .parent()
        .ok_or_else(|| AppError::internal("appstore.cache_parent_missing", "无法定位应用商店缓存目录的父目录"))?;
    let file_name = cache_dir
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::internal("appstore.cache_dir_name_invalid", "应用商店缓存目录名称无效"))?;
    let quarantine_dir = parent.join(format!("{file_name}.stale-{}", Uuid::new_v4()));

    fs::rename(cache_dir, &quarantine_dir).await.map_err(|e| {
        AppError::internal("appstore.cache_recover_rename_failed", "清理未完成的应用商店缓存失败")
            .with_detail(format!(
                "无法重命名残留目录：{} -> {}: {}",
                cache_dir.display(),
                quarantine_dir.display(),
                e
            ))
            .with_action("请关闭占用该目录的程序后重试")
    })?;

    info!(
        target: "shipyardx_lib::services::appstore_repo",
        "quarantined incomplete appstore cache; from={} to={}",
        cache_dir.display(),
        quarantine_dir.display()
    );

    let cleanup_dir = quarantine_dir.clone();
    tokio::spawn(async move {
        if let Err(error) = try_remove_dir_all(&cleanup_dir).await {
            warn!(
                target: "shipyardx_lib::services::appstore_repo",
                "failed to remove quarantined appstore cache; path={} detail={}",
                cleanup_dir.display(),
                error.detail.unwrap_or(error.message)
            );
        }
    });

    Ok(())
}

async fn try_remove_dir_all(path: &Path) -> AppResult<bool> {
    for attempt in 0..APPSTORE_CACHE_REMOVE_RETRIES {
        match fs::remove_dir_all(path).await {
            Ok(_) => return Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
            Err(error) => {
                warn!(
                    target: "shipyardx_lib::services::appstore_repo",
                    "remove appstore cache dir failed; path={} attempt={} detail={}",
                    path.display(),
                    attempt + 1,
                    error
                );
                sleep(Duration::from_millis(APPSTORE_CACHE_REMOVE_RETRY_DELAY_MS)).await;
            }
        }
    }

    Ok(!fs::try_exists(path).await.unwrap_or(true))
}
