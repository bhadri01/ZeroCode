//! Background sweeper. Resets rows whose worker died mid-execution back to
//! `queued` so another worker can pick them up. Runs every 30s.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;
use tokio::sync::Notify;

use crate::db;

pub async fn run(pool: PgPool, shutdown: Arc<Notify>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = interval.tick() => {
                match db::sweep_stale(&pool).await {
                    Ok(0) => {}
                    Ok(n) => tracing::warn!(rows = n, "swept stuck submissions back to queued"),
                    Err(e) => tracing::error!(error = %e, "sweeper failed"),
                }
            }
            _ = shutdown.notified() => {
                tracing::info!("sweeper shutdown");
                break;
            }
        }
    }
}
