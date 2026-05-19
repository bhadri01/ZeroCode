//! OpenAPI 3.1 spec for the public REST API.
//!
//! Schema types here mirror the *wire shapes* returned by handlers, not the
//! internal DB/sandbox types. The decoupling means spec evolution doesn't
//! force changes inside `zerocode-core`. The drift cost is paid by review:
//! when a handler response changes, the matching schema struct here must
//! change too.
//!
//! Generated spec is served at `GET /v1/openapi.json` and can be fed to
//! `openapi-generator` / `oapi-codegen` to produce SDKs.

use serde::{Deserialize, Serialize};
use utoipa::{OpenApi, ToSchema};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "ZeroCode API",
        description = "Sandboxed code execution service. Submit source code for any of 41 supported languages, get stdout/stderr/exit metadata back. See `/v1/about` for runtime version and `/v1/languages` for the active language registry.",
        version = env!("CARGO_PKG_VERSION"),
        contact(name = "ZeroCode", url = "https://github.com/anthropics/zerocode"),
        license(name = "Apache-2.0 OR MIT"),
    ),
    servers(
        (url = "/", description = "Same-origin (relative)"),
        (url = "http://localhost:8080", description = "Local dev"),
    ),
    paths(
        crate::routes::health::liveness_doc,
        crate::routes::health::readiness_doc,
        crate::routes::meta::about_doc,
        crate::routes::languages::list_doc,
        crate::routes::submissions::create_doc,
        crate::routes::submissions::get_doc,
        crate::routes::submissions::list_doc,
        crate::routes::streaming::stream_doc,
        crate::routes::batches::create_doc,
        crate::routes::batches::get_doc,
    ),
    components(schemas(
        HealthBody,
        AboutBody,
        LanguageEntry,
        LanguagesBody,
        SubmissionRequestBody,
        SubmissionAckBody,
        SubmissionViewBody,
        SubmissionListBody,
        ResourceLimitsBody,
        BatchTestCaseBody,
        BatchRequestBody,
        BatchAckBody,
        BatchSummaryBody,
        BatchViewBody,
        ErrorBody,
    )),
    tags(
        (name = "submissions", description = "Submit code and fetch results"),
        (name = "languages", description = "Active language registry"),
        (name = "ops", description = "Liveness, readiness, metadata"),
    ),
)]
pub struct ApiDoc;

// ---------- response/request shape mirrors ----------

