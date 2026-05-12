//! Thin DB helpers for the API. Worker has its own (claim/sweep logic) so each
//! binary's query surface stays small and reviewable.

use sqlx::PgPool;
use sqlx::Row;
use zerocode_core::{
    LanguageId, LanguageRegistry, ResourceLimits, Signal, Status, Submission, Token,
};

use crate::error::ApiError;

/// Parameters for a fresh INSERT.
pub struct NewSubmission<'a> {
    pub token: Token,
    pub language_id: LanguageId,
    pub source_code: &'a [u8],
    pub stdin: Option<&'a [u8]>,
    pub limits: ResourceLimits,
    pub callback_url: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
    pub idempotency_hash: Option<&'a [u8]>,
}

pub async fn insert_submission(pool: &PgPool, new: &NewSubmission<'_>) -> Result<(), ApiError> {
    let token_str = new.token.to_string();
    sqlx::query(
        "INSERT INTO submissions (\
            token, language_id, source_code, stdin, \
            cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, \
            status, callback_url, idempotency_key, idempotency_hash, \
            created_at\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10, $11, NOW())",
    )
    .bind(&token_str)
    .bind(new.language_id as i32)
    .bind(new.source_code)
    .bind(new.stdin)
    .bind(new.limits.cpu_time as f32)
    .bind(new.limits.wall_time as f32)
    .bind(new.limits.memory_mb as i32)
    .bind(new.limits.max_pids as i32)
    .bind(new.callback_url)
    .bind(new.idempotency_key)
    .bind(new.idempotency_hash)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn find_by_idempotency_key(
    pool: &PgPool,
    key: &str,
    body_hash: &[u8],
) -> Result<Option<IdempotencyHit>, ApiError> {
    let row = sqlx::query(
        "SELECT token, idempotency_hash FROM submissions WHERE idempotency_key = $1 \
         AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };
    let token: String = row.get("token");
    let stored_hash: Option<Vec<u8>> = row.get("idempotency_hash");

    Ok(Some(IdempotencyHit {
        token,
        body_matches: stored_hash.as_deref() == Some(body_hash),
    }))
}

pub struct IdempotencyHit {
    pub token: String,
    pub body_matches: bool,
}

pub async fn fetch_submission(
    pool: &PgPool,
    token: Token,
) -> Result<Option<Submission>, ApiError> {
    let row = sqlx::query(
        "SELECT token, language_id, status, status_detail, \
                cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, \
                stdout, stderr, compile_output, \
                exit_code, signal, cpu_time, wall_time, memory_kb, \
                created_at, finished_at \
         FROM submissions WHERE token = $1",
    )
    .bind(token.to_string())
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };

    let token_str: String = row.get("token");
    let token = token_str.parse::<Token>().map_err(|e| {
        ApiError::Internal(format!("row had un-parseable token {token_str:?}: {e}"))
    })?;

    let status_text: String = row.get("status");
    let status_detail: Option<serde_json::Value> = row.get("status_detail");
    let status = parse_status(&status_text, status_detail.as_ref())?;

    let limits = ResourceLimits {
        cpu_time: row.get::<f32, _>("cpu_time_limit") as f64,
        wall_time: row.get::<f32, _>("wall_time_limit") as f64,
        memory_mb: row.get::<i32, _>("memory_limit_mb") as u32,
        max_pids: row.get::<i32, _>("max_pids") as u32,
        max_stdout: 64 * 1024,
        max_stderr: 64 * 1024,
        enable_network: false,
    };

    let stdout: Option<Vec<u8>> = row.get("stdout");
    let stderr: Option<Vec<u8>> = row.get("stderr");
    let compile_output: Option<Vec<u8>> = row.get("compile_output");

    Ok(Some(Submission {
        token,
        language_id: row.get::<i32, _>("language_id") as u32,
        status,
        limits,
        stdout: stdout.map(zerocode_core::Payload::new),
        stderr: stderr.map(zerocode_core::Payload::new),
        compile_output: compile_output.map(zerocode_core::Payload::new),
        exit_code: row.get("exit_code"),
        signal: row.get::<Option<i32>, _>("signal").map(Signal::from_raw),
        cpu_time: row.get::<Option<f32>, _>("cpu_time").map(|f| f as f64),
        wall_time: row.get::<Option<f32>, _>("wall_time").map(|f| f as f64),
        memory_kb: row.get::<Option<i32>, _>("memory_kb").map(|i| i as u32),
        created_at: row.get("created_at"),
        finished_at: row.get("finished_at"),
    }))
}

/// Convert the (status_text, status_detail JSON) column pair back into a typed
/// Status. The DB layer is intentionally lossy on terminal-status detail so
/// `Status` evolution doesn't require a migration every time.
fn parse_status(text: &str, detail: Option<&serde_json::Value>) -> Result<Status, ApiError> {
    let combined = match detail {
        Some(d) => serde_json::json!({ "kind": text, "detail": d }),
        None => serde_json::json!({ "kind": text }),
    };
    serde_json::from_value(combined)
        .map_err(|e| ApiError::Internal(format!("unparseable status '{text}': {e}")))
}

pub async fn sync_languages(
    pool: &PgPool,
    registry: &LanguageRegistry,
) -> Result<(), ApiError> {
    for spec in registry.list() {
        sqlx::query(
            "INSERT INTO languages (id, name, version, source_file, compile_cmd, run_cmd, env, is_archived, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) \
             ON CONFLICT (id) DO UPDATE SET \
                name = EXCLUDED.name, \
                version = EXCLUDED.version, \
                source_file = EXCLUDED.source_file, \
                compile_cmd = EXCLUDED.compile_cmd, \
                run_cmd = EXCLUDED.run_cmd, \
                env = EXCLUDED.env, \
                is_archived = EXCLUDED.is_archived, \
                updated_at = NOW()",
        )
        .bind(spec.id as i32)
        .bind(&spec.name)
        .bind(&spec.version)
        .bind(&spec.source_file)
        .bind(spec.compile_cmd.clone().unwrap_or_default())
        .bind(&spec.run_cmd)
        .bind(serde_json::to_value(&spec.env).unwrap())
        .bind(spec.is_archived)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub struct SubmissionPage {
    pub items: Vec<Submission>,
    pub total: i64,
}

pub async fn list_submissions(
    pool: &PgPool,
    status_filter: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<SubmissionPage, ApiError> {
    let count_row = sqlx::query(
        "SELECT count(*)::bigint AS n FROM submissions \
         WHERE ($1::text IS NULL OR status = $1)",
    )
    .bind(status_filter)
    .fetch_one(pool)
    .await?;
    let total: i64 = count_row.get("n");

    let rows = sqlx::query(
        "SELECT token, language_id, status, status_detail, \
                cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, \
                stdout, stderr, compile_output, \
                exit_code, signal, cpu_time, wall_time, memory_kb, \
                created_at, finished_at \
         FROM submissions \
         WHERE ($1::text IS NULL OR status = $1) \
         ORDER BY created_at DESC \
         LIMIT $2 OFFSET $3",
    )
    .bind(status_filter)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let token_str: String = row.get("token");
        let token = token_str.parse::<Token>().map_err(|e| {
            ApiError::Internal(format!("row had un-parseable token {token_str:?}: {e}"))
        })?;

        let status_text: String = row.get("status");
        let status_detail: Option<serde_json::Value> = row.get("status_detail");
        let status = parse_status(&status_text, status_detail.as_ref())?;

        let limits = ResourceLimits {
            cpu_time: row.get::<f32, _>("cpu_time_limit") as f64,
            wall_time: row.get::<f32, _>("wall_time_limit") as f64,
            memory_mb: row.get::<i32, _>("memory_limit_mb") as u32,
            max_pids: row.get::<i32, _>("max_pids") as u32,
            max_stdout: 64 * 1024,
            max_stderr: 64 * 1024,
            enable_network: false,
        };

        let stdout: Option<Vec<u8>> = row.get("stdout");
        let stderr: Option<Vec<u8>> = row.get("stderr");
        let compile_output: Option<Vec<u8>> = row.get("compile_output");

        items.push(Submission {
            token,
            language_id: row.get::<i32, _>("language_id") as u32,
            status,
            limits,
            stdout: stdout.map(zerocode_core::Payload::new),
            stderr: stderr.map(zerocode_core::Payload::new),
            compile_output: compile_output.map(zerocode_core::Payload::new),
            exit_code: row.get("exit_code"),
            signal: row.get::<Option<i32>, _>("signal").map(Signal::from_raw),
            cpu_time: row.get::<Option<f32>, _>("cpu_time").map(|f| f as f64),
            wall_time: row.get::<Option<f32>, _>("wall_time").map(|f| f as f64),
            memory_kb: row.get::<Option<i32>, _>("memory_kb").map(|i| i as u32),
            created_at: row.get("created_at"),
            finished_at: row.get("finished_at"),
        });
    }

    Ok(SubmissionPage { items, total })
}

/// Used by the queue-depth admission control on `/v1/ready`.
pub async fn queue_depth(pool: &PgPool) -> Result<i64, ApiError> {
    let row = sqlx::query(
        "SELECT count(*)::bigint AS n FROM submissions WHERE status = 'queued'",
    )
    .fetch_one(pool)
    .await?;
    Ok(row.get("n"))
}

#[derive(Debug, Clone, Copy)]
pub enum QueueState {
    Healthy,
    Backpressure,
}

const QUEUE_BACKPRESSURE_THRESHOLD: i64 = 10_000;

pub fn classify_queue_depth(n: i64) -> QueueState {
    if n > QUEUE_BACKPRESSURE_THRESHOLD {
        QueueState::Backpressure
    } else {
        QueueState::Healthy
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_queue_depth() {
        assert!(matches!(classify_queue_depth(0), QueueState::Healthy));
        assert!(matches!(classify_queue_depth(100), QueueState::Healthy));
        assert!(matches!(
            classify_queue_depth(QUEUE_BACKPRESSURE_THRESHOLD + 1),
            QueueState::Backpressure
        ));
    }

    #[test]
    fn parse_status_accepted() {
        let s = parse_status("accepted", None).unwrap();
        matches!(s, Status::Accepted);
    }

    #[test]
    fn parse_status_with_detail() {
        let detail = serde_json::json!("wall");
        let s = parse_status("time_limit_exceeded", Some(&detail)).unwrap();
        matches!(
            s,
            Status::TimeLimitExceeded(zerocode_core::status::TimeLimitKind::Wall)
        );
    }

}
