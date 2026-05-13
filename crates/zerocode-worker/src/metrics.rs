use std::sync::Arc;

use axum::Router;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use metrics_exporter_prometheus::PrometheusHandle;
use tokio::sync::Notify;

pub fn init() -> PrometheusHandle {
    let builder = metrics_exporter_prometheus::PrometheusBuilder::new();
    let handle = builder
        .install_recorder()
        .expect("install metrics recorder");

    let collector = metrics_process::Collector::default();
    collector.describe();
    collector.collect();

    metrics::describe_counter!(
        "zerocode_submissions_processed_total",
        "Total submissions processed by this worker"
    );
    metrics::describe_histogram!(
        "zerocode_sandbox_duration_seconds",
        "Sandbox execution time in seconds"
    );
    metrics::describe_counter!(
        "zerocode_compile_cache_hits_total",
        "Compile artifact cache hits"
    );
    metrics::describe_counter!(
        "zerocode_compile_cache_misses_total",
        "Compile artifact cache misses"
    );
    metrics::describe_gauge!(
        "zerocode_active_sandboxes",
        "Currently running sandbox processes"
    );
    metrics::describe_counter!(
        "zerocode_webhook_deliveries_total",
        "Webhook delivery attempts"
    );
    metrics::describe_gauge!(
        "zerocode_worker_parallelism",
        "Configured max parallel sandbox slots"
    );
    metrics::describe_gauge!(
        "zerocode_pending_jobs",
        "Submissions in `queued` state — sampled every 5s. Primary auto-scaling input."
    );

    handle
}

async fn prometheus(handle: axum::extract::State<PrometheusHandle>) -> impl IntoResponse {
    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
        handle.render(),
    )
}

pub async fn serve(bind: String, handle: PrometheusHandle, shutdown: Arc<Notify>) {
    let app = Router::new()
        .route("/metrics", get(prometheus))
        .with_state(handle);

    let listener = match tokio::net::TcpListener::bind(&bind).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!(error = %e, %bind, "could not bind metrics server");
            return;
        }
    };
    tracing::info!(%bind, "worker metrics server listening");

    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(async move { shutdown.notified().await })
        .await
        .ok();
}
