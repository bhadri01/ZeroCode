use std::time::Duration;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderValue, Method, header};
use axum::middleware::from_fn_with_state;
use axum::response::Json;
use axum::routing::{get, post};
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::{DefaultOnRequest, DefaultOnResponse, MakeSpan, TraceLayer};
use tracing::Level;
use utoipa::OpenApi;

use crate::auth;
use crate::state::AppState;

pub mod batches;
pub mod health;
pub mod languages;
pub mod meta;
mod metrics;
pub mod streaming;
pub mod submissions;

/// Serve the spec generated from `crate::openapi::ApiDoc`. Unauthenticated so
/// SDK generators can fetch it without provisioning a key.
async fn openapi_spec() -> Result<Json<serde_json::Value>, crate::error::ApiError> {
    let s = crate::openapi::ApiDoc::openapi()
        .to_json()
        .map_err(|e| crate::error::ApiError::Internal(format!("openapi serialize: {e}")))?;
    let v: serde_json::Value = serde_json::from_str(&s)
        .map_err(|e| crate::error::ApiError::Internal(format!("openapi reparse: {e}")))?;
    Ok(Json(v))
}

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

/// Build a `CorsLayer` from the configured origin list.
///
/// - Empty list → CORS disabled entirely (same-origin only — the layer is
///   omitted upstream).
/// - `["*"]`    → permissive `Any` (no credentials, since browsers refuse to
///                send `Authorization` together with `Origin: *`).
/// - Otherwise  → exact-match allowlist with `Authorization` permitted on
///                preflight responses so the playground can send bearer keys
///                from origins it controls.
fn build_cors_layer(origins: &[String]) -> Option<CorsLayer> {
    if origins.is_empty() {
        return None;
    }
    let methods = [
        Method::GET,
        Method::POST,
        Method::PUT,
        Method::DELETE,
        Method::OPTIONS,
    ];
    let headers = [
        header::AUTHORIZATION,
        header::CONTENT_TYPE,
        header::ACCEPT,
        "idempotency-key".parse().unwrap(),
    ];

    let mut layer = CorsLayer::new()
        .allow_methods(methods)
        .allow_headers(headers)
        // SSE streams are long-lived; let the browser keep the connection
        // open for the full retention window.
        .max_age(Duration::from_secs(600));

    if origins.iter().any(|o| o == "*") {
        layer = layer.allow_origin(AllowOrigin::any());
    } else {
        let parsed: Vec<HeaderValue> = origins
            .iter()
            .filter_map(|o| HeaderValue::from_str(o).ok())
            .collect();
        layer = layer
            .allow_origin(AllowOrigin::list(parsed))
            // exact-match origins are safe to combine with credentials so
            // the bearer key flows on preflight + actual request.
            .allow_credentials(true);
    }

    Some(layer)
}

pub fn router(state: AppState) -> Router {
    let public = Router::new()
        .route("/v1/health", get(health::liveness))
        .route("/v1/ready", get(health::readiness))
        .route("/v1/about", get(meta::about))
        .route("/v1/openapi.json", get(openapi_spec))
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
        .route("/v1/submissions/batch", post(batches::create))
        .route("/v1/batches/{batch_id}", get(batches::get))
        .route("/v1/languages", get(languages::list))
        .layer(GovernorLayer::new(governor_conf))
        .layer(from_fn_with_state(state.clone(), auth::require_auth));

    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(SanitizedMakeSpan)
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    let cors_layer = build_cors_layer(&state.config().cors_origins);

    let mut router = Router::new()
        .merge(public)
        .merge(authed)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(trace_layer)
        .layer(crate::metrics_layer::HttpMetricsLayer)
        // Serve static web files (playground, docs, etc.) as fallback
        .fallback_service(ServeDir::new("/web"));

    if let Some(cors) = cors_layer {
        router = router.layer(cors);
    }

    router.with_state(state)
}
