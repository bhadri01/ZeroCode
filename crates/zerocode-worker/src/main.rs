use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use clap::Parser;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::Notify;
use ulid::Ulid;
use zerocode_core::LanguageRegistry;

mod db;
mod metrics;
mod queue_depth;
mod reaper;
mod retention;
mod runner;
mod sandbox_select;
mod sweeper;
mod telemetry;
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

    /// Bind address for the /metrics Prometheus endpoint.
    #[arg(
        long,
        env = "ZEROCODE_WORKER_METRICS_BIND",
        default_value = "0.0.0.0:9090"
    )]
    metrics_bind: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init().context("init telemetry")?;
    let args = Args::parse();
    let worker_id = args
        .worker_id
        .clone()
        .unwrap_or_else(|| format!("worker-{}", Ulid::new()));

    tracing::info!(%worker_id, "zerocode-worker starting");

    let prom_handle = metrics::init();
    ::metrics::gauge!("zerocode_worker_parallelism").set(0.0);

    // Install ourselves as the subreaper before spawning any children so
    // orphaned grandchildren reparent here instead of to PID 1.
    if let Err(e) = reaper::install_subreaper() {
        tracing::warn!(error = %e, "could not install subreaper; orphans may leak");
    }

    let parallelism = args.max_parallel.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(2)
    });

    // Pool must cover: 1 long-lived job LISTEN connection + up to `parallelism`
    // concurrent jobs each doing claim/publish/write queries. The old fixed 4
    // left only 3 for `parallelism` jobs once the listener took one. Default to
    // parallelism + 4 of headroom; override with ZEROCODE_WORKER_DB_POOL.
    let worker_db_pool: u32 = std::env::var("ZEROCODE_WORKER_DB_POOL")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or((parallelism as u32) + 4)
        .max(4);

    let pool = PgPoolOptions::new()
        .max_connections(worker_db_pool)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&args.database_url)
        .await
        .context("connecting to Postgres")?;
    tracing::info!(worker_db_pool, parallelism, "worker db pool configured");

    let languages = load_languages(&args.languages_file)?;
    tracing::info!(count = languages.len(), "loaded language registry");

    // Sandbox selection also runs kernel_check::preflight() on `--features native`,
    // failing fast if the host is missing cgroup v2, landlock, or user namespaces.
    let sandbox = sandbox_select::pick().context("constructing sandbox")?;

    let webhook_secret = args.webhook_secret.clone().unwrap_or_default();

    // Memory budget for concurrent sandboxes. The CPU-count semaphore bounds how
    // MANY jobs run; this bounds their summed memory_limit so a burst of heavy
    // JVM/.NET jobs (256MB–1GB each) can't OOM the host. Defaults to 60% of
    // MemAvailable; override with ZEROCODE_MEMORY_BUDGET_MB.
    let memory_budget_mb: u32 = std::env::var("ZEROCODE_MEMORY_BUDGET_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(default_memory_budget_mb);
    ::metrics::gauge!("zerocode_memory_budget_mb").set(memory_budget_mb as f64);
    tracing::info!(memory_budget_mb, "sandbox memory budget configured");

    let runner = Runner::new(
        pool.clone(),
        worker_id.clone(),
        languages,
        sandbox,
        parallelism,
        memory_budget_mb,
        webhook_secret,
    );
    // Lower the worker's OOM score so the kernel preferentially kills sandbox
    // children rather than the worker process under host memory pressure.
    reaper::set_oom_score_adj();

    ::metrics::gauge!("zerocode_worker_parallelism").set(parallelism as f64);

    let runner_shutdown = runner.shutdown_handle();
    let sweeper_shutdown = Arc::new(Notify::new());
    let reaper_shutdown = Arc::new(Notify::new());
    let retention_shutdown = Arc::new(Notify::new());
    let metrics_shutdown = Arc::new(Notify::new());
    let queue_depth_shutdown = Arc::new(Notify::new());

    let retention_config = retention::RetentionConfig::from_env();

    let runner_handle = tokio::spawn(runner.run());
    let sweeper_handle = tokio::spawn(sweeper::run(pool.clone(), sweeper_shutdown.clone()));
    let reaper_handle = tokio::spawn(reaper::run(reaper_shutdown.clone()));
    let retention_handle = tokio::spawn(retention::run(
        pool.clone(),
        retention_config,
        retention_shutdown.clone(),
    ));
    let metrics_handle = tokio::spawn(metrics::serve(
        args.metrics_bind.clone(),
        prom_handle,
        metrics_shutdown.clone(),
    ));
    let queue_depth_handle = tokio::spawn(queue_depth::run(
        pool.clone(),
        queue_depth_shutdown.clone(),
    ));

    shutdown_signal().await;
    tracing::info!(%worker_id, "shutdown signal received, draining");
    runner_shutdown.notify_waiters();
    sweeper_shutdown.notify_waiters();
    reaper_shutdown.notify_waiters();
    retention_shutdown.notify_waiters();
    metrics_shutdown.notify_waiters();
    queue_depth_shutdown.notify_waiters();

    if let Err(e) = runner_handle.await {
        tracing::error!(error = %e, "runner task join failed");
    }
    if let Err(e) = sweeper_handle.await {
        tracing::error!(error = %e, "sweeper task join failed");
    }
    if let Err(e) = reaper_handle.await {
        tracing::error!(error = %e, "reaper task join failed");
    }
    if let Err(e) = retention_handle.await {
        tracing::error!(error = %e, "retention task join failed");
    }
    if let Err(e) = metrics_handle.await {
        tracing::error!(error = %e, "metrics task join failed");
    }
    if let Err(e) = queue_depth_handle.await {
        tracing::error!(error = %e, "queue_depth task join failed");
    }

    tracing::info!(%worker_id, "zerocode-worker stopped cleanly");
    telemetry::shutdown(());
    Ok(())
}

/// 60% of MemAvailable (MB), floored at 1024. Falls back to 2048 if
/// /proc/meminfo can't be read (e.g. non-Linux dev host).
fn default_memory_budget_mb() -> u32 {
    let avail_kb = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|s| {
            s.lines().find_map(|l| {
                l.strip_prefix("MemAvailable:")?
                    .split_whitespace()
                    .next()?
                    .parse::<u64>()
                    .ok()
            })
        })
        .unwrap_or(0);
    let mb = avail_kb / 1024;
    if mb == 0 {
        2048
    } else {
        ((mb * 6 / 10) as u32).max(1024)
    }
}

fn load_languages(path: &std::path::Path) -> Result<LanguageRegistry> {
    let toml = std::fs::read_to_string(path)
        .with_context(|| format!("reading languages file at {path:?}"))?;
    LanguageRegistry::from_toml(&toml).map_err(|e| anyhow::anyhow!(e))
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
