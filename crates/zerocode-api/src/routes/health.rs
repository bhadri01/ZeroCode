use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub struct Liveness {
    status: &'static str,
}

/// Always-200 liveness — the process is up. Used by K8s `livenessProbe`.
pub async fn liveness() -> Json<Liveness> {
    Json(Liveness { status: "ok" })
}

#[derive(Serialize)]
pub struct Readiness {
    db: &'static str,
}

/// Returns 200 only when the DB ping succeeds. Used by K8s `readinessProbe`
/// to gate traffic. Adds queue-depth admission control once the queue lands.
pub async fn readiness(State(state): State<AppState>) -> (StatusCode, Json<Readiness>) {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(state.pool())
        .await
        .is_ok();
    if db_ok {
        (StatusCode::OK, Json(Readiness { db: "ok" }))
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, Json(Readiness { db: "down" }))
    }
}
