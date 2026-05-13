//! Test-case batching (v2).
//!
//! A "batch" is N independent submissions of the same source code, each
//! with its own stdin test case, tied together by a shared `batch_id` ULID.
//! Workers process each batch member as a normal submission — no special
//! worker semantics — so per-case caching, sweeping, retention, and webhooks
//! all keep working unchanged.
//!
//! Endpoints
//! ---------
//! - `POST /v1/submissions/batch` — create N submissions (1–100 test cases)
//! - `GET  /v1/batches/{batch_id}` — fetch aggregated batch view + summary

use std::net::SocketAddr;

use axum::Json;
use axum::extract::{ConnectInfo, Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use ulid::Ulid;
use zerocode_core::{LanguageId, Payload, Token, status::TimeLimitKind};
use zerocode_core::{Status, Submission};

use crate::auth::AuthTier;
use crate::db::{self, NewSubmission};
use crate::error::{ApiError, ApiResult};
use crate::routes::submissions::SubmissionView;
use crate::state::AppState;
use zerocode_stream::jobs::JobNotifier;

const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_STDIN_BYTES: usize = 64 * 1024;
/// Hard cap on test cases per batch. Keeps API requests bounded; clients
/// needing more should split into multiple batches.
const MAX_TEST_CASES: usize = 100;

#[derive(Debug, Deserialize)]
pub struct BatchTestCase {
    /// Per-case stdin. Same encoding rules as the single-shot endpoint:
    /// plain UTF-8 by default, base64 when the parent request has
    /// `base64_encoded=true`.
    #[serde(default)]
    pub stdin: Option<Payload>,
}

#[derive(Debug, Deserialize)]
pub struct BatchRequest {
    pub language_id: LanguageId,
    pub source_code: Payload,
    pub test_cases: Vec<BatchTestCase>,
    #[serde(default)]
    pub cpu_time_limit: Option<f64>,
    #[serde(default)]
    pub wall_time_limit: Option<f64>,
    #[serde(default)]
    pub memory_limit_mb: Option<u32>,
    /// Per-case base64 decoding flag — applies to `source_code` and every
    /// `test_cases[i].stdin`. Mirrors `SubmissionRequest.base64_encoded`.
    #[serde(default)]
    pub base64_encoded: bool,
}

#[derive(Debug, Serialize)]
pub struct BatchAck {
    pub batch_id: String,
    pub count: usize,
    pub tokens: Vec<String>,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
pub struct BatchSummary {
    pub total: usize,
    pub queued: usize,
    pub processing: usize,
    pub accepted: usize,
    pub failed: usize,
}

#[derive(Serialize)]
pub struct BatchView {
    pub batch_id: String,
    pub items: Vec<SubmissionView>,
    pub summary: BatchSummary,
}

pub async fn create(
    State(state): State<AppState>,
    Extension(tier): Extension<AuthTier>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(mut req): Json<BatchRequest>,
) -> ApiResult<Response> {
    // Anonymous callers cannot batch — even a 100-case batch with the anon
    // quota set to 1/min would let a visitor burn 100 sandbox invocations in
    // one POST. Require a real API key for batch jobs.
    if tier == AuthTier::Anonymous {
        return Err(ApiError::Unauthorized);
    }
    // Lightly tag the IP for symmetry with the single-shot endpoint (no rate
    // limiting needed since the authed tier is already governed).
    let _ = peer;
    // Decode base64 payloads (Judge0-compat).
    if req.base64_encoded {
        let raw = req.source_code.as_utf8().map_err(|_| {
            ApiError::Validation("base64_encoded source_code must be a UTF-8 string".into())
        })?;
        req.source_code = Payload::from_base64(raw)
            .map_err(|e| ApiError::Validation(format!("source_code base64 decode: {e}")))?;

        for (i, tc) in req.test_cases.iter_mut().enumerate() {
            if let Some(stdin) = &tc.stdin {
                let raw = stdin.as_utf8().map_err(|_| {
                    ApiError::Validation(format!(
                        "base64_encoded test_cases[{i}].stdin must be a UTF-8 string"
                    ))
                })?;
                tc.stdin = Some(Payload::from_base64(raw).map_err(|e| {
                    ApiError::Validation(format!("test_cases[{i}].stdin base64 decode: {e}"))
                })?);
            }
        }
    }

    // Validate inputs.
    if req.test_cases.is_empty() {
        return Err(ApiError::Validation(
            "test_cases must contain at least one entry".into(),
        ));
    }
    if req.test_cases.len() > MAX_TEST_CASES {
        return Err(ApiError::Validation(format!(
            "test_cases cannot exceed {MAX_TEST_CASES} entries (got {})",
            req.test_cases.len()
        )));
    }
    if req.source_code.is_empty() {
        return Err(ApiError::Validation("source_code must be non-empty".into()));
    }
    req.source_code
        .check_size("source_code", MAX_SOURCE_BYTES)
        .map_err(|e| ApiError::Validation(e.to_string()))?;
    for (i, tc) in req.test_cases.iter().enumerate() {
        if let Some(stdin) = &tc.stdin {
            stdin
                .check_size(&format!("test_cases[{i}].stdin"), MAX_STDIN_BYTES)
                .map_err(|e| ApiError::Validation(e.to_string()))?;
        }
    }

    // Resolve language + limits (one set shared across the whole batch).
    let spec = state.languages().require(req.language_id)?;
    let defaults = spec.default_limits.unwrap_or_default();
    let limits = {
        let mut lim = defaults;
        if let Some(v) = req.cpu_time_limit {
            lim.cpu_time = v;
        }
        if let Some(v) = req.wall_time_limit {
            lim.wall_time = v;
        }
        if let Some(v) = req.memory_limit_mb {
            lim.memory_mb = v;
        }
        lim.validate(&state.config().limit_ceiling)
            .map_err(|e| ApiError::Validation(e.to_string()))?;
        lim
    };

    // One ULID identifies the whole batch.
    let batch_id = Ulid::new().to_string();

    let mut tokens = Vec::with_capacity(req.test_cases.len());
    let notifier = JobNotifier::new(state.pool().clone());

    for tc in &req.test_cases {
        let token = Token::new();
        let new = NewSubmission {
            token,
            language_id: req.language_id,
            source_code: req.source_code.as_bytes(),
            stdin: tc.stdin.as_ref().map(Payload::as_bytes),
            limits,
            callback_url: None,
            idempotency_key: None,
            idempotency_hash: None,
            batch_id: Some(&batch_id),
        };
        db::insert_submission(state.pool(), &new).await?;
        notifier
            .notify(token)
            .await
            .map_err(|e| ApiError::Internal(format!("notify worker: {e}")))?;
        tokens.push(token.to_string());
    }

    metrics::counter!("zerocode_batches_created_total").increment(1);
    metrics::counter!("zerocode_submissions_created_total").increment(tokens.len() as u64);

    Ok((
        StatusCode::CREATED,
        Json(BatchAck {
            batch_id,
            count: tokens.len(),
            tokens,
            status: "queued",
        }),
    )
        .into_response())
}

pub async fn get(
    State(state): State<AppState>,
    Path(batch_id): Path<String>,
) -> ApiResult<Json<BatchView>> {
    // Cheap sanity check — keeps unintended bare paths off the query plan.
    Ulid::from_string(&batch_id)
        .map_err(|_| ApiError::Validation("batch_id must be a ULID".into()))?;

    let subs = db::list_batch(state.pool(), &batch_id).await?;
    if subs.is_empty() {
        return Err(ApiError::NotFound);
    }

    let summary = summarise(&subs);
    let items = subs.into_iter().map(SubmissionView::from).collect();

    Ok(Json(BatchView {
        batch_id,
        items,
        summary,
    }))
}

fn summarise(subs: &[Submission]) -> BatchSummary {
    let mut s = BatchSummary {
        total: subs.len(),
        queued: 0,
        processing: 0,
        accepted: 0,
        failed: 0,
    };
    for sub in subs {
        match sub.status {
            Status::Queued => s.queued += 1,
            Status::Processing => s.processing += 1,
            Status::Accepted => s.accepted += 1,
            Status::TimeLimitExceeded(TimeLimitKind::Wall)
            | Status::TimeLimitExceeded(TimeLimitKind::Cpu)
            | Status::CompileError
            | Status::MemoryLimitExceeded
            | Status::OutputLimitExceeded
            | Status::RuntimeError(_)
            | Status::NonZeroExit(_)
            | Status::SandboxFailure
            | Status::InternalError
            | Status::Cancelled
            | Status::Expired => s.failed += 1,
        }
    }
    s
}

#[utoipa::path(
    post, path = "/v1/submissions/batch", tag = "submissions",
    summary = "Create a batch of submissions",
    description = "Submits one program against 1–100 stdin test cases. Server \
                   creates N independent submission rows tied by a shared \
                   `batch_id` ULID. Workers process each as a normal submission, \
                   so per-case result caching and webhooks all keep working. \
                   Poll `GET /v1/batches/{batch_id}` for aggregated results.",
    security(("bearer" = [])),
    request_body = crate::openapi::BatchRequestBody,
    responses(
        (status = 201, description = "Batch created", body = crate::openapi::BatchAckBody),
        (status = 401, description = "Missing or invalid bearer", body = crate::openapi::ErrorBody),
        (status = 413, description = "A field exceeds the size cap", body = crate::openapi::ErrorBody),
        (status = 422, description = "Validation error (empty/oversize test_cases, unknown lang, limits over ceiling, …)", body = crate::openapi::ErrorBody),
        (status = 429, description = "Rate-limited", body = crate::openapi::ErrorBody),
    ),
)]
#[allow(dead_code)]
pub fn create_doc() {}

#[utoipa::path(
    get, path = "/v1/batches/{batch_id}", tag = "submissions",
    summary = "Fetch a batch",
    description = "Returns every submission belonging to a batch in insertion \
                   order plus a status summary (queued / processing / accepted / \
                   failed counts).",
    security(("bearer" = [])),
    params(
        ("batch_id" = String, Path, description = "ULID returned by `POST /v1/submissions/batch`"),
    ),
    responses(
        (status = 200, description = "Batch view", body = crate::openapi::BatchViewBody),
        (status = 401, description = "Missing or invalid bearer", body = crate::openapi::ErrorBody),
        (status = 404, description = "Unknown batch_id", body = crate::openapi::ErrorBody),
        (status = 422, description = "Malformed batch_id (not a ULID)", body = crate::openapi::ErrorBody),
    ),
)]
#[allow(dead_code)]
pub fn get_doc() {}
