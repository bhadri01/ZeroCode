use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::db;
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
    queue: &'static str,
    queue_depth: i64,
}

/// Returns 200 only when (a) DB ping succeeds and (b) queue depth is below the
/// backpressure threshold. Used by K8s `readinessProbe` to gate traffic.
pub async fn readiness(State(state): State<AppState>) -> (StatusCode, Json<Readiness>) {
    let depth = match db::queue_depth(state.pool()).await {
        Ok(n) => n,
        Err(_) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(Readiness {
                    db: "down",
                    queue: "unknown",
                    queue_depth: -1,
                }),
            );
        }
    };
    let queue_state = db::classify_queue_depth(depth);
    let (code, queue_lbl) = match queue_state {
        db::QueueState::Healthy => (StatusCode::OK, "ok"),
        db::QueueState::Backpressure => (StatusCode::SERVICE_UNAVAILABLE, "backpressure"),
    };
    (
        code,
        Json(Readiness {
            db: "ok",
            queue: queue_lbl,
            queue_depth: depth,
        }),
    )
}
