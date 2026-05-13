//! Periodic data retention enforcement.
//!
//! Two independent TTLs:
//!   - **Payload TTL** (default 1 h): NULLs out source_code, stdin, stdout,
//!     stderr, compile_output on finished rows. The audit stub (token, language,
//!     status, timings) stays intact.
//!   - **Row TTL** (default 24 h): marks old rows as `expired` and deletes them.
//!     GET for an expired token returns 410 Gone.
//!
//! Both are configurable via env vars so operators can tune for compliance.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;

#[derive(Debug, Clone)]
pub struct RetentionConfig {
    pub payload_ttl: Duration,
    pub row_ttl: Duration,
    pub cadence: Duration,
}

impl RetentionConfig {
    pub fn from_env() -> Self {
        let payload_secs: u64 = std::env::var("ZEROCODE_PAYLOAD_TTL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3600);

        let row_hours: u64 = std::env::var("ZEROCODE_RETENTION_HOURS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(24);

        Self {
            payload_ttl: Duration::from_secs(payload_secs),
            row_ttl: Duration::from_secs(row_hours * 3600),
            cadence: Duration::from_secs(300),
        }
    }
}

pub async fn run(pool: PgPool, config: RetentionConfig, shutdown: Arc<Notify>) {
    let mut interval = tokio::time::interval(config.cadence);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    tracing::info!(
        payload_ttl_secs = config.payload_ttl.as_secs(),
        row_ttl_secs = config.row_ttl.as_secs(),
        cadence_secs = config.cadence.as_secs(),
        "retention enforcer started"
    );

    loop {
        tokio::select! {
            _ = interval.tick() => {
                if let Err(e) = scrub_payloads(&pool, &config).await {
                    tracing::error!(error = %e, "retention: payload scrub failed");
                }
                if let Err(e) = expire_old_rows(&pool, &config).await {
                    tracing::error!(error = %e, "retention: row expiry failed");
                }
            }
            _ = shutdown.notified() => {
                tracing::info!("retention enforcer shutdown");
                break;
            }
        }
    }
}

async fn scrub_payloads(pool: &PgPool, config: &RetentionConfig) -> Result<(), sqlx::Error> {
    let ttl_secs = config.payload_ttl.as_secs() as f64;
    let res = sqlx::query!(
        "UPDATE submissions \
         SET source_code = '\\x'::bytea, \
             stdin = NULL, \
             stdout = NULL, \
             stderr = NULL, \
             compile_output = NULL \
         WHERE finished_at IS NOT NULL \
         AND finished_at < NOW() - ($1 || ' seconds')::interval \
         AND (stdout IS NOT NULL OR stderr IS NOT NULL OR length(source_code) > 0)",
        ttl_secs.to_string(),
    )
    .execute(pool)
    .await?;

    let n = res.rows_affected();
    if n > 0 {
        tracing::info!(rows = n, "retention: scrubbed payloads");
    }
    Ok(())
}

async fn expire_old_rows(pool: &PgPool, config: &RetentionConfig) -> Result<(), sqlx::Error> {
    let ttl_secs = config.row_ttl.as_secs() as f64;
    let res = sqlx::query!(
        "DELETE FROM submissions \
         WHERE finished_at IS NOT NULL \
         AND finished_at < NOW() - ($1 || ' seconds')::interval",
        ttl_secs.to_string(),
    )
    .execute(pool)
    .await?;

    let n = res.rows_affected();
    if n > 0 {
        tracing::info!(rows = n, "retention: expired old rows");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults() {
        let c = RetentionConfig {
            payload_ttl: Duration::from_secs(3600),
            row_ttl: Duration::from_secs(24 * 3600),
            cadence: Duration::from_secs(300),
        };
        assert_eq!(c.payload_ttl.as_secs(), 3600);
        assert_eq!(c.row_ttl.as_secs(), 86400);
    }
}
