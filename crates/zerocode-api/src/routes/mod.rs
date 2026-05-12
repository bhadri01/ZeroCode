use axum::extract::DefaultBodyLimit;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};
use axum::Router;
use tower_http::trace::TraceLayer;

use crate::auth;
use crate::state::AppState;

mod health;
mod languages;
mod meta;
mod submissions;

const MAX_BODY_BYTES: usize = 256 * 1024;

pub fn router(state: AppState) -> Router {
    let public = Router::new()
        .route("/v1/health", get(health::liveness))
        .route("/v1/ready", get(health::readiness))
        .route("/v1/about", get(meta::about));

    let authed = Router::new()
        .route("/v1/submissions", post(submissions::create))
        .route("/v1/submissions/{token}", get(submissions::get))
        .route("/v1/languages", get(languages::list))
        .layer(from_fn_with_state(state.clone(), auth::require_bearer));

    Router::new()
        .merge(public)
        .merge(authed)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
