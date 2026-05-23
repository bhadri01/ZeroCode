use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderName, HeaderValue, header};
use axum::response::Json;
use axum::routing::{get, post};
use tower::ServiceBuilder;
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{DefaultOnRequest, DefaultOnResponse, MakeSpan, TraceLayer};
use tracing::Level;
use utoipa::OpenApi;

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

pub fn router(state: AppState) -> Router {
    let public = Router::new()
        .route("/v1/health", get(health::liveness))
        .route("/v1/ready", get(health::readiness))
        .route("/v1/about", get(meta::about))
        .route("/v1/openapi.json", get(openapi_spec))
        .route("/metrics", get(metrics::prometheus));

    let cfg = state.config();
    let governor_conf = GovernorConfigBuilder::default()
        .per_second(cfg.governor_rps.max(1) as u64)
        .burst_size(cfg.governor_burst.max(1))
        .finish()
        .unwrap();

    // Routes that accept submissions and serve their results. No auth — the
    // service is configured as an open, non-exported backend. The per-IP
    // `tower_governor` rate limit is the only client-volume guard.
    let api = Router::new()
        .route(
            "/v1/submissions",
            post(submissions::create).get(submissions::list),
        )
        .route("/v1/submissions/{token}", get(submissions::get))
        .route("/v1/submissions/{token}/stream", get(streaming::stream))
        .route("/v1/submissions/batch", post(batches::create))
        .route("/v1/batches/{batch_id}", get(batches::get))
        .route("/v1/languages", get(languages::list))
        .layer(GovernorLayer::new(governor_conf));

    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(SanitizedMakeSpan)
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    let mut router = Router::new()
        .merge(public)
        .merge(api)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(trace_layer)
        .layer(crate::metrics_layer::HttpMetricsLayer);

    // Static web fallback (landing, playground, docs). Built by the web/
    // workspace into web/dist; the path is overridable via ZEROCODE_WEB_DIR
    // and is silently skipped when the directory does not exist.
    //
    // The static service gets a dedicated security-header stack: CSP, COOP,
    // Referrer-Policy, X-Content-Type-Options, Permissions-Policy. These
    // apply ONLY to /, /playground.html, /docs/* — not to /v1/* JSON
    // responses, which have different concerns (CORS, auth) handled above.
    //
    // CSP notes:
    //   - script-src 'self' 'unsafe-inline' 'unsafe-eval' — Starlight
    //     injects an inline theme-bootstrap script to avoid FOUC, AND the
    //     Monaco editor (the same engine VS Code uses, shipped in the
    //     playground) compiles its Monarch tokenizers via `new Function(…)`
    //     which CSP treats as eval. Tightening would require either a
    //     fully external Monaco hosting path or moving the playground to
    //     a different editor that doesn't eval.
    //   - style-src 'self' 'unsafe-inline' — every React component renders
    //     a <style>{`…`}</style> block (the pattern used throughout the
    //     landing/playground modules). Removing would require a full
    //     extract-to-CSS-file pass.
    //   - worker-src 'self' blob: — Monaco's editor worker is bundled as
    //     a same-origin asset by Vite, but Monaco also occasionally wraps
    //     workers in blob URLs internally for diff/layout work.
    //   - connect-src 'self' — SSE + fetch only hit the same origin.
    //   - frame-ancestors 'none' — supersedes legacy X-Frame-Options.
    //   - style-src / font-src allow fonts.googleapis.com (the @import in
    //     web/app/src/shared/tokens.css pulls the Instrument Serif / IBM Plex
    //     Mono / Figtree stylesheet) and fonts.gstatic.com (the woff2 files it
    //     references). Self-host the fonts to drop these origins for an
    //     air-gapped / zero-third-party deploy.
    if let Some(web_dir) = state.config().web_dir.as_ref() {
        const CSP: &str = "default-src 'self'; \
            script-src 'self' 'unsafe-inline' 'unsafe-eval'; \
            style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
            img-src 'self' data: blob:; \
            font-src 'self' data: https://fonts.gstatic.com; \
            worker-src 'self' blob:; \
            connect-src 'self'; \
            frame-ancestors 'none'; \
            base-uri 'self'; \
            form-action 'self'; \
            object-src 'none'";

        let static_with_headers = ServiceBuilder::new()
            .layer(SetResponseHeaderLayer::if_not_present(
                header::CONTENT_SECURITY_POLICY,
                HeaderValue::from_static(CSP),
            ))
            .layer(SetResponseHeaderLayer::if_not_present(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::if_not_present(
                header::REFERRER_POLICY,
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            ))
            .layer(SetResponseHeaderLayer::if_not_present(
                HeaderName::from_static("permissions-policy"),
                HeaderValue::from_static("camera=(), microphone=(), geolocation=(), payment=()"),
            ))
            .layer(SetResponseHeaderLayer::if_not_present(
                HeaderName::from_static("cross-origin-opener-policy"),
                HeaderValue::from_static("same-origin"),
            ))
            // Legacy X-Frame-Options — kept alongside CSP frame-ancestors
            // for older browsers / WAFs that look for it.
            .layer(SetResponseHeaderLayer::if_not_present(
                HeaderName::from_static("x-frame-options"),
                HeaderValue::from_static("DENY"),
            ))
            .service(ServeDir::new(web_dir));

        router = router.fallback_service(static_with_headers);
    }

    router.with_state(state)
}
