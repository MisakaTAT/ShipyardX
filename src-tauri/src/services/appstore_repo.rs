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
    AppDetail, AppListItem, AppManifest, AppVersionInfo, AppstoreCacheInfo, AppstoreSettings, AppstoreSource,
    VersionManifest,
};
use crate::error::{AppError, AppResult};
use crate::services::appstore::emit_appstore_sync_progress;
use crate::utils::formatting::format_bytes_u64;

const DEFAULT_APPSTORE_1PANEL_REPO_URL: &str = "https://github.com/1Panel-dev/appstore.git";
const DEFAULT_APPSTORE_OKXLIN_REPO_URL: &str = "https://github.com/okxlin/appstore.git";
const APPSTORE_SETTINGS_FILE: &str = "appstore-settings.json";
const APPSTORE_CACHE_REMOVE_RETRIES: usize = 3;
const APPSTORE_CACHE_REMOVE_RETRY_DELAY_MS: u64 = 250;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CacheRepoState {
    Missing,
    Ready,
    ResetRequired,
}

pub(crate) struct AppstoreRepo {
    app_data_dir: PathBuf,
    cache_root_dir: PathBuf,
    source: Option<AppstoreSource>,
}

impl AppstoreRepo {
    pub(crate) fn new(app: &AppHandle) -> AppResult<Self> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::internal("appstore.data_dir_unavailable").with_source(e))?;
        let cache_root_dir = app_data_dir.join("appstore_cache");
        Ok(Self {
            app_data_dir,
            cache_root_dir,
            source: None,
        })
    }

    pub(crate) fn with_source(app: &AppHandle, source: AppstoreSource) -> AppResult<Self> {
        let mut repo = Self::new(app)?;
        repo.source = Some(source);
        Ok(repo)
    }

    pub(crate) async fn sync_enabled_with_progress(app: &AppHandle) -> AppResult<Vec<PathBuf>> {
        let root_repo = Self::new(app)?;
        let settings = root_repo.load_settings().await?;
        let enabled_sources: Vec<AppstoreSource> =
            settings.sources.into_iter().filter(|source| source.enabled).collect();
        if enabled_sources.is_empty() {
            return Err(AppError::validation("appstore.no_enabled_source"));
        }

        let mut synced_dirs = Vec::with_capacity(enabled_sources.len());
        for source in enabled_sources {
            let repo = Self::with_source(app, source)?;
            synced_dirs.push(repo.sync_with_progress(app).await?);
        }
        Ok(synced_dirs)
    }

    fn apps_dir(&self, cache_dir: &Path) -> PathBuf {
        cache_dir.join("apps")
    }

    /// `code` 直接决定文案，避免把「应用标识」这类中文名词当参数传进来
    pub(crate) fn ensure_safe_component(code: &'static str, value: &str) -> AppResult<()> {
        if is_safe_path_component(value) {
            return Ok(());
        }
        Err(AppError::validation(code).param("value", value))
    }

    fn app_dir(&self, cache_dir: &Path, app_key: &str) -> PathBuf {
        self.apps_dir(cache_dir).join(app_key)
    }

    pub(crate) fn version_dir(&self, app_key: &str, version: &str) -> PathBuf {
        self.cache_dir_for_active_source()
            .join("apps")
            .join(app_key)
            .join(version)
    }

    fn settings_file(&self) -> PathBuf {
        self.app_data_dir.join(APPSTORE_SETTINGS_FILE)
    }

    fn cache_dir_for_source(&self, source: &AppstoreSource) -> PathBuf {
        self.cache_root_dir.join(&source.id)
    }

    fn cache_dir_for_active_source(&self) -> PathBuf {
        self.source
            .as_ref()
            .map(|source| self.cache_dir_for_source(source))
            .unwrap_or_else(|| self.cache_root_dir.join("1panel"))
    }

    async fn resolved_source(&self) -> AppResult<AppstoreSource> {
        if let Some(source) = &self.source {
            return Ok(source.clone());
        }
        let settings = self.load_settings().await?;
        active_source(&settings).cloned()
    }

    pub(crate) async fn sync_with_progress(&self, app: &AppHandle) -> AppResult<PathBuf> {
        let settings = self.load_settings().await?;
        let source = self.resolved_source().await?;
        let cache_dir = self.cache_dir_for_source(&source);
        info!(target: "shipyardx_lib::services::appstore_repo", "syncing appstore; source_id={} cache_dir={}", source.id, cache_dir.display());

        match detect_cache_repo_state(cache_dir.clone(), &source.repo_url).await? {
            CacheRepoState::Ready => {
                git_sync_existing_repo(cache_dir.clone(), settings.clone(), source.clone(), Some(app.clone())).await?;
                info!(target: "shipyardx_lib::services::appstore_repo", "appstore sync completed; source_id={} cache_dir={}", source.id, cache_dir.display());
                return Ok(cache_dir);
            }
            CacheRepoState::ResetRequired => {
                warn!(
                    target: "shipyardx_lib::services::appstore_repo",
                    "appstore cache requires reset before sync; source_id={} cache_dir={} active_repo={}",
                    source.id,
                    cache_dir.display(),
                    source.repo_url
                );
                recover_incomplete_cache_dir(&cache_dir).await?;
            }
            CacheRepoState::Missing => {}
        }

        git_clone_repo(cache_dir.clone(), settings, source.clone(), Some(app.clone())).await?;
        info!(target: "shipyardx_lib::services::appstore_repo", "appstore clone completed; source_id={} cache_dir={}", source.id, cache_dir.display());
        Ok(cache_dir)
    }

    pub(crate) async fn load_settings(&self) -> AppResult<AppstoreSettings> {
        let path = self.settings_file();
        if !fs::try_exists(&path).await.unwrap_or(false) {
            return Ok(default_appstore_settings());
        }

        let raw = fs::read_to_string(&path)
            .await
            .map_err(|e| AppError::internal("appstore.settings_read_failed").with_source(e))?;
        serde_json::from_str::<AppstoreSettings>(&raw)
            .map(normalize_appstore_settings)
            .map_err(|e| AppError::internal("appstore.settings_parse_failed").with_source(e))
    }

    pub(crate) async fn save_settings(&self, settings: AppstoreSettings) -> AppResult<AppstoreSettings> {
        let normalized = normalize_appstore_settings(settings);
        let path = self.settings_file();
        let payload = serde_json::to_vec_pretty(&normalized)
            .map_err(|e| AppError::internal("appstore.settings_serialize_failed").with_source(e))?;

        task::spawn_blocking(move || atomic_write(&path, &payload))
            .await
            .map_err(|e| AppError::internal("appstore.settings_write_join_failed").with_source(e))??;
        Ok(normalized)
    }

    pub(crate) async fn get_cache_info(&self) -> AppResult<AppstoreCacheInfo> {
        let cache_dir = self.cache_root_dir.clone();
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
        .map_err(|e| AppError::internal("appstore.cache_info_join_failed").with_source(e))?
    }

    pub(crate) async fn clear_cache(&self) -> AppResult<()> {
        let cache_dir = self.cache_root_dir.clone();
        task::spawn_blocking(move || {
            if cache_dir.exists() {
                std::fs::remove_dir_all(&cache_dir)
                    .map_err(|e| AppError::internal("appstore.cache_clear_failed").with_source(e))?;
            }
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal("appstore.cache_clear_join_failed").with_source(e))?
    }

    pub(crate) async fn list_apps(&self) -> AppResult<Vec<AppListItem>> {
        let source = self.resolved_source().await?;
        let cache_dir = self.cache_dir_for_source(&source);
        let apps_dir = self.apps_dir(&cache_dir);
        debug!(target: "shipyardx_lib::services::appstore_repo", "listing appstore apps; apps_dir={}", apps_dir.display());
        if !fs::try_exists(&apps_dir).await.unwrap_or(false) {
            return Ok(vec![]);
        }

        let mut items = Vec::new();
        let mut entries = fs::read_dir(&apps_dir)
            .await
            .map_err(|e| AppError::internal("appstore.apps_dir_read_failed").with_source(e))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| AppError::internal("appstore.apps_dir_entry_failed").with_source(e))?
        {
            if !entry
                .file_type()
                .await
                .map_err(|e| AppError::internal("appstore.apps_dir_entry_type_failed").with_source(e))?
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
        let source = self.resolved_source().await?;
        let cache_dir = self.cache_dir_for_source(&source);
        let app_dir = self.app_dir(&cache_dir, app_key);
        if !fs::try_exists(&app_dir).await.unwrap_or(false) {
            return Err(AppError::not_found("appstore.app_not_found").param("app", app_key));
        }

        let manifest = self
            .read_manifest(&app_dir)
            .await?
            .ok_or_else(|| AppError::not_found("appstore.manifest_not_found").param("app", app_key))?;

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
            .map_err(|e| AppError::internal("appstore.manifest_read_failed").with_source(e))?;
        let manifest = serde_yaml::from_str(&yaml_str)
            .map_err(|e| AppError::internal("appstore.manifest_parse_failed").with_source(e))?;
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
    source: AppstoreSource,
    app: Option<AppHandle>,
) -> AppResult<()> {
    task::spawn_blocking(move || sync_existing_repo_blocking(&cache_dir, &settings, &source, app.as_ref()))
        .await
        .map_err(|e| AppError::internal("appstore.sync_join_failed").with_source(e))?
}

async fn git_clone_repo(
    cache_dir: PathBuf,
    settings: AppstoreSettings,
    source: AppstoreSource,
    app: Option<AppHandle>,
) -> AppResult<()> {
    task::spawn_blocking(move || clone_repo_blocking(&cache_dir, &settings, &source, app.as_ref()))
        .await
        .map_err(|e| AppError::internal("appstore.sync_join_failed").with_source(e))?
}

fn sync_existing_repo_blocking(
    cache_dir: &Path,
    settings: &AppstoreSettings,
    source: &AppstoreSource,
    app: Option<&AppHandle>,
) -> AppResult<()> {
    let repo = Repository::open(cache_dir).map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;

    let current_url = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(|url| url.trim().to_string()))
        .unwrap_or_default();
    if current_url != source.repo_url.trim() {
        repo.remote_set_url("origin", source.repo_url.trim())
            .map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;
    }
    let mut remote = repo
        .find_remote("origin")
        .or_else(|_| repo.remote("origin", &source.repo_url))
        .map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;

    let mut fetch_options = build_fetch_options("fetch", settings, app);
    remote
        .fetch(&["HEAD"], Some(&mut fetch_options), None)
        .map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;

    let target = repo
        .revparse_single("FETCH_HEAD")
        .map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;

    repo.reset(&target, ResetType::Hard, None)
        .map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;
    Ok(())
}

