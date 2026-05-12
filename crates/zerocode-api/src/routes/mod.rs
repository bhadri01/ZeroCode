use axum::Router;
use axum::routing::get;
use tower_http::trace::TraceLayer;

use crate::state::AppState;

mod health;
mod meta;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(health::liveness))
        .route("/v1/ready", get(health::readiness))
        .route("/v1/about", get(meta::about))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
