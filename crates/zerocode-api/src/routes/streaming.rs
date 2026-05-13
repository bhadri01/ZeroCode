use std::pin::Pin;

use axum::extract::{Path, State};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use futures::stream::{self, Stream, StreamExt};
use zerocode_core::Token;
use zerocode_stream::events::{Event, subscribe};

use crate::db;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

type SseStream = Pin<Box<dyn Stream<Item = Result<SseEvent, axum::Error>> + Send>>;

pub async fn stream(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Response> {
    let token: Token = token
        .parse()
        .map_err(|_| ApiError::Validation("token format invalid".into()))?;

    if let Some(sub) = db::fetch_submission(state.pool(), token).await? {
        if sub.is_done() {
            let status_json = serde_json::to_value(sub.status).unwrap_or_default();
            let event = SseEvent::default()
                .event("finished")
                .json_data(serde_json::json!({ "status": status_json }))
                .map_err(|e| ApiError::Internal(e.to_string()))?;
            let s: SseStream = Box::pin(stream::once(async move { Ok(event) }));
            return Ok(Sse::new(s).keep_alive(KeepAlive::default()).into_response());
        }
    } else {
        return Err(ApiError::NotFound);
    }

    let event_stream = subscribe(state.pool(), token)
        .await
        .map_err(|e| ApiError::Internal(format!("subscribe failed: {e}")))?;

    let sse_stream: SseStream = Box::pin(event_stream.map(|result| match result {
        Ok(event) => {
            let (event_type, data) = match &event {
                Event::Processing => ("processing", serde_json::json!({})),
                Event::StdoutChunk { data } => ("stdout", serde_json::json!({ "data": data })),
                Event::StderrChunk { data } => ("stderr", serde_json::json!({ "data": data })),
                Event::Finished { status } => ("finished", serde_json::json!({ "status": status })),
            };
            SseEvent::default()
                .event(event_type)
                .json_data(&data)
                .map_err(axum::Error::new)
        }
        Err(e) => {
            let event = SseEvent::default().event("error").data(e.to_string());
            Ok(event)
        }
    }));

    Ok(Sse::new(sse_stream)
        .keep_alive(KeepAlive::default())
        .into_response())
}

#[utoipa::path(
    get, path = "/v1/submissions/{token}/stream", tag = "submissions",
    summary = "Stream submission events (Server-Sent Events)",
    description = "Subscribes to per-token events via PostgreSQL `LISTEN`. \
                   Each event is one SSE message: `processing`, `stdout_chunk`, \
                   `stderr_chunk`, or `finished`. Connection holds until the \
                   submission reaches a terminal state, then closes.",
    security(("bearer" = [])),
    params(
        ("token" = String, Path, description = "Submission token."),
    ),
    responses(
        (status = 200, description = "SSE stream (content-type `text/event-stream`)"),
        (status = 401, description = "Missing or invalid bearer", body = crate::openapi::ErrorBody),
        (status = 404, description = "Unknown token", body = crate::openapi::ErrorBody),
    ),
)]
#[allow(dead_code)]
pub fn stream_doc() {}
