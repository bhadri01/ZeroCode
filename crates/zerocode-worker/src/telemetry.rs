//! Tracing + OTLP setup. Inactive by default; activated by setting:
//!
//!   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
//!
//! Mirrors `zerocode-api`'s telemetry module — kept inline rather than pulled
//! into a shared crate to keep each binary's startup path independently auditable.

use anyhow::{Context, Result};
use opentelemetry::trace::TracerProvider as _;
use opentelemetry::{KeyValue, global};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::TracerProvider;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};

const SERVICE_NAME: &str = "zerocode-worker";

pub fn init() -> Result<Option<TracerProvider>> {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,zerocode=debug"));

    let stdout_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(true)
        .with_filter(env_filter);

    let registry = tracing_subscriber::registry().with(stdout_layer);

    if let Some(endpoint) = otlp_endpoint() {
        let provider = build_tracer_provider(&endpoint)
            .with_context(|| format!("install OTLP exporter (endpoint={endpoint})"))?;
        let tracer = provider.tracer(SERVICE_NAME);

        global::set_text_map_propagator(TraceContextPropagator::new());
        global::set_tracer_provider(provider.clone());

        let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);
        registry.with(otel_layer).init();

        tracing::info!(%endpoint, service = SERVICE_NAME, "OTLP tracing enabled");
        Ok(Some(provider))
    } else {
        registry.init();
        Ok(None)
    }
}

pub fn shutdown(provider: Option<TracerProvider>) {
    if let Some(p) = provider {
        if let Err(e) = p.shutdown() {
            tracing::warn!(error = %e, "OTLP tracer provider shutdown failed");
        }
    }
}

fn otlp_endpoint() -> Option<String> {
    std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .ok()
        .filter(|s| !s.is_empty())
}

fn build_tracer_provider(endpoint: &str) -> Result<TracerProvider> {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint)
        .build()
        .context("build OTLP span exporter")?;

    let resource = Resource::new(vec![
        KeyValue::new("service.name", SERVICE_NAME),
        KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
    ]);

    Ok(TracerProvider::builder()
        .with_batch_exporter(exporter, opentelemetry_sdk::runtime::Tokio)
        .with_resource(resource)
        .build())
}
