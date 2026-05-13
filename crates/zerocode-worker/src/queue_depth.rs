//! Periodic queue-depth probe.
//!
//! Polls `SELECT count(*) FROM submissions WHERE status = 'queued'` every
//! 5 s and publishes the result as the `zerocode_pending_jobs` gauge. The
//! gauge is the primary auto-scaling input — combined with
//! `zerocode_worker_parallelism` and `zerocode_active_sandboxes` (already
//! exposed) a scheduler can compute:
//!
//!   utilisation = active_sandboxes / parallelism
//!   queue_ratio = pending_jobs / (parallelism × worker_count)
//!
//! and trigger horizontal scale-up when `queue_ratio > 1` (queue cannot drain
//! within one wall-time budget) and scale-down when sustained
//! `utilisation < 0.25` AND `pending_jobs == 0`.
//!
//! Lives in the worker rather than the API so a single deployment can scale
//! workers up and down without keeping a stateful counter in the API.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

pub async fn run(pool: PgPool, shutdown: Arc<Notify>) {
    let mut tick = tokio::time::interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = tick.tick() => {
                if let Err(e) = sample_and_publish(&pool).await {
                    tracing::warn!(error = %e, "queue_depth: probe failed");
                }
            }
            _ = shutdown.notified() => {
                tracing::info!("queue_depth: shutdown signal received");
                break;
            }
        }
    }
}

async fn sample_and_publish(pool: &PgPool) -> Result<(), sqlx::Error> {
    let n: i64 = sqlx::query_scalar!(
        "SELECT count(*)::bigint AS \"n!\" FROM submissions WHERE status = 'queued'"
    )
    .fetch_one(pool)
    .await?;

    ::metrics::gauge!("zerocode_pending_jobs").set(n as f64);
    Ok(())
}
