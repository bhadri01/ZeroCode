use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;
use metrics_exporter_prometheus::PrometheusHandle;
use tracing_subscriber::EnvFilter;
use zerocode_core::LanguageRegistry;

mod auth;
mod config;
mod db;
mod error;
mod metrics_layer;
mod routes;
mod state;

use crate::config::ApiConfig;
use crate::state::AppState;

#[derive(Parser, Debug)]
#[command(name = "zerocode-api", about = "ZeroCode HTTP API")]
struct Args {
    #[arg(long, env = "ZEROCODE_API_BIND", default_value = "0.0.0.0:8080")]
    bind: String,

    #[arg(long, env = "DATABASE_URL")]
    database_url: String,

    #[arg(long, env = "ZEROCODE_API_KEY")]
    api_key: String,

    #[arg(
        long,
        env = "ZEROCODE_LANGUAGES_FILE",
        default_value = "runners/languages.toml"
    )]
    languages_file: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let args = Args::parse();
    let prom_handle = init_metrics();

    let cfg = ApiConfig {
        bind: args.bind.clone(),
        database_url: args.database_url.clone(),
        api_key: args.api_key.clone(),
        limit_ceiling: zerocode_core::ResourceLimits {
            cpu_time: 30.0,
            wall_time: 60.0,
            memory_mb: 1024,
            max_pids: 256,
            max_stdout: 256 * 1024,
            max_stderr: 256 * 1024,
            enable_network: false,
        },
    };

    let languages = load_languages(&args.languages_file)?;
    tracing::info!(count = languages.len(), "loaded language registry");

    let state = AppState::connect(cfg, languages, prom_handle)
        .await
        .context("building app state")?;

    db::sync_languages(state.pool(), state.languages())
        .await
        .context("seeding language rows")?;

    let listener = tokio::net::TcpListener::bind(&args.bind)
        .await
        .with_context(|| format!("binding {}", args.bind))?;
    tracing::info!(bind = %args.bind, "zerocode-api listening");

    let router = routes::router(state.clone());

    axum::serve(listener, router.into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")?;

    tracing::info!("zerocode-api stopped cleanly");
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

fn init_metrics() -> PrometheusHandle {
    let builder = metrics_exporter_prometheus::PrometheusBuilder::new();
    let handle = builder.install_recorder().expect("install metrics recorder");

    let collector = metrics_process::Collector::default();
    collector.describe();
    collector.collect();

    metrics::describe_counter!(
        "zerocode_http_requests_total",
        "Total HTTP requests handled"
    );
    metrics::describe_histogram!(
        "zerocode_http_request_duration_seconds",
        "HTTP request latency in seconds"
    );
    metrics::describe_counter!(
        "zerocode_submissions_created_total",
        "Total submissions created"
    );
    metrics::describe_counter!(
        "zerocode_result_cache_hits_total",
        "Result cache hits"
    );
    metrics::describe_counter!(
        "zerocode_result_cache_misses_total",
        "Result cache misses"
    );

    handle
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
    tracing::info!("shutdown signal received, draining");
}
