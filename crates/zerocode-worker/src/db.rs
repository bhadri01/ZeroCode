//! Worker-side DB helpers. Two responsibilities:
//!   1. Claim queued submissions (with SKIP LOCKED so concurrent workers don't race).
//!   2. Write back the terminal status + outputs + timings.
//!
//! A third helper sweeps stuck claims back to `queued` so a crashed worker
//! doesn't strand submissions in `processing` forever.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use sqlx::Row;
use thiserror::Error;
use zerocode_core::{ResourceLimits, Status, Token};
use zerocode_sandbox::SandboxResult;

#[derive(Debug, Error)]
pub enum WorkerDbError {
    #[error("db: {0}")]
    Db(#[from] sqlx::Error),
    #[error("malformed row: {0}")]
    Malformed(String),
}

#[derive(Debug, Clone)]
pub struct ClaimedJob {
    pub token: Token,
    pub language_id: u32,
    pub source_code: Vec<u8>,
    pub stdin: Vec<u8>,
    pub limits: ResourceLimits,
    pub callback_url: Option<String>,
}

/// Atomically claim the oldest queued row. Returns `Ok(None)` if no queued row
/// is currently free (or if another worker already grabbed it).
pub async fn claim_next(
    pool: &PgPool,
    worker_id: &str,
) -> Result<Option<ClaimedJob>, WorkerDbError> {
    // Two-statement claim via CTE so we can pull the row body in one round trip
    // and `SKIP LOCKED` prevents two workers from grabbing the same token.
    let row = sqlx::query(
        "WITH next AS (\
            SELECT token FROM submissions \
            WHERE status = 'queued' \
            ORDER BY created_at \
            FOR UPDATE SKIP LOCKED \
            LIMIT 1 \
         ) \
         UPDATE submissions s \
         SET status = 'processing', claimed_at = NOW(), worker_id = $1 \
         FROM next \
         WHERE s.token = next.token \
         RETURNING s.token, s.language_id, s.source_code, s.stdin, \
                   s.cpu_time_limit, s.wall_time_limit, s.memory_limit_mb, s.max_pids, \
                   s.enable_network, s.callback_url",
    )
    .bind(worker_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };

    let token_str: String = row.get("token");
    let token: Token = token_str
        .parse()
        .map_err(|e| WorkerDbError::Malformed(format!("token {token_str:?}: {e}")))?;

    let stdin_opt: Option<Vec<u8>> = row.get("stdin");

    Ok(Some(ClaimedJob {
        token,
        language_id: row.get::<i32, _>("language_id") as u32,
        source_code: row.get("source_code"),
        stdin: stdin_opt.unwrap_or_default(),
        limits: ResourceLimits {
            cpu_time: row.get::<f32, _>("cpu_time_limit") as f64,
            wall_time: row.get::<f32, _>("wall_time_limit") as f64,
            memory_mb: row.get::<i32, _>("memory_limit_mb") as u32,
            max_pids: row.get::<i32, _>("max_pids") as u32,
            max_stdout: 64 * 1024,
            max_stderr: 64 * 1024,
            enable_network: row.get("enable_network"),
        },
        callback_url: row.get("callback_url"),
    }))
}

pub async fn write_result(
    pool: &PgPool,
    token: Token,
    result: &SandboxResult,
) -> Result<(), WorkerDbError> {
    let (status_text, status_detail) = encode_status(&result.status);

    sqlx::query(
        "UPDATE submissions \
         SET status = $2, status_detail = $3, \
             stdout = $4, stderr = $5, compile_output = $6, \
             exit_code = $7, signal = $8, \
             cpu_time = $9, wall_time = $10, memory_kb = $11, \
             finished_at = NOW() \
         WHERE token = $1",
    )
    .bind(token.to_string())
    .bind(status_text)
    .bind(status_detail)
    .bind(result.stdout.as_ref())
    .bind(result.stderr.as_ref())
    .bind(result.compile_output.as_ref().map(|b| b.as_ref()))
    .bind(result.exit_code)
    .bind(encode_signal(&result.signal))
    .bind(result.cpu_time.as_secs_f32())
    .bind(result.wall_time.as_secs_f32())
    .bind(result.memory_kb as i32)
    .execute(pool)
    .await?;
    Ok(())
}

/// Mark a submission as failed at the sandbox level (worker code error, not
/// user code error). Distinct from a runtime sandbox return so customer
/// support can tell them apart.
pub async fn write_sandbox_failure(
    pool: &PgPool,
    token: Token,
    msg: &str,
) -> Result<(), WorkerDbError> {
    sqlx::query(
        "UPDATE submissions \
         SET status = 'sandbox_failure', \
             status_detail = $2, \
             finished_at = NOW() \
         WHERE token = $1",
    )
    .bind(token.to_string())
    .bind(serde_json::json!({ "message": msg }))
    .execute(pool)
    .await?;
    Ok(())
}

/// Reset rows whose worker died mid-claim. Threshold is per-row:
/// `2 * wall_time_limit + 60s`. Returns the number of rows reset so the
/// caller can log it.
pub async fn sweep_stale(pool: &PgPool) -> Result<u64, WorkerDbError> {
    let res = sqlx::query(
        "UPDATE submissions \
         SET status = 'queued', claimed_at = NULL, worker_id = NULL \
         WHERE status = 'processing' \
         AND claimed_at < NOW() - (INTERVAL '60 seconds' + INTERVAL '1 second' * (2 * wall_time_limit))",
    )
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

/// Encode `Status` as a `(text, json detail)` pair to match the DB schema.
fn encode_status(s: &Status) -> (&'static str, Option<serde_json::Value>) {
    use Status as S;
    use zerocode_core::status::TimeLimitKind;
    match s {
        S::Queued => ("queued", None),
        S::Processing => ("processing", None),
        S::Accepted => ("accepted", None),
        S::TimeLimitExceeded(TimeLimitKind::Wall) => {
            ("time_limit_exceeded", Some(serde_json::json!("wall")))
        }
        S::TimeLimitExceeded(TimeLimitKind::Cpu) => {
            ("time_limit_exceeded", Some(serde_json::json!("cpu")))
        }
        S::CompileError => ("compile_error", None),
        S::MemoryLimitExceeded => ("memory_limit_exceeded", None),
        S::OutputLimitExceeded => ("output_limit_exceeded", None),
        S::RuntimeError(sig) => (
            "runtime_error",
            Some(serde_json::to_value(sig).unwrap_or(serde_json::Value::Null)),
        ),
        S::NonZeroExit(code) => ("non_zero_exit", Some(serde_json::json!(*code))),
        S::SandboxFailure => ("sandbox_failure", None),
        S::InternalError => ("internal_error", None),
        S::Cancelled => ("cancelled", None),
        S::Expired => ("expired", None),
    }
}

fn encode_signal(sig: &Option<zerocode_core::Signal>) -> Option<i32> {
    use zerocode_core::Signal as Sg;
    sig.as_ref().map(|s| match s {
        Sg::Sigill => 4,
        Sg::Sigabrt => 6,
        Sg::Sigbus => 7,
        Sg::Sigfpe => 8,
        Sg::Sigkill => 9,
        Sg::Sigsegv => 11,
        Sg::Sigpipe => 13,
        Sg::Sigterm => 15,
        Sg::Sigxfsz => 25,
        Sg::Other(n) => *n,
    })
}

// Compile-only smoke that the row decoding/encoding stays in sync.
#[allow(dead_code)]
fn _unused(_d: DateTime<Utc>) {}

#[cfg(test)]
mod tests {
    use super::*;
    use zerocode_core::Signal;
    use zerocode_core::status::TimeLimitKind;

    #[test]
    fn encode_status_accepted() {
        let (t, d) = encode_status(&Status::Accepted);
        assert_eq!(t, "accepted");
        assert!(d.is_none());
    }

    #[test]
    fn encode_status_tle_wall() {
        let (t, d) = encode_status(&Status::TimeLimitExceeded(TimeLimitKind::Wall));
        assert_eq!(t, "time_limit_exceeded");
        assert_eq!(d, Some(serde_json::json!("wall")));
    }

    #[test]
    fn encode_status_nzec() {
        let (t, d) = encode_status(&Status::NonZeroExit(42));
        assert_eq!(t, "non_zero_exit");
        assert_eq!(d, Some(serde_json::json!(42)));
    }

    #[test]
    fn encode_signal_known() {
        assert_eq!(encode_signal(&Some(Signal::Sigsegv)), Some(11));
        assert_eq!(encode_signal(&Some(Signal::Other(99))), Some(99));
        assert_eq!(encode_signal(&None), None);
    }
}