#[derive(Serialize, Deserialize, ToSchema)]
pub struct HealthBody {
    /// Always `"ok"` when the service is up. Readiness is a stricter signal.
    #[schema(example = "ok")]
    pub status: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct AboutBody {
    /// Service name (always `"zerocode-api"` from this binary).
    pub service: String,
    /// Crate version, taken from `Cargo.toml` at build time.
    pub version: String,
    /// Build profile (`"release"` for production, `"debug"` for dev).
    pub build_profile: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct LanguageEntry {
    /// Stable Judge0-compatible numeric ID (e.g. `71` for Python 3.13).
    pub id: u32,
    /// Display name, e.g. `"Python"`.
    pub name: String,
    /// Toolchain version string, e.g. `"3.13.0"`.
    pub version: String,
    /// `true` if the language is hidden from new submissions.
    pub is_archived: bool,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct LanguagesBody {
    pub languages: Vec<LanguageEntry>,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct SubmissionRequestBody {
    /// Numeric ID from `GET /v1/languages`.
    #[schema(example = 71)]
    pub language_id: u32,
    /// Source code. Plain UTF-8 by default; base64 when `base64_encoded=true`.
    #[schema(example = "print('hello')")]
    pub source_code: String,
    /// Optional stdin payload. Same encoding rules as `source_code`.
    pub stdin: Option<String>,
    /// CPU-time ceiling in seconds (1.0–30.0). Falls back to server default if unset.
    pub cpu_time_limit: Option<f64>,
    /// Wall-clock ceiling in seconds (1.0–60.0).
    pub wall_time_limit: Option<f64>,
    /// Memory ceiling in MB (16–1024).
    pub memory_limit_mb: Option<u32>,
    /// HTTPS URL the worker POSTs to when the submission finishes. Must NOT
    /// resolve to loopback/private/.internal addresses.
    pub callback_url: Option<String>,
    /// When `true`, `source_code` and `stdin` are decoded from base64.
    #[serde(default)]
    pub base64_encoded: bool,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct SubmissionAckBody {
    /// Opaque ULID handle. Use it in subsequent `GET` requests.
    #[schema(example = "01ABCDEFGHJKMNPQRSTVWXYZ0")]
    pub token: String,
    /// Initial status — usually `"queued"`. Settled by the worker.
    #[schema(example = "queued")]
    pub status: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct ResourceLimitsBody {
    pub cpu_time: f64,
    pub wall_time: f64,
    pub memory_mb: u32,
    pub max_pids: u32,
    pub enable_network: bool,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct SubmissionViewBody {
    pub token: String,
    pub language_id: u32,
    /// One of: `queued`, `processing`, `accepted`, `compile_error`,
    /// `runtime_error`, `time_limit_exceeded`, `memory_limit_exceeded`,
    /// `output_limit_exceeded`, `non_zero_exit`, `sandbox_failure`,
    /// `internal_error`, `cancelled`, `expired`.
    pub status: serde_json::Value,
    pub limits: ResourceLimitsBody,
    /// UTF-8 string, or `{"_b64": "..."}` for binary, or omitted if absent.
    pub stdout: Option<serde_json::Value>,
    pub stderr: Option<serde_json::Value>,
    pub compile_output: Option<serde_json::Value>,
    pub exit_code: Option<i32>,
    /// POSIX signal name when killed (e.g. `"SIGSEGV"`).
    pub signal: Option<String>,
    /// CPU time consumed (seconds).
    pub time: Option<f64>,
    pub wall_time: Option<f64>,
    /// Peak resident memory (KB).
    pub memory: Option<u32>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct SubmissionListBody {
    pub items: Vec<SubmissionViewBody>,
    pub page: u32,
    pub per_page: u32,
    pub total: i64,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct BatchTestCaseBody {
    /// Per-case stdin. Plain UTF-8 by default; base64 when the parent request
    /// has `base64_encoded=true`.
    pub stdin: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct BatchRequestBody {
    #[schema(example = 71)]
    pub language_id: u32,
    #[schema(example = "import sys; print(int(sys.stdin.read()) * 2)")]
    pub source_code: String,
    /// 1–100 test cases. Each becomes an independent submission row sharing
    /// one `batch_id`.
    pub test_cases: Vec<BatchTestCaseBody>,
    pub cpu_time_limit: Option<f64>,
    pub wall_time_limit: Option<f64>,
    pub memory_limit_mb: Option<u32>,
    #[serde(default)]
    pub base64_encoded: bool,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct BatchAckBody {
    #[schema(example = "01HX1ABCDEFGHJKMNPQRSTVWXY")]
    pub batch_id: String,
    pub count: usize,
    pub tokens: Vec<String>,
    #[schema(example = "queued")]
    pub status: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct BatchSummaryBody {
    pub total: usize,
    pub queued: usize,
    pub processing: usize,
    pub accepted: usize,
    /// Count of any submission in a non-`accepted` terminal state
    /// (`compile_error`, `runtime_error`, TLE, MLE, etc.).
    pub failed: usize,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct BatchViewBody {
    pub batch_id: String,
    pub items: Vec<SubmissionViewBody>,
    pub summary: BatchSummaryBody,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct ErrorBody {
    /// Machine-readable error code, e.g. `"validation_error"`, `"not_found"`.
    pub error: String,
    /// Human-readable description.
    pub message: String,
    /// Set on `409 Conflict` when an idempotency key resolves to an existing token.
    pub existing_token: Option<String>,
}
