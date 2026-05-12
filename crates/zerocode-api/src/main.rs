use anyhow::{Context, Result};
use clap::Parser;
use tracing_subscriber::EnvFilter;

mod config;
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
}

#[tokio::main]
async fn main() -> Result<()> {
    init_logging();
    let args = Args::parse();

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

    let state = AppState::connect(cfg).await.context("building app state")?;

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
    tracing::info!("shutdown signal received, draining");
}
