use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;
use metrics_exporter_prometheus::PrometheusHandle;
use zerocode_core::LanguageRegistry;

mod anon_quota;
mod auth;
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

    #[arg(long, env = "ZEROCODE_API_KEY")]
    api_key: String,

    #[arg(
        long,
        env = "ZEROCODE_LANGUAGES_FILE",
        default_value = "runners/languages.toml"
    )]
    languages_file: PathBuf,

    /// Comma-separated list of browser origins permitted to call the API.
    /// Empty disables CORS (same-origin only). Use `*` for fully public access
    /// (only safe with `--allow-anonymous`).
    #[arg(long, env = "ZEROCODE_CORS_ORIGINS", default_value = "")]
    cors_origins: String,

    /// When set, requests without an `Authorization` header are admitted and
    /// rate-limited as anonymous. Required for the hosted playground.
    #[arg(long, env = "ZEROCODE_ALLOW_ANONYMOUS", default_value_t = false)]
    allow_anonymous: bool,

    /// Maximum anonymous submissions per IP within `--anon-window-secs`.
    #[arg(long, env = "ZEROCODE_ANON_MAX_PER_WINDOW", default_value_t = 6)]
    anon_max_per_window: u32,

    #[arg(long, env = "ZEROCODE_ANON_WINDOW_SECS", default_value_t = 60)]
    anon_window_secs: u64,

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

    let cors_origins = ApiConfig::parse_origins(&args.cors_origins);
    if !cors_origins.is_empty() {
        tracing::info!(origins = ?cors_origins, "CORS allowlist active");
    }
    if args.allow_anonymous {
        tracing::info!(
            max = args.anon_max_per_window,
            window_secs = args.anon_window_secs,
            "anonymous submissions enabled"
        );
    }

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
        cors_origins,
        allow_anonymous: args.allow_anonymous,
        anon_max_per_window: args.anon_max_per_window,
        anon_window: std::time::Duration::from_secs(args.anon_window_secs),
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
