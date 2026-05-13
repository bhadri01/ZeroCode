//! gRPC service implementation. Mirrors the REST API surface for clients
//! that prefer binary protocol + HTTP/2 multiplexing.
//!
//! Listens on `ZEROCODE_GRPC_BIND` (default `0.0.0.0:9091`) alongside the
//! REST server on `ZEROCODE_API_BIND`. Both share the same `AppState`, so
//! the result cache, idempotency, and rate-limit state remain consistent
//! across protocols.
//!
//! Auth: the gRPC server uses the same bearer-token scheme as REST — the
//! `Authorization: Bearer <key>` metadata header is required on every
//! call except `GetHealth`.

use tonic::{Request, Response, Status};
use zerocode_core::{LanguageId, Payload, ResourceLimits, Submission, Token};
use zerocode_stream::jobs::JobNotifier;

use crate::db::{self, NewSubmission};
use crate::state::AppState;

// tonic-build generates this from proto/zerocode.proto.
pub mod pb {
    tonic::include_proto!("zerocode.v2");
}

/// Embedded FileDescriptorSet emitted by tonic-build. Used by
/// `tonic-reflection` so clients (grpcurl, BloomRPC, …) can discover the
/// service schema without the .proto file:
///
///   grpcurl -plaintext localhost:9091 list
///   grpcurl -plaintext localhost:9091 zerocode.v2.ZeroCode/GetHealth
pub const FILE_DESCRIPTOR_SET: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/zerocode_descriptor.bin"));

use pb::zero_code_server::{ZeroCode, ZeroCodeServer};
use pb::{
    CreateSubmissionRequest, CreateSubmissionResponse, GetHealthRequest, GetHealthResponse,
    GetSubmissionRequest, Language, ListLanguagesRequest, ListLanguagesResponse, SubmissionView,
};

const SOURCE_BYTES_CAP: usize = 64 * 1024;
const STDIN_BYTES_CAP: usize = 64 * 1024;

/// Constructor returns the tonic-wrapped service ready to add to a `Server`
/// builder via `.add_service(...)`.
pub fn service(state: AppState) -> ZeroCodeServer<ZeroCodeService> {
    ZeroCodeServer::new(ZeroCodeService { state })
}

pub struct ZeroCodeService {
    state: AppState,
}

#[tonic::async_trait]
impl ZeroCode for ZeroCodeService {
    async fn create_submission(
        &self,
        req: Request<CreateSubmissionRequest>,
    ) -> Result<Response<CreateSubmissionResponse>, Status> {
        self.require_bearer(req.metadata())?;
        let req = req.into_inner();

        // Validation mirrors the REST handler (`MAX_SOURCE_BYTES`, etc.).
        if req.source_code.is_empty() {
            return Err(Status::invalid_argument("source_code must be non-empty"));
        }
        if req.source_code.len() > SOURCE_BYTES_CAP {
            return Err(Status::invalid_argument(format!(
                "source_code exceeds {SOURCE_BYTES_CAP} bytes"
            )));
        }
        if req.stdin.len() > STDIN_BYTES_CAP {
            return Err(Status::invalid_argument(format!(
                "stdin exceeds {STDIN_BYTES_CAP} bytes"
            )));
        }

        let spec = self
            .state
            .languages()
            .require(req.language_id as LanguageId)
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        let defaults = spec.default_limits.unwrap_or_default();
        let limits = {
            let mut lim = defaults;
            if req.cpu_time_limit > 0.0 {
                lim.cpu_time = req.cpu_time_limit;
            }
            if req.wall_time_limit > 0.0 {
                lim.wall_time = req.wall_time_limit;
            }
            if req.memory_limit_mb > 0 {
                lim.memory_mb = req.memory_limit_mb;
            }
            lim.validate(&self.state.config().limit_ceiling)
                .map_err(|e| Status::invalid_argument(e.to_string()))?;
            lim
        };

        // Idempotency dedup (same window + body-hash discriminant as REST).
        let body_hash = idem_hash(&req, &limits);
        if !req.idempotency_key.is_empty() {
            if let Some(hit) = db::find_by_idempotency_key(
                self.state.pool(),
                &req.idempotency_key,
                &body_hash,
            )
            .await
            .map_err(internal_err)?
            {
                if hit.body_matches {
                    return Ok(Response::new(CreateSubmissionResponse {
                        token: hit.token,
                        status: "queued".into(),
                    }));
                } else {
                    return Err(Status::already_exists(format!(
                        "idempotency_key conflict; existing token: {}",
                        hit.token
                    )));
                }
            }
        }

        let callback_url = (!req.callback_url.is_empty()).then(|| req.callback_url.clone());
        let idem_key = (!req.idempotency_key.is_empty()).then(|| req.idempotency_key.clone());

        let token = Token::new();
        let new = NewSubmission {
            token,
            language_id: req.language_id as LanguageId,
            source_code: &req.source_code,
            stdin: (!req.stdin.is_empty()).then_some(req.stdin.as_slice()),
            limits,
            callback_url: callback_url.as_deref(),
            idempotency_key: idem_key.as_deref(),
            idempotency_hash: idem_key.as_ref().map(|_| body_hash.as_slice()),
            batch_id: None,
        };
        db::insert_submission(self.state.pool(), &new)
            .await
            .map_err(internal_err)?;

        let notifier = JobNotifier::new(self.state.pool().clone());
        notifier
            .notify(token)
            .await
            .map_err(|e| Status::internal(format!("notify worker: {e}")))?;

        ::metrics::counter!("zerocode_submissions_created_total").increment(1);
        ::metrics::counter!("zerocode_grpc_create_submission_total").increment(1);

        Ok(Response::new(CreateSubmissionResponse {
            token: token.to_string(),
            status: "queued".into(),
        }))
    }

