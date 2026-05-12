use std::sync::Arc;
use std::time::Duration;

use moka::future::Cache;
use serde::{Deserialize, Serialize};

use crate::key::CacheKey;

/// What we store per hit. Intentionally compact — no full `Submission` to keep
/// memory bounded; the API rehydrates the response shape from these fields +
/// the original request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedOutcome {
    pub status_json: serde_json::Value,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub compile_output: Option<Vec<u8>>,
    pub exit_code: Option<i32>,
    pub cpu_time: f64,
    pub wall_time: f64,
    pub memory_kb: u32,
}

#[derive(Clone)]
pub struct ResultCache {
    inner: Arc<Cache<[u8; 32], CachedOutcome>>,
}

impl ResultCache {
    pub fn new(capacity: u64, ttl: Duration) -> Self {
        let inner = Cache::builder()
            .max_capacity(capacity)
            .time_to_live(ttl)
            .build();
        Self {
            inner: Arc::new(inner),
        }
    }

    pub async fn get(&self, key: &CacheKey) -> Option<CachedOutcome> {
        self.inner.get(key.as_bytes()).await
    }

    pub async fn insert(&self, key: CacheKey, value: CachedOutcome) {
        self.inner.insert(*key.as_bytes(), value).await;
    }

    pub async fn invalidate(&self, key: &CacheKey) {
        self.inner.invalidate(key.as_bytes()).await;
    }

    pub fn entry_count(&self) -> u64 {
        self.inner.entry_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zerocode_core::ResourceLimits;

    #[tokio::test]
    async fn cache_round_trip() {
        let cache = ResultCache::new(100, Duration::from_secs(60));
        let key = CacheKey::result(71, b"print(1)", b"", &ResourceLimits::default());
        assert!(cache.get(&key).await.is_none());

        let outcome = CachedOutcome {
            status_json: serde_json::json!({ "kind": "accepted" }),
            stdout: b"1\n".to_vec(),
            stderr: vec![],
            compile_output: None,
            exit_code: Some(0),
            cpu_time: 0.012,
            wall_time: 0.014,
            memory_kb: 8192,
        };
        cache.insert(key, outcome.clone()).await;

        let fetched = cache.get(&key).await.unwrap();
        assert_eq!(fetched.stdout, outcome.stdout);
        assert_eq!(fetched.exit_code, Some(0));
    }
}
