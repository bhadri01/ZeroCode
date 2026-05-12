use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use zerocode_core::LanguageRegistry;
use zerocode_stream::JobNotifier;

use crate::config::ApiConfig;

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub config: ApiConfig,
    pub pool: PgPool,
    pub languages: LanguageRegistry,
    pub jobs: JobNotifier,
}

impl AppState {
    pub async fn connect(config: ApiConfig, languages: LanguageRegistry) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(16)
            .acquire_timeout(Duration::from_secs(2))
            .connect(&config.database_url)
            .await
            .context("connecting to Postgres")?;

        let jobs = JobNotifier::new(pool.clone());

        Ok(Self(Arc::new(Inner {
            config,
            pool,
            languages,
            jobs,
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
}