fn clone_repo_blocking(
    cache_dir: &Path,
    settings: &AppstoreSettings,
    source: &AppstoreSource,
    app: Option<&AppHandle>,
) -> AppResult<()> {
    let fetch_options = build_fetch_options("clone", settings, app);
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_options);
    builder
        .clone(&source.repo_url, cache_dir)
        .map_err(|e| AppError::unavailable("appstore.sync_failed").with_source(e))?;
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
        sources: default_appstore_sources(),
        proxy_enabled: false,
        proxy_url: "http://127.0.0.1:7890".to_string(),
    }
}

fn normalize_appstore_settings(settings: AppstoreSettings) -> AppstoreSettings {
    let mut sources: Vec<AppstoreSource> = settings.sources.into_iter().map(normalize_appstore_source).collect();
    if sources.is_empty() {
        sources = default_appstore_sources();
    }
    dedupe_source_ids(&mut sources);
    ensure_enabled_source(&mut sources);

    AppstoreSettings {
        sources,
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
    for entry in std::fs::read_dir(path).map_err(|e| AppError::internal("appstore.cache_read_failed").with_source(e))? {
        let entry = entry.map_err(|e| AppError::internal("appstore.cache_entry_failed").with_source(e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| AppError::internal("appstore.cache_stat_failed").with_source(e))?;
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

fn detect_cache_repo_state_blocking(cache_dir: &Path, expected_repo_url: &str) -> AppResult<CacheRepoState> {
    if !cache_dir.exists() {
        return Ok(CacheRepoState::Missing);
    }
    if !cache_dir.join(".git").exists() {
        return Ok(CacheRepoState::ResetRequired);
    }
    let repo = match Repository::open(cache_dir) {
        Ok(repo) => repo,
        Err(_) => return Ok(CacheRepoState::ResetRequired),
    };
    let remote = match repo.find_remote("origin") {
        Ok(remote) => remote,
        Err(_) => return Ok(CacheRepoState::ResetRequired),
    };
    let current_url = remote.url().unwrap_or_default().trim();
    if current_url.is_empty() || current_url != expected_repo_url.trim() {
        return Ok(CacheRepoState::ResetRequired);
    }
    Ok(CacheRepoState::Ready)
}

async fn detect_cache_repo_state(cache_dir: PathBuf, expected_repo_url: &str) -> AppResult<CacheRepoState> {
    let expected_repo_url = expected_repo_url.to_string();
    task::spawn_blocking(move || detect_cache_repo_state_blocking(&cache_dir, &expected_repo_url))
        .await
        .map_err(|e| AppError::internal("appstore.cache_state_join_failed").with_source(e))?
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
        .ok_or_else(|| AppError::internal("appstore.cache_parent_missing"))?;
    let file_name = cache_dir
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::internal("appstore.cache_dir_name_invalid"))?;
    let quarantine_dir = parent.join(format!("{file_name}.stale-{}", Uuid::new_v4()));

    fs::rename(cache_dir, &quarantine_dir).await.map_err(|e| {
        AppError::internal("appstore.cache_recover_rename_failed").with_detail(format!(
            "rename {} -> {}: {}",
            cache_dir.display(),
            quarantine_dir.display(),
            e
        ))
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
                error.detail.unwrap_or(error.code)
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

fn default_appstore_sources() -> Vec<AppstoreSource> {
    vec![
        AppstoreSource {
            id: "1panel".to_string(),
            name: "1Panel".to_string(),
            repo_url: DEFAULT_APPSTORE_1PANEL_REPO_URL.to_string(),
            enabled: true,
        },
        AppstoreSource {
            id: "okxlin".to_string(),
            name: "Okxlin".to_string(),
            repo_url: DEFAULT_APPSTORE_OKXLIN_REPO_URL.to_string(),
            enabled: true,
        },
    ]
}

/// 这些值会被拼进缓存目录路径，必须挡住 `..` 和分隔符，否则能读写缓存目录之外的地方。
fn is_safe_path_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn normalize_appstore_source(source: AppstoreSource) -> AppstoreSource {
    let id = source.id.trim();
    AppstoreSource {
        id: if is_safe_path_component(id) {
            id.to_string()
        } else {
            Uuid::new_v4().to_string()
        },
        name: if source.name.trim().is_empty() {
            "appstore.unnamed_source".to_string()
        } else {
            source.name.trim().to_string()
        },
        repo_url: if source.repo_url.trim().is_empty() {
            DEFAULT_APPSTORE_1PANEL_REPO_URL.to_string()
        } else {
            source.repo_url.trim().to_string()
        },
        enabled: source.enabled,
    }
}

fn dedupe_source_ids(sources: &mut [AppstoreSource]) {
    let mut seen = std::collections::HashSet::new();
    for source in sources.iter_mut() {
        if seen.insert(source.id.clone()) {
            continue;
        }
        source.id = Uuid::new_v4().to_string();
        seen.insert(source.id.clone());
    }
}

fn active_source(settings: &AppstoreSettings) -> AppResult<&AppstoreSource> {
    settings
        .sources
        .iter()
        .find(|source| source.enabled)
        .or_else(|| settings.sources.first())
        .ok_or_else(|| AppError::validation("appstore.source_missing"))
}

fn ensure_enabled_source(sources: &mut [AppstoreSource]) {
    if sources.iter().any(|source| source.enabled) {
        return;
    }
    if let Some(first) = sources.first_mut() {
        first.enabled = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_components() {
        assert!(!is_safe_path_component(".."));
        assert!(!is_safe_path_component("."));
        assert!(!is_safe_path_component(""));
        assert!(!is_safe_path_component("../etc"));
        assert!(!is_safe_path_component("a/b"));
        assert!(!is_safe_path_component("a\\b"));
    }

    #[test]
    fn accepts_normal_app_and_version_names() {
        assert!(is_safe_path_component("nginx"));
        assert!(is_safe_path_component("1.25.3"));
        assert!(is_safe_path_component("my_app-2"));
    }

    #[test]
    fn replaces_unsafe_source_ids() {
        let source = AppstoreSource {
            id: "../../escape".to_string(),
            name: "x".to_string(),
            repo_url: "https://example.com/a.git".to_string(),
            enabled: true,
        };
        let normalized = normalize_appstore_source(source);
        assert!(is_safe_path_component(&normalized.id));
        assert_ne!(normalized.id, "../../escape");
    }
}
