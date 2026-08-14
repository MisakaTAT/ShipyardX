use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use log::{info, warn};

use crate::dto::port_forward::PortForwardRule;
use crate::error::{AppError, AppResult};

const LOG_TARGET: &str = "shipyardx_lib::services::port_forward";
const RULES_FILE: &str = "port_forwards.json";

const FLUSH_DEBOUNCE: Duration = Duration::from_millis(200);

type Snapshot = Arc<Vec<PortForwardRule>>;

pub(crate) struct PortForwardRuleStore {
    rules: Arc<RwLock<Snapshot>>,
    path: PathBuf,
    dirty_tx: Option<Sender<()>>,
}

pub(crate) fn rules_path(data_file: &Path) -> PathBuf {
    crate::config::store::data_dir_from_file(data_file).join(RULES_FILE)
}

fn lock_error(error: impl std::fmt::Display) -> AppError {
    AppError::internal("port_forward.rules_lock_failed").with_detail(error.to_string())
}

fn read_rules(path: &Path) -> Vec<PortForwardRule> {
    let raw = std::fs::read_to_string(path).unwrap_or_default();
    if raw.trim().is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<Vec<PortForwardRule>>(&raw) {
        Ok(rules) => rules,
        Err(error) => {
            warn!(
                target: LOG_TARGET,
                "port forward rules file unreadable, starting with empty set; path={} error={}",
                path.display(),
                error
            );
            Vec::new()
        }
    }
}

fn write_rules(path: &Path, rules: &[PortForwardRule]) -> AppResult<()> {
    let json = serde_json::to_string_pretty(rules)
        .map_err(|e| AppError::internal("port_forward.rules_serialize_failed").with_source(e))?;
    crate::config::store::atomic_write(path, json.as_bytes())
        .map_err(|e| AppError::internal("port_forward.rules_write_failed").with_detail(e.detail.unwrap_or(e.code)))
}

fn read_snapshot(rules: &RwLock<Snapshot>) -> Snapshot {
    match rules.read() {
        Ok(guard) => Arc::clone(&guard),
        Err(poisoned) => Arc::clone(&poisoned.into_inner()),
    }
}

fn flush_loop(rules: Arc<RwLock<Snapshot>>, path: PathBuf, dirty_rx: Receiver<()>) {
    while dirty_rx.recv().is_ok() {
        while dirty_rx.recv_timeout(FLUSH_DEBOUNCE).is_ok() {}
        if let Err(error) = write_rules(&path, &read_snapshot(&rules)) {
            warn!(
                target: LOG_TARGET,
                "port forward rules flush failed; path={} error={} detail={:?}",
                path.display(),
                error,
                error.detail
            );
        }
    }
}

impl PortForwardRuleStore {
    pub(crate) fn load(data_file: &Path) -> Self {
        let path = rules_path(data_file);
        let loaded = read_rules(&path);
        info!(
            target: LOG_TARGET,
            "port forward rules loaded; count={} path={}",
            loaded.len(),
            path.display()
        );

        let rules = Arc::new(RwLock::new(Arc::new(loaded)));
        let (tx, dirty_rx) = mpsc::channel::<()>();
        let spawned = {
            let rules = Arc::clone(&rules);
            let path = path.clone();
            std::thread::Builder::new()
                .name("shipyardx-pf-rules".into())
                .spawn(move || flush_loop(rules, path, dirty_rx))
        };

        let dirty_tx = match spawned {
            Ok(_) => Some(tx),
            Err(error) => {
                warn!(
                    target: LOG_TARGET,
                    "port forward rules flush thread unavailable, falling back to inline writes; error={}",
                    error
                );
                None
            }
        };

        Self { rules, path, dirty_tx }
    }

    pub(crate) fn snapshot(&self) -> AppResult<Snapshot> {
        let guard = self.rules.read().map_err(lock_error)?;
        Ok(Arc::clone(&guard))
    }

    pub(crate) fn mutate<R>(&self, edit: impl FnOnce(&mut Vec<PortForwardRule>) -> AppResult<R>) -> AppResult<R> {
        let (result, updated) = {
            let mut guard = self.rules.write().map_err(lock_error)?;
            let mut next = (**guard).clone();
            let result = edit(&mut next)?;
            let updated = Arc::new(next);
            *guard = Arc::clone(&updated);
            (result, updated)
        };

        match self.dirty_tx.as_ref() {
            Some(tx) => {
                let _ = tx.send(());
            }
            None => {
                if let Err(error) = write_rules(&self.path, &updated) {
                    warn!(
                        target: LOG_TARGET,
                        "port forward rules inline write failed; error={} detail={:?}",
                        error,
                        error.detail
                    );
                }
            }
        }

        Ok(result)
    }

    pub(crate) fn mutate_durable<R>(
        &self,
        edit: impl FnOnce(&mut Vec<PortForwardRule>) -> AppResult<R>,
    ) -> AppResult<R> {
        let result = self.mutate(edit)?;
        self.flush_now()?;
        Ok(result)
    }

    pub(crate) fn flush_now(&self) -> AppResult<()> {
        write_rules(&self.path, &self.snapshot()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str, local_port: u16) -> PortForwardRule {
        PortForwardRule {
            id: id.to_string(),
            server_id: "srv".to_string(),
            container_id: "ctr".to_string(),
            container_name: None,
            enabled: true,
            protocol: "tcp".to_string(),
            container_port: 80,
            remote_host: "127.0.0.1".to_string(),
            remote_port: 80,
            local_port,
            bind_address: "127.0.0.1".to_string(),
        }
    }

    fn store_in(dir: &Path) -> PortForwardRuleStore {
        PortForwardRuleStore::load(&dir.join("servers.json"))
    }

    #[test]
    fn starts_empty_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(store_in(dir.path()).snapshot().unwrap().is_empty());
    }

    #[test]
    fn mutate_swaps_snapshot_without_touching_previous() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(dir.path());
        let before = store.snapshot().unwrap();

        store
            .mutate(|rules| {
                rules.push(sample("a", 8080));
                Ok(())
            })
            .unwrap();

        assert!(before.is_empty());
        assert_eq!(store.snapshot().unwrap().len(), 1);
    }

    #[test]
    fn failed_edit_leaves_snapshot_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let store = store_in(dir.path());
        store
            .mutate(|rules| {
                rules.push(sample("a", 8080));
                Ok(())
            })
            .unwrap();

        let failed = store.mutate(|rules| {
            rules.push(sample("b", 9090));
            Err::<(), _>(AppError::conflict("port_forward.local_port_conflict").param("port", 9090))
        });

        assert!(failed.is_err());
        let rules = store.snapshot().unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].id, "a");
    }

    #[test]
    fn durable_mutation_round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let data_file = dir.path().join("servers.json");

        let store = PortForwardRuleStore::load(&data_file);
        store
            .mutate_durable(|rules| {
                rules.push(sample("a", 8080));
                Ok(())
            })
            .unwrap();
        drop(store);

        let reloaded = PortForwardRuleStore::load(&data_file);
        let rules = reloaded.snapshot().unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].local_port, 8080);
    }

    #[test]
    fn corrupt_file_does_not_panic() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(rules_path(&dir.path().join("servers.json")), b"{ not json").unwrap();
        assert!(store_in(dir.path()).snapshot().unwrap().is_empty());
    }
}
