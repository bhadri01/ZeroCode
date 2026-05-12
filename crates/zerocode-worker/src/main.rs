use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use clap::Parser;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::Notify;
use tracing_subscriber::EnvFilter;
use ulid::Ulid;
use zerocode_core::LanguageRegistry;

mod db;
mod reaper;
mod runner;
mod sandbox_select;
mod sweeper;
mod webhook;

use crate::runner::Runner;

#[derive(Parser, Debug)]
#[command(name = "zerocode-worker", about = "ZeroCode sandbox worker")]
struct Args {
    #[arg(long, env = "DATABASE_URL")]
    database_url: String,

    /// Identifier persisted alongside the job claim so a sweeper can attribute
    /// stuck rows to a specific worker process.
    #[arg(long, env = "ZEROCODE_WORKER_ID")]
    worker_id: Option<String>,

    #[arg(
        long,
        env = "ZEROCODE_LANGUAGES_FILE",
        default_value = "runners/languages.toml"
    )]
    languages_file: PathBuf,

    /// Maximum concurrent sandboxed children. Default = num_cpus.
    #[arg(long, env = "ZEROCODE_MAX_PARALLEL")]
    max_parallel: Option<usize>,

    /// Secret for HMAC-SHA256 webhook signatures. If unset, webhooks are
    /// delivered without a signature (dev only).
    #[arg(long, env = "ZEROCODE_WEBHOOK_SECRET")]
    webhook_secret: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let args = Args::parse();
    let worker_id = args
        .worker_id
        .clone()
        .unwrap_or_else(|| format!("worker-{}", Ulid::new()));

    tracing::info!(%worker_id, "zerocode-worker starting");

    // Install ourselves as the subreaper before spawning any children so
    // orphaned grandchildren reparent here instead of to PID 1.
    if let Err(e) = reaper::install_subreaper() {
        tracing::warn!(error = %e, "could not install subreaper; orphans may leak");
    }

    let pool = PgPoolOptions::new()
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(2))
        .connect(&args.database_url)
        .await
        .context("connecting to Postgres")?;

    let languages = load_languages(&args.languages_file)?;
    tracing::info!(count = languages.len(), "loaded language registry");

    let sandbox = sandbox_select::pick().context("constructing sandbox")?;

    let parallelism = args
        .max_parallel
        .unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2));

    let webhook_secret = args.webhook_secret.clone().unwrap_or_default();

    let runner = Runner::new(
        pool.clone(),
        worker_id.clone(),
        languages,
        sandbox,
        parallelism,
        webhook_secret,
    );
    let runner_shutdown = runner.shutdown_handle();
    let sweeper_shutdown = Arc::new(Notify::new());
    let reaper_shutdown = Arc::new(Notify::new());

    let runner_handle = tokio::spawn(runner.run());
    let sweeper_handle = tokio::spawn(sweeper::run(pool.clone(), sweeper_shutdown.clone()));
    let reaper_handle = tokio::spawn(reaper::run(reaper_shutdown.clone()));

    shutdown_signal().await;
    tracing::info!(%worker_id, "shutdown signal received, draining");
    runner_shutdown.notify_waiters();
    sweeper_shutdown.notify_waiters();
    reaper_shutdown.notify_waiters();

    if let Err(e) = runner_handle.await {
        tracing::error!(error = %e, "runner task join failed");
    }
    if let Err(e) = sweeper_handle.await {
        tracing::error!(error = %e, "sweeper task join failed");
    }
    if let Err(e) = reaper_handle.await {
        tracing::error!(error = %e, "reaper task join failed");
    }

    tracing::info!(%worker_id, "zerocode-worker stopped cleanly");
    Ok(())
}

fn load_languages(path: &std::path::Path) -> Result<LanguageRegistry> {
    let toml = std::fs::read_to_string(path)
        .with_context(|| format!("reading languages file at {path:?}"))?;
    LanguageRegistry::from_toml(&toml).map_err(|e| anyhow::anyhow!(e))
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
