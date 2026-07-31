//! Thin DB helpers for the API. Worker has its own (claim/sweep logic) so each
//! binary's query surface stays small and reviewable.

use sqlx::PgPool;
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
    /// When `Some`, marks this row as part of a batch. Multiple submissions
    /// share the same `batch_id` ULID; `GET /v1/batches/{id}` aggregates them.
    pub batch_id: Option<&'a str>,
}

pub async fn insert_submission(pool: &PgPool, new: &NewSubmission<'_>) -> Result<(), ApiError> {
    let token_str = new.token.to_string();
    sqlx::query!(
        "INSERT INTO submissions (\
            token, language_id, source_code, stdin, \
            cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, enable_network, \
            status, callback_url, idempotency_key, idempotency_hash, batch_id, \
            created_at\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10, $11, $12, $13, NOW())",
        token_str,
        new.language_id as i32,
        new.source_code,
        new.stdin,
        new.limits.cpu_time as f32,
        new.limits.wall_time as f32,
        new.limits.memory_mb as i32,
        new.limits.max_pids as i32,
        new.limits.enable_network,
        new.callback_url,
        new.idempotency_key,
        new.idempotency_hash,
        new.batch_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn find_by_idempotency_key(
    pool: &PgPool,
    key: &str,
    body_hash: &[u8],
) -> Result<Option<IdempotencyHit>, ApiError> {
    let row = sqlx::query!(
        "SELECT token, idempotency_hash FROM submissions WHERE idempotency_key = $1 \
         AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1",
        key,
    )
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(IdempotencyHit {
        token: row.token,
        body_matches: row.idempotency_hash.as_deref() == Some(body_hash),
    }))
}

pub struct IdempotencyHit {
    pub token: String,
    pub body_matches: bool,
}

pub async fn fetch_submission(pool: &PgPool, token: Token) -> Result<Option<Submission>, ApiError> {
    let row = sqlx::query!(
        "SELECT token, language_id, status, status_detail, \
                cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, enable_network, \
                stdout, stderr, compile_output, \
                exit_code, signal, cpu_time, wall_time, compile_time, memory_kb, \
                created_at, finished_at \
         FROM submissions WHERE token = $1",
        token.to_string(),
    )
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };

    let token = row.token.parse::<Token>().map_err(|e| {
        ApiError::Internal(format!("row had un-parseable token {:?}: {e}", row.token))
    })?;

    let status = parse_status(&row.status, row.status_detail.as_ref())?;

    let limits = ResourceLimits {
        cpu_time: row.cpu_time_limit as f64,
        wall_time: row.wall_time_limit as f64,
        memory_mb: row.memory_limit_mb as u32,
        max_pids: row.max_pids as u32,
        max_stdout: 64 * 1024,
        max_stderr: 64 * 1024,
        enable_network: row.enable_network,
    };

    Ok(Some(Submission {
        token,
        language_id: row.language_id as u32,
        status,
        limits,
        stdout: row.stdout.map(zerocode_core::Payload::new),
        stderr: row.stderr.map(zerocode_core::Payload::new),
        compile_output: row.compile_output.map(zerocode_core::Payload::new),
        exit_code: row.exit_code,
        signal: row.signal.map(Signal::from_raw),
        cpu_time: row.cpu_time.map(|f| f as f64),
        compile_time: row.compile_time.map(|f| f as f64),
        wall_time: row.wall_time.map(|f| f as f64),
        memory_kb: row.memory_kb.map(|i| i as u32),
        created_at: row.created_at,
        finished_at: row.finished_at,
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

pub async fn sync_languages(pool: &PgPool, registry: &LanguageRegistry) -> Result<(), ApiError> {
    for spec in registry.list() {
        let compile_cmd: Vec<String> = spec.compile_cmd.clone().unwrap_or_default();
        sqlx::query!(
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
            spec.id as i32,
            spec.name,
            spec.version,
            spec.source_file,
            &compile_cmd,
            &spec.run_cmd,
            serde_json::to_value(&spec.env).unwrap(),
            spec.is_archived,
        )
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
    let total: i64 = sqlx::query_scalar!(
        "SELECT count(*)::bigint AS \"n!\" FROM submissions \
         WHERE ($1::text IS NULL OR status = $1)",
        status_filter,
    )
    .fetch_one(pool)
    .await?;

    let rows = sqlx::query!(
        "SELECT token, language_id, status, status_detail, \
                cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, enable_network, \
                stdout, stderr, compile_output, \
                exit_code, signal, cpu_time, wall_time, compile_time, memory_kb, \
                created_at, finished_at \
         FROM submissions \
         WHERE ($1::text IS NULL OR status = $1) \
         ORDER BY created_at DESC \
         LIMIT $2 OFFSET $3",
        status_filter,
        limit,
        offset,
    )
    .fetch_all(pool)
    .await?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let token = row.token.parse::<Token>().map_err(|e| {
            ApiError::Internal(format!("row had un-parseable token {:?}: {e}", row.token))
        })?;

        let status = parse_status(&row.status, row.status_detail.as_ref())?;

        let limits = ResourceLimits {
            cpu_time: row.cpu_time_limit as f64,
            wall_time: row.wall_time_limit as f64,
            memory_mb: row.memory_limit_mb as u32,
            max_pids: row.max_pids as u32,
            max_stdout: 64 * 1024,
            max_stderr: 64 * 1024,
            enable_network: row.enable_network,
        };

        items.push(Submission {
            token,
            language_id: row.language_id as u32,
            status,
            limits,
            stdout: row.stdout.map(zerocode_core::Payload::new),
            stderr: row.stderr.map(zerocode_core::Payload::new),
            compile_output: row.compile_output.map(zerocode_core::Payload::new),
            exit_code: row.exit_code,
            signal: row.signal.map(Signal::from_raw),
            cpu_time: row.cpu_time.map(|f| f as f64),
            compile_time: row.compile_time.map(|f| f as f64),
            wall_time: row.wall_time.map(|f| f as f64),
            memory_kb: row.memory_kb.map(|i| i as u32),
            created_at: row.created_at,
            finished_at: row.finished_at,
        });
    }

    Ok(SubmissionPage { items, total })
}

/// Fetch every submission belonging to a given batch in the order they were
/// inserted. The N+1 submissions of a batch all share the same `batch_id`
/// ULID returned by `POST /v1/submissions/batch`.
pub async fn list_batch(pool: &PgPool, batch_id: &str) -> Result<Vec<Submission>, ApiError> {
    let rows = sqlx::query!(
        "SELECT token, language_id, status, status_detail, \
                cpu_time_limit, wall_time_limit, memory_limit_mb, max_pids, enable_network, \
                stdout, stderr, compile_output, \
                exit_code, signal, cpu_time, wall_time, compile_time, memory_kb, \
                created_at, finished_at \
         FROM submissions \
         WHERE batch_id = $1 \
         ORDER BY created_at, token",
        batch_id,
    )
    .fetch_all(pool)
    .await?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let token = row.token.parse::<Token>().map_err(|e| {
            ApiError::Internal(format!("row had un-parseable token {:?}: {e}", row.token))
        })?;

        let status = parse_status(&row.status, row.status_detail.as_ref())?;

        let limits = ResourceLimits {
            cpu_time: row.cpu_time_limit as f64,
            wall_time: row.wall_time_limit as f64,
            memory_mb: row.memory_limit_mb as u32,
            max_pids: row.max_pids as u32,
            max_stdout: 64 * 1024,
            max_stderr: 64 * 1024,
            enable_network: row.enable_network,
        };

        items.push(Submission {
            token,
            language_id: row.language_id as u32,
            status,
            limits,
            stdout: row.stdout.map(zerocode_core::Payload::new),
            stderr: row.stderr.map(zerocode_core::Payload::new),
            compile_output: row.compile_output.map(zerocode_core::Payload::new),
            exit_code: row.exit_code,
            signal: row.signal.map(Signal::from_raw),
            cpu_time: row.cpu_time.map(|f| f as f64),
            compile_time: row.compile_time.map(|f| f as f64),
            wall_time: row.wall_time.map(|f| f as f64),
            memory_kb: row.memory_kb.map(|i| i as u32),
            created_at: row.created_at,
            finished_at: row.finished_at,
        });
    }

    Ok(items)
}

/// Used by the queue-depth admission control on `/v1/ready`.
pub async fn queue_depth(pool: &PgPool) -> Result<i64, ApiError> {
    let n: i64 = sqlx::query_scalar!(
        "SELECT count(*)::bigint AS \"n!\" FROM submissions WHERE status = 'queued'",
    )
    .fetch_one(pool)
    .await?;
    Ok(n)
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
