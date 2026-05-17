//! Tracing setup — JSON logs on stdout only.
//!
//! Mirrors `zerocode-api`'s minimal telemetry. OTLP/gRPC tracing export was
//! removed alongside the gRPC API tier; Prometheus metrics on the worker's
//! HTTP port + structured stdout logs are the observability surface.

use anyhow::Result;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

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

pub fn shutdown(_: ()) {}
