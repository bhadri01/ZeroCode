use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use sqlx::postgres::PgListener;
use tokio_stream::{Stream, StreamExt};
use zerocode_core::Token;

use crate::jobs::StreamError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Processing,
    StdoutChunk { data: String },
    StderrChunk { data: String },
    Finished { status: serde_json::Value },
}

fn channel(token: &Token) -> String {
    format!("zerocode.events.{}", token)
}

/// Worker calls this to broadcast events to anyone streaming the submission.
pub async fn publish_event(pool: &PgPool, token: Token, event: &Event) -> Result<(), StreamError> {
    let payload =
        serde_json::to_string(event).map_err(|e| StreamError::BadPayload(e.to_string()))?;
    sqlx::query!("SELECT pg_notify($1, $2)", channel(&token), payload)
        .execute(pool)
        .await?;
    Ok(())
}

pub type EventStream = std::pin::Pin<Box<dyn Stream<Item = Result<Event, StreamError>> + Send>>;

/// Open a per-token event stream. The API holds this for the lifetime of a
/// `GET /submissions/{token}/stream` SSE connection.
pub async fn subscribe(pool: &PgPool, token: Token) -> Result<EventStream, StreamError> {
    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen(&channel(&token)).await?;
    let s = listener.into_stream().map(|n| {
        let n = n?;
        let event: Event = serde_json::from_str(n.payload())
            .map_err(|e| StreamError::BadPayload(e.to_string()))?;
        Ok(event)
    });
    Ok(Box::pin(s))
}
