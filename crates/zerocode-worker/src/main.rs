//! ZeroCode worker entrypoint. Phase 0 — listens for SIGTERM, logs heartbeat,
//! exits clean. Phase 1 wires the apalis-sql consumer + the (stubbed) sandbox.
//! Phase 1.5 swaps the stubbed sandbox for `NativeSandbox`.

use std::time::Duration;

use anyhow::{Context, Result};
use clap::Parser;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;
use ulid::Ulid;

#[derive(Parser, Debug)]
#[command(name = "zerocode-worker", about = "ZeroCode sandbox worker")]
struct Args {
    #[arg(long, env = "DATABASE_URL")]
    database_url: String,

    /// Identifier persisted alongside the job claim so a sweeper can attribute
    /// stuck rows to a specific worker process.
    #[arg(long, env = "ZEROCODE_WORKER_ID")]
    worker_id: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let args = Args::parse();
    let worker_id = args
        .worker_id
        .unwrap_or_else(|| format!("worker-{}", Ulid::new()));

    tracing::info!(%worker_id, "zerocode-worker starting");

    let _pool = PgPoolOptions::new()
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(2))
        .connect(&args.database_url)
        .await
        .context("connecting to Postgres")?;

    // Phase 0: idle heartbeat loop so the binary actually does *something*
    // observable until Phase 1 wires the apalis consumer.
    let mut interval = tokio::time::interval(Duration::from_secs(15));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = interval.tick() => {
                tracing::debug!(%worker_id, "idle heartbeat");
            }
            _ = shutdown_signal() => {
                tracing::info!(%worker_id, "shutdown signal received, draining");
                break;
            }
        }
    }

    tracing::info!(%worker_id, "zerocode-worker stopped cleanly");
    Ok(())
}

fn init_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,zerocode=debug")),
        )
        .json()
        .init();
}

async fn shutdown_signal() {
    use tokio::signal;
    let ctrl_c = async {
        signal::ctrl_c().await.expect("install ctrl-c handler");
    };
    #[cfg(unix)]
    let term = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
}