    async fn get_submission(
        &self,
        req: Request<GetSubmissionRequest>,
    ) -> Result<Response<SubmissionView>, Status> {
        self.require_bearer(req.metadata())?;
        let token: Token = req
            .into_inner()
            .token
            .parse()
            .map_err(|_| Status::invalid_argument("token format invalid"))?;

        let sub = db::fetch_submission(self.state.pool(), token)
            .await
            .map_err(internal_err)?
            .ok_or_else(|| Status::not_found("unknown token"))?;

        Ok(Response::new(to_view(&sub)))
    }

    async fn list_languages(
        &self,
        req: Request<ListLanguagesRequest>,
    ) -> Result<Response<ListLanguagesResponse>, Status> {
        self.require_bearer(req.metadata())?;
        let languages = self
            .state
            .languages()
            .list()
            .into_iter()
            .map(|spec| Language {
                id: spec.id,
                name: spec.name.clone(),
                version: spec.version.clone(),
                source_file: spec.source_file.clone(),
                is_compiled: spec.is_compiled(),
                is_archived: spec.is_archived,
            })
            .collect();
        Ok(Response::new(ListLanguagesResponse { languages }))
    }

    async fn get_health(
        &self,
        _req: Request<GetHealthRequest>,
    ) -> Result<Response<GetHealthResponse>, Status> {
        // Unauthenticated (matches `/v1/health` + `/v1/ready` REST endpoints
        // which are also unauthenticated for K8s probes).
        let depth = db::queue_depth(self.state.pool())
            .await
            .map_err(internal_err)?;
        let ready = matches!(db::classify_queue_depth(depth), db::QueueState::Healthy);
        Ok(Response::new(GetHealthResponse {
            status: "ok".into(),
            ready,
            queue_depth: depth,
        }))
    }
}

impl ZeroCodeService {
    /// Constant-time bearer-token compare against the configured `ZEROCODE_API_KEY`.
    /// Mirrors `auth::require_bearer` from the REST middleware.
    fn require_bearer(&self, meta: &tonic::metadata::MetadataMap) -> Result<(), Status> {
        use subtle::ConstantTimeEq;

        let header = meta
            .get("authorization")
            .ok_or_else(|| Status::unauthenticated("missing authorization metadata"))?;
        let value = header
            .to_str()
            .map_err(|_| Status::unauthenticated("authorization metadata is not ASCII"))?;
        let token = value
            .strip_prefix("Bearer ")
            .ok_or_else(|| Status::unauthenticated("authorization must be `Bearer <key>`"))?;
        let expected = self.state.config().api_key.as_bytes();
        if token.as_bytes().ct_eq(expected).into() {
            Ok(())
        } else {
            Err(Status::unauthenticated("invalid api key"))
        }
    }
}

