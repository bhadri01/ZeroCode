use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use blake3::Hasher;
use serde::Serialize;
use zerocode_core::{
    LanguageId, Payload, ResourceLimits, Signal, Status, Submission, SubmissionRequest, Token,
};

use crate::db::{self, NewSubmission};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_STDIN_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
pub struct SubmissionAck {
    pub token: String,
    pub status: &'static str,
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SubmissionRequest>,
) -> ApiResult<(StatusCode, Json<SubmissionAck>)> {
    // Validate inputs.
    if req.source_code.is_empty() {
        return Err(ApiError::Validation("source_code must be non-empty".into()));
    }
    req.source_code
        .check_size("source_code", MAX_SOURCE_BYTES)
        .map_err(|e| ApiError::Validation(e.to_string()))?;
    if let Some(stdin) = &req.stdin {
        stdin
            .check_size("stdin", MAX_STDIN_BYTES)
            .map_err(|e| ApiError::Validation(e.to_string()))?;
    }

    // Resolve language and limits.
    let spec = state.languages().require(req.language_id)?;
    let defaults = spec.default_limits.unwrap_or_default();
    let limits = req.resolve_limits(defaults, &state.config().limit_ceiling)?;

    // Callback URL safety: reject loopback / private ranges to head off SSRF.
    if let Some(url) = &req.callback_url {
        validate_callback_url(url)?;
    }

    // Idempotency dedup.
    let body_hash = idempotency_hash(&req);
    let idem_key = headers
        .get("idempotency-key")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_owned());

    if let Some(key) = idem_key.as_deref() {
        if let Some(hit) = db::find_by_idempotency_key(state.pool(), key, &body_hash).await? {
            return if hit.body_matches {
                Ok((
                    StatusCode::OK,
                    Json(SubmissionAck {
                        token: hit.token,
                        status: "queued",
                    }),
                ))
            } else {
                Err(ApiError::IdempotencyConflict {
                    existing_token: hit.token,
                })
            };
        }
    }

    // Insert + notify.
    let token = Token::new();
    let new = NewSubmission {
        token,
        language_id: req.language_id,
        source_code: req.source_code.as_bytes(),
        stdin: req.stdin.as_ref().map(Payload::as_bytes),
        limits,
        callback_url: req.callback_url.as_ref().map(|u| u.as_str()),
        idempotency_key: idem_key.as_deref(),
        idempotency_hash: idem_key.as_ref().map(|_| body_hash.as_slice()),
    };
    db::insert_submission(state.pool(), &new).await?;
    state
        .jobs()
        .notify(token)
        .await
        .map_err(|e| ApiError::Internal(format!("pg_notify failed: {e}")))?;

    let _ = &spec; // retained for clarity that we resolved a real language
    let _: LanguageId = req.language_id;

    Ok((
        StatusCode::CREATED,
        Json(SubmissionAck {
            token: token.to_string(),
            status: "queued",
        }),
    ))
}

