use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

use anyhow::{Context, Result};
use metrics_exporter_prometheus::PrometheusHandle;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use zerocode_cache::ResultCache;
use zerocode_core::LanguageRegistry;
use zerocode_stream::JobNotifier;

use crate::config::ApiConfig;

const RESULT_CACHE_CAPACITY: u64 = 10_000;
const RESULT_CACHE_TTL: Duration = Duration::from_secs(5 * 60);

// Connection pool sizing. Two pools share the same Postgres:
//   - query pool: short-lived SELECT/INSERT/UPDATE — connections held for ms.
//   - listener pool: LISTEN connections for `?wait=true` + SSE streaming, each
//     held for the connection's lifetime (up to WAIT_TIMEOUT, or the whole SSE
//     session). Isolating these stops long-lived LISTENs from starving the
//     query pool (the old single-pool design 500'd past ~16 concurrent waiters).
// IMPORTANT: query + listener + the worker's pool must stay under Postgres
// `max_connections` (default 100). Defaults below total 72; raise both envs
// AND Postgres max_connections together on a larger DB.
const DEFAULT_DB_POOL: u32 = 24;
const DEFAULT_LISTENER_POOL: u32 = 48;

fn env_pool(var: &str, default: u32, min: u32) -> u32 {
    std::env::var(var)
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(default)
        .max(min)
}

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub config: ApiConfig,
    pub pool: PgPool,
    pub listener_pool: PgPool,
    pub languages: LanguageRegistry,
    pub jobs: JobNotifier,
    pub result_cache: ResultCache,
    pub prom_handle: PrometheusHandle,
    // Cached queue depth refreshed by a background task (main.rs) so the submit
    // hot path can shed load with an atomic read instead of a COUNT per request.
    pub queue_depth: Arc<AtomicI64>,
    // Submit-time load-shed threshold; 0 disables. Below the readiness gate so
    // the API starts shedding new work before it flips out of the LB rotation.
    pub submit_queue_limit: i64,
}

impl AppState {
    pub async fn connect(
        config: ApiConfig,
        languages: LanguageRegistry,
        prom_handle: PrometheusHandle,
    ) -> Result<Self> {
        let db_max = env_pool("ZEROCODE_DB_POOL", DEFAULT_DB_POOL, 4);
        let listener_max = env_pool("ZEROCODE_LISTENER_POOL", DEFAULT_LISTENER_POOL, 4);

        let pool = PgPoolOptions::new()
            .max_connections(db_max)
            .acquire_timeout(Duration::from_secs(5))
            .connect(&config.database_url)
            .await
            .context("connecting to Postgres (query pool)")?;

        // Dedicated pool for LISTEN connections. Opened lazily (idle cost ~0)
        // and closed after idle_timeout so a traffic burst doesn't leave 48
        // connections pinned. acquire_timeout is short: when every listener
        // slot is busy, callers fail fast and fall back to polling rather than
        // blocking — see wait_for_completion / streaming.
        let listener_pool = PgPoolOptions::new()
            .max_connections(listener_max)
            .acquire_timeout(Duration::from_secs(2))
            .idle_timeout(Duration::from_secs(60))
            .max_lifetime(Duration::from_secs(30 * 60))
            .connect_lazy(&config.database_url)
            .context("configuring Postgres listener pool")?;

        tracing::info!(query_pool = db_max, listener_pool = listener_max, "db pools configured");

        let jobs = JobNotifier::new(pool.clone());
        let result_cache = ResultCache::new(RESULT_CACHE_CAPACITY, RESULT_CACHE_TTL);

        let submit_queue_limit = std::env::var("ZEROCODE_SUBMIT_QUEUE_LIMIT")
            .ok()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(5000);

        Ok(Self(Arc::new(Inner {
            config,
            pool,
            listener_pool,
            languages,
            jobs,
            result_cache,
            prom_handle,
            queue_depth: Arc::new(AtomicI64::new(0)),
            submit_queue_limit,
        })))
    }

    pub fn config(&self) -> &ApiConfig {
        &self.0.config
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
    }

    /// Dedicated pool for long-lived LISTEN connections (`?wait=true` + SSE),
    /// kept separate from the query pool so they don't starve each other.
    pub fn listener_pool(&self) -> &PgPool {
        &self.0.listener_pool
    }

    pub fn languages(&self) -> &LanguageRegistry {
        &self.0.languages
    }

    pub fn jobs(&self) -> &JobNotifier {
        &self.0.jobs
    }

    pub fn result_cache(&self) -> &ResultCache {
        &self.0.result_cache
    }

    pub fn prom_handle(&self) -> &PrometheusHandle {
        &self.0.prom_handle
    }

    /// Shared cell the background refresher writes the latest queue depth into.
    pub fn queue_depth_cell(&self) -> Arc<AtomicI64> {
        self.0.queue_depth.clone()
    }

    /// Last sampled queue depth (cheap atomic read; refreshed ~1s).
    pub fn cached_queue_depth(&self) -> i64 {
        self.0.queue_depth.load(Ordering::Relaxed)
    }

    /// Submit-time backpressure threshold (0 = disabled).
    pub fn submit_queue_limit(&self) -> i64 {
        self.0.submit_queue_limit
    }
}
