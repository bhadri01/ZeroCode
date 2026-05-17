//! Tracing setup — JSON logs on stdout only.
//!
//! OTLP/gRPC tracing export was removed when the gRPC API tier was dropped.
//! Prometheus metrics (served at `/metrics`) remain the observability
//! surface alongside structured stdout logs. If you need distributed
//! tracing later, re-add `opentelemetry-otlp` with the `http-proto`
//! exporter so we don't have to take tonic back.

use anyhow::Result;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

/// Install the tracing subscriber. Returns `()` for symmetry with the
/// previous OTLP-returning signature so main.rs's shutdown call site
/// stays simple.
pub fn init() -> Result<()> {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,zerocode=debug"));

    let stdout_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(true)
        .with_filter(env_filter);

    tracing_subscriber::registry().with(stdout_layer).init();
    Ok(())
}

/// No-op shutdown; kept so main.rs can call it unconditionally even though
/// there's nothing to flush now that OTLP is gone.
pub fn shutdown(_: ()) {}