fn to_view(s: &Submission) -> SubmissionView {
    let (status_text, status_detail) = encode_status(&s.status);
    SubmissionView {
        token: s.token.to_string(),
        language_id: s.language_id,
        status: status_text.into(),
        status_detail_json: status_detail.unwrap_or_default(),
        limits: Some(to_limits(&s.limits)),
        stdout: s
            .stdout
            .as_ref()
            .map(|p| p.as_bytes().to_vec())
            .unwrap_or_default(),
        stderr: s
            .stderr
            .as_ref()
            .map(|p| p.as_bytes().to_vec())
            .unwrap_or_default(),
        compile_output: s
            .compile_output
            .as_ref()
            .map(|p| p.as_bytes().to_vec())
            .unwrap_or_default(),
        exit_code: s.exit_code.unwrap_or(-1),
        signal_name: s.signal.as_ref().map(|sg| format!("{sg:?}")).unwrap_or_default(),
        cpu_time: s.cpu_time.unwrap_or(0.0),
        wall_time: s.wall_time.unwrap_or(0.0),
        memory: s.memory_kb.unwrap_or(0),
        created_at: s.created_at.to_rfc3339(),
        finished_at: s
            .finished_at
            .as_ref()
            .map(|t| t.to_rfc3339())
            .unwrap_or_default(),
    }
}

fn to_limits(l: &ResourceLimits) -> pb::ResourceLimits {
    pb::ResourceLimits {
        cpu_time: l.cpu_time,
        wall_time: l.wall_time,
        memory_mb: l.memory_mb,
        max_pids: l.max_pids,
        enable_network: l.enable_network,
    }
}

fn encode_status(s: &zerocode_core::Status) -> (&'static str, Option<String>) {
    use zerocode_core::Status as S;
    use zerocode_core::status::TimeLimitKind;
    match s {
        S::Queued => ("queued", None),
        S::Processing => ("processing", None),
        S::Accepted => ("accepted", None),
        S::TimeLimitExceeded(TimeLimitKind::Wall) => ("time_limit_exceeded", Some("\"wall\"".into())),
        S::TimeLimitExceeded(TimeLimitKind::Cpu) => ("time_limit_exceeded", Some("\"cpu\"".into())),
        S::CompileError => ("compile_error", None),
        S::MemoryLimitExceeded => ("memory_limit_exceeded", None),
        S::OutputLimitExceeded => ("output_limit_exceeded", None),
        S::RuntimeError(_) => ("runtime_error", None),
        S::NonZeroExit(code) => ("non_zero_exit", Some(code.to_string())),
        S::SandboxFailure => ("sandbox_failure", None),
        S::InternalError => ("internal_error", None),
        S::Cancelled => ("cancelled", None),
        S::Expired => ("expired", None),
    }
}

/// Blake3 hash matching the REST idempotency hash discriminant. Includes
/// language, source, stdin, limits, callback URL so distinct submissions
/// don't collide on the dedup window.
fn idem_hash(req: &CreateSubmissionRequest, limits: &ResourceLimits) -> Vec<u8> {
    let mut h = blake3::Hasher::new();
    h.update(&req.language_id.to_le_bytes());
    h.update(&req.source_code);
    h.update(&[0]); // separator
    h.update(&req.stdin);
    h.update(&[0]);
    h.update(&limits.cpu_time.to_le_bytes());
    h.update(&limits.wall_time.to_le_bytes());
    h.update(&limits.memory_mb.to_le_bytes());
    h.update(req.callback_url.as_bytes());
    h.finalize().as_bytes().to_vec()
}

fn internal_err<E: std::fmt::Display>(e: E) -> Status {
    Status::internal(format!("internal: {e}"))
}

// Silence the unused `Payload` import warning until/unless a future change
// uses it; keeping the import scoped here documents the type relationship.
#[allow(dead_code)]
fn _payload_marker(_: Payload) {}
