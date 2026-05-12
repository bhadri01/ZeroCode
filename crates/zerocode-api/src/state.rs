use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

use crate::config::ApiConfig;

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub config: ApiConfig,
    pub pool: PgPool,
}

impl AppState {
    pub async fn connect(config: ApiConfig) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(16)
            .acquire_timeout(Duration::from_secs(2))
            .connect(&config.database_url)
            .await
            .context("connecting to Postgres")?;

        Ok(Self(Arc::new(Inner { config, pool })))
    }

    pub fn config(&self) -> &ApiConfig {
        &self.0.config
    }

    pub fn pool(&self) -> &PgPool {
        &self.0.pool
    }
}
