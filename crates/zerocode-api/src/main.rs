use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;
use metrics_exporter_prometheus::PrometheusHandle;
use zerocode_core::LanguageRegistry;

mod config;
mod db;
mod error;
mod metrics_layer;
mod openapi;
mod routes;
mod state;
mod telemetry;

use crate::config::ApiConfig;
use crate::state::AppState;

#[derive(Parser, Debug)]
#[command(name = "zerocode-api", about = "ZeroCode HTTP API")]
struct Args {
    #[arg(long, env = "ZEROCODE_API_BIND", default_value = "0.0.0.0:8080")]
    bind: String,

    #[arg(long, env = "DATABASE_URL")]
    database_url: String,

    #[arg(
        long,
        env = "ZEROCODE_LANGUAGES_FILE",
        default_value = "runners/languages.toml"
    )]
    languages_file: PathBuf,

    /// Per-IP request budget (refill rate, requests/second) for the
    /// `tower_governor` layer applied to submission routes.
    #[arg(long, env = "ZEROCODE_GOVERNOR_RPS", default_value_t = 100)]
    governor_rps: u32,

    /// Per-IP request budget (bucket size) for the `tower_governor` layer.
    #[arg(long, env = "ZEROCODE_GOVERNOR_BURST", default_value_t = 100)]
    governor_burst: u32,

    /// Directory to serve as static fallback (landing, playground, docs).
    /// Set to an empty string to disable static serving. Built by the
    /// `web/` workspace; assemble via `pnpm --dir web build`.
    #[arg(long, env = "ZEROCODE_WEB_DIR", default_value = "web/dist")]
    web_dir: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init().context("init telemetry")?;
    let args = Args::parse();
    let prom_handle = init_metrics();

    let cfg = ApiConfig {
        bind: args.bind.clone(),
        database_url: args.database_url.clone(),
        limit_ceiling: zerocode_core::ResourceLimits {
            cpu_time: 30.0,
            wall_time: 60.0,
            // 2048 MB ceiling: the .NET SDK (dotnet build / fsi) needs more than
            // 1 GB to initialize CoreCLR + MSBuild; the JVM/heavy compilers are
            // comfortable well under this. Per-submission usage is still bounded
            // by each language's default_limits (and any client override).
            memory_mb: 2048,
            max_pids: 256,
            max_stdout: 256 * 1024,
            max_stderr: 256 * 1024,
            enable_network: false,
        },
        governor_rps: args.governor_rps,
        governor_burst: args.governor_burst,
        web_dir: resolve_web_dir(&args.web_dir),
    };

    let languages = load_languages(&args.languages_file)?;
    tracing::info!(count = languages.len(), "loaded language registry");

    let state = AppState::connect(cfg, languages, prom_handle)
        .await
        .context("building app state")?;

    db::sync_languages(state.pool(), state.languages())
        .await
        .context("seeding language rows")?;

    // Background queue-depth sampler: one cheap COUNT/sec feeds an atomic the
    // submit hot path reads for load shedding (no per-request COUNT). Exits with
    // the process on graceful shutdown.
    {
        let pool = state.pool().clone();
        let cell = state.queue_depth_cell();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                tick.tick().await;
                if let Ok(d) = db::queue_depth(&pool).await {
                    cell.store(d, std::sync::atomic::Ordering::Relaxed);
                    metrics::gauge!("zerocode_queue_depth").set(d as f64);
                }
            }
        });
    }

    let listener = tokio::net::TcpListener::bind(&args.bind)
        .await
        .with_context(|| format!("binding {}", args.bind))?;
    tracing::info!(bind = %args.bind, "zerocode-api listening");

    let router = routes::router(state.clone());

    // `into_make_service_with_connect_info` attaches `ConnectInfo<SocketAddr>`
    // to every request. `tower_governor`'s default `PeerIpKeyExtractor` needs
    // it to derive the rate-limit bucket; without it every authenticated
    // request fails with `Unable To Extract Key!`.
    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("REST server error")?;

    tracing::info!("zerocode-api stopped cleanly");
    telemetry::shutdown(());
    Ok(())
}

/// Resolve the static-web directory at startup. An empty value disables the
/// mount entirely; a non-empty value that doesn't exist on disk is logged and
/// disabled so a misconfiguration doesn't block API startup.
fn resolve_web_dir(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        tracing::info!("static web dir disabled (ZEROCODE_WEB_DIR empty)");
        return None;
    }
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        tracing::warn!(path = %path.display(), "ZEROCODE_WEB_DIR not found — static serving disabled");
        return None;
    }
    tracing::info!(path = %path.display(), "serving static web fallback");
    Some(path)
}

fn load_languages(path: &std::path::Path) -> Result<LanguageRegistry> {
    let toml = std::fs::read_to_string(path)
        .with_context(|| format!("reading languages file at {path:?}"))?;
    LanguageRegistry::from_toml(&toml).map_err(|e| anyhow::anyhow!(e))
}

fn init_metrics() -> PrometheusHandle {
    let builder = metrics_exporter_prometheus::PrometheusBuilder::new();
    let handle = builder
        .install_recorder()
        .expect("install metrics recorder");

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
    metrics::describe_counter!("zerocode_result_cache_hits_total", "Result cache hits");
    metrics::describe_counter!("zerocode_result_cache_misses_total", "Result cache misses");

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