pub async fn get(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Json<SubmissionView>> {
    let token: Token = token
        .parse()
        .map_err(|_| ApiError::Validation("token format invalid".into()))?;

    let sub = db::fetch_submission(state.pool(), token).await?;
    sub.map(|s| Json(SubmissionView::from(s)))
        .ok_or(ApiError::NotFound)
}

/// Wire shape — keeps the DB row form (`Submission` from zerocode-core)
/// decoupled from the HTTP response so future v2 fields can land without DB
/// migrations.
#[derive(Serialize)]
pub struct SubmissionView {
    pub token: String,
    pub language_id: u32,
    pub status: Status,
    pub limits: ResourceLimits,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<Payload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<Payload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compile_output: Option<Payload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<Signal>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wall_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<u32>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
}

impl From<Submission> for SubmissionView {
    fn from(s: Submission) -> Self {
        Self {
            token: s.token.to_string(),
            language_id: s.language_id,
            status: s.status,
            limits: s.limits,
            stdout: s.stdout,
            stderr: s.stderr,
            compile_output: s.compile_output,
            exit_code: s.exit_code,
            signal: s.signal,
            time: s.cpu_time,
            wall_time: s.wall_time,
            memory: s.memory_kb,
            created_at: s.created_at.to_rfc3339(),
            finished_at: s.finished_at.map(|d| d.to_rfc3339()),
        }
    }
}

fn idempotency_hash(req: &SubmissionRequest) -> Vec<u8> {
    let mut h = Hasher::new();
    h.update(b"zerocode/idem/v1\0");
    h.update(&req.language_id.to_le_bytes());
    h.update(&(req.source_code.len() as u64).to_le_bytes());
    h.update(req.source_code.as_bytes());
    if let Some(stdin) = &req.stdin {
        h.update(&(stdin.len() as u64).to_le_bytes());
        h.update(stdin.as_bytes());
    } else {
        h.update(&0_u64.to_le_bytes());
    }
    h.finalize().as_bytes().to_vec()
}

fn validate_callback_url(url: &url::Url) -> ApiResult<()> {
    // Scheme guardrail
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ApiError::Validation(format!(
            "callback_url scheme '{}' not allowed",
            url.scheme()
        )));
    }
    // Host present (no `file://` style URLs)
    let host = url
        .host_str()
        .ok_or_else(|| ApiError::Validation("callback_url missing host".into()))?;

    // SSRF guardrail: reject obvious loopback/metadata hosts. Fully resolving
    // DNS is left to the webhook delivery layer; this is the cheap synchronous
    // gate at submit time.
    let host_lower = host.to_ascii_lowercase();
    let bad_hosts = ["localhost", "metadata.google.internal", "169.254.169.254"];
    if bad_hosts.iter().any(|b| host_lower == *b) {
        return Err(ApiError::Validation(format!(
            "callback_url host '{host}' is on the deny list"
        )));
    }
    if host_lower.ends_with(".internal") {
        return Err(ApiError::Validation(
            "callback_url host '.internal' is on the deny list".into(),
        ));
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if is_private_or_loopback(ip) {
            return Err(ApiError::Validation(format!(
                "callback_url ip {ip} is private/loopback"
            )));
        }
    }
    Ok(())
}

fn is_private_or_loopback(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
        }
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.segments()[0] == 0xfe80
                || v6.segments()[0] & 0xfe00 == 0xfc00
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(source: &str) -> SubmissionRequest {
        SubmissionRequest {
            language_id: 71,
            source_code: Payload::from(source),
            stdin: None,
            cpu_time_limit: None,
            wall_time_limit: None,
            memory_limit_mb: None,
            callback_url: None,
        }
    }

    #[test]
    fn idempotency_hash_is_deterministic() {
        let r = req("print(1)");
        assert_eq!(idempotency_hash(&r), idempotency_hash(&r));
    }

    #[test]
    fn idempotency_hash_changes_with_source() {
        assert_ne!(idempotency_hash(&req("print(1)")), idempotency_hash(&req("print(2)")));
    }

    #[test]
    fn validate_callback_rejects_loopback_ip() {
        let u = url::Url::parse("http://127.0.0.1/cb").unwrap();
        assert!(validate_callback_url(&u).is_err());
    }

    #[test]
    fn validate_callback_rejects_metadata_host() {
        let u = url::Url::parse("http://169.254.169.254/cb").unwrap();
        assert!(validate_callback_url(&u).is_err());
    }

    #[test]
    fn validate_callback_rejects_localhost_name() {
        let u = url::Url::parse("http://localhost/cb").unwrap();
        assert!(validate_callback_url(&u).is_err());
    }

    #[test]
    fn validate_callback_accepts_public_https() {
        let u = url::Url::parse("https://example.com/cb").unwrap();
        assert!(validate_callback_url(&u).is_ok());
    }

    #[test]
    fn validate_callback_rejects_private_ipv4() {
        let u = url::Url::parse("http://10.0.0.1/cb").unwrap();
        assert!(validate_callback_url(&u).is_err());
        let u = url::Url::parse("http://192.168.0.1/cb").unwrap();
        assert!(validate_callback_url(&u).is_err());
        let u = url::Url::parse("http://169.254.0.1/cb").unwrap();
        assert!(validate_callback_url(&u).is_err());
    }
}
