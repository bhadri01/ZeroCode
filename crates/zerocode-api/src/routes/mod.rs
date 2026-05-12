use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;
use tower_http::trace::{DefaultOnRequest, DefaultOnResponse, MakeSpan, TraceLayer};
use tracing::Level;

use crate::auth;
use crate::state::AppState;

mod health;
mod languages;
mod meta;
mod metrics;
mod streaming;
mod submissions;

const MAX_BODY_BYTES: usize = 256 * 1024;

/// Custom span maker that logs method, URI, and version but redacts
/// the Authorization header so API keys never appear in trace spans.
#[derive(Clone, Debug)]
struct SanitizedMakeSpan;

impl<B> MakeSpan<B> for SanitizedMakeSpan {
    fn make_span(&mut self, request: &http::Request<B>) -> tracing::Span {
        tracing::info_span!(
            "http_request",
            method = %request.method(),
            uri = %request.uri(),
            version = ?request.version(),
        )
    }
}

pub fn router(state: AppState) -> Router {
    let public = Router::new()
        .route("/v1/health", get(health::liveness))
        .route("/v1/ready", get(health::readiness))
        .route("/v1/about", get(meta::about))
        .route("/metrics", get(metrics::prometheus));

    let governor_conf = GovernorConfigBuilder::default()
        .per_second(100)
        .burst_size(100)
        .finish()
        .unwrap();

    let authed = Router::new()
        .route(
            "/v1/submissions",
            post(submissions::create).get(submissions::list),
        )
        .route("/v1/submissions/{token}", get(submissions::get))
        .route("/v1/submissions/{token}/stream", get(streaming::stream))
        .route("/v1/languages", get(languages::list))
        .layer(GovernorLayer::new(governor_conf))
        .layer(from_fn_with_state(state.clone(), auth::require_bearer));

    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(SanitizedMakeSpan)
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    Router::new()
        .merge(public)
        .merge(authed)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(trace_layer)
        .layer(crate::metrics_layer::HttpMetricsLayer)
        .with_state(state)
}
