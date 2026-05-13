use sqlx::PgPool;
use sqlx::postgres::{PgListener, PgNotification};
use thiserror::Error;
use tokio_stream::{Stream, StreamExt};
use zerocode_core::Token;

#[derive(Debug, Error)]
pub enum StreamError {
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("malformed payload: {0}")]
    BadPayload(String),
}

pub const JOBS_CHANNEL: &str = "zerocode.jobs";

/// Sent on every successful submission insert. Worker subscribers wake and
/// claim the job from the DB.
#[derive(Clone)]
pub struct JobNotifier {
    pool: PgPool,
}

impl JobNotifier {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn notify(&self, token: Token) -> Result<(), StreamError> {
        let payload = token.to_string();
        // pg_notify is parameterized to avoid SQL injection via channel names.
        sqlx::query!("SELECT pg_notify($1, $2)", JOBS_CHANNEL, payload)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

/// Long-running stream that yields the token of every freshly inserted job.
/// Caller wraps this in a worker loop: on every event, attempt a queue claim;
/// on connection drop, this stream returns `Err` and the caller reconnects.
pub async fn listen_for_jobs(
    pool: &PgPool,
) -> Result<impl Stream<Item = Result<Token, StreamError>> + Unpin, StreamError> {
    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen(JOBS_CHANNEL).await?;
    Ok(Box::pin(
        listener.into_stream().map(parse_token_notification),
    ))
}

fn parse_token_notification(n: Result<PgNotification, sqlx::Error>) -> Result<Token, StreamError> {
    let n = n?;
    n.payload()
        .parse::<Token>()
        .map_err(|e| StreamError::BadPayload(e.to_string()))
}

// Re-export tokio_stream so callers don't need to depend on it directly.
pub use tokio_stream as _tokio_stream;
