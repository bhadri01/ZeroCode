use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;
use metrics_exporter_prometheus::PrometheusHandle;
use zerocode_core::LanguageRegistry;

mod auth;
mod config;
mod db;
mod error;
mod grpc;
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

    /// gRPC server bind address. Empty/`off` disables the gRPC tier (REST-only mode).
    #[arg(long, env = "ZEROCODE_GRPC_BIND", default_value = "0.0.0.0:9091")]
    grpc_bind: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let tracer_provider = telemetry::init().context("init telemetry")?;
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

    let grpc_state = state.clone();
    let grpc_bind = args.grpc_bind.clone();
    let grpc_task: tokio::task::JoinHandle<Result<()>> = tokio::spawn(async move {
        if grpc_bind.is_empty() || grpc_bind.eq_ignore_ascii_case("off") {
            tracing::info!("gRPC server disabled (ZEROCODE_GRPC_BIND empty/off)");
            return Ok(());
        }
        let addr: std::net::SocketAddr = grpc_bind
            .parse()
            .with_context(|| format!("parsing grpc_bind {grpc_bind}"))?;

        // Reflection — lets grpcurl / BloomRPC discover the service schema
        // without the .proto file. Driven off the FileDescriptorSet
        // tonic-build embedded into the binary.
        let reflection = tonic_reflection::server::Builder::configure()
            .register_encoded_file_descriptor_set(grpc::FILE_DESCRIPTOR_SET)
            .build_v1()
            .context("build gRPC reflection service")?;

        tracing::info!(%addr, "gRPC server listening");
        tonic::transport::Server::builder()
            .add_service(grpc::service(grpc_state))
            .add_service(reflection)
            .serve_with_shutdown(addr, shutdown_signal())
            .await
            .context("gRPC server error")
    });

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

    // Wait for the gRPC task to finish its own graceful shutdown.
    match grpc_task.await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => tracing::error!(error = %e, "gRPC task errored"),
        Err(e) => tracing::error!(error = %e, "gRPC task join failed"),
    }

    tracing::info!("zerocode-api stopped cleanly");
    telemetry::shutdown(tracer_provider);
    Ok(())
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
