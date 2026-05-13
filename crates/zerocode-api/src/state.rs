use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use metrics_exporter_prometheus::PrometheusHandle;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use zerocode_cache::ResultCache;
use zerocode_core::LanguageRegistry;
use zerocode_stream::JobNotifier;

use crate::anon_quota::AnonymousQuota;
use crate::config::ApiConfig;

const RESULT_CACHE_CAPACITY: u64 = 10_000;
const RESULT_CACHE_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub config: ApiConfig,
    pub pool: PgPool,
    pub languages: LanguageRegistry,
    pub jobs: JobNotifier,
    pub result_cache: ResultCache,
    pub prom_handle: PrometheusHandle,
    pub anon_quota: AnonymousQuota,
}

impl AppState {
    pub async fn connect(
        config: ApiConfig,
        languages: LanguageRegistry,
        prom_handle: PrometheusHandle,
    ) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(16)
            .acquire_timeout(Duration::from_secs(2))
            .connect(&config.database_url)
            .await
            .context("connecting to Postgres")?;

        let jobs = JobNotifier::new(pool.clone());
        let result_cache = ResultCache::new(RESULT_CACHE_CAPACITY, RESULT_CACHE_TTL);
        let anon_quota =
            AnonymousQuota::new(config.anon_max_per_window, config.anon_window);

        Ok(Self(Arc::new(Inner {
            config,
            pool,
            languages,
            jobs,
            result_cache,
            prom_handle,
            anon_quota,
        })))
    }

    pub fn config(&self) -> &ApiConfig {
        &self.0.config
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
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

    pub fn anon_quota(&self) -> &AnonymousQuota {
        &self.0.anon_quota
    }
}
