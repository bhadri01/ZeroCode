//! `GET /v1/statuses` — the complete status vocabulary, machine-readable.
//!
//! Exists because a customer integrating against us mapped our statuses onto
//! their own enum, treated anything unrecognised as a success, and only
//! discovered `sandbox_failure` by hitting it during production-scale testing —
//! at which point an internal fault of ours had already been scored as a wrong
//! answer against a student.
//!
//! `docs/STATUS.md` documents the same vocabulary for humans, but a document
//! can drift and cannot be asserted against at integration time. This endpoint
//! is generated from [`Status::ALL`] in `zerocode-core`, which a test keeps
//! exhaustive, so it cannot silently fall behind the code: adding a variant
//! without listing it fails the build.
//!
//! The three booleans are the entire contract a grader needs:
//!
//! * `terminal`  — the submission will not change again; stop polling.
//! * `verdict`   — this describes the SUBMITTED CODE. Only these may be graded.
//! * `retryable` — resubmitting identical work may produce a different answer.
//!
//! A client should grade only `verdict: true` and treat everything else —
//! including any `kind` it does not recognise — as an engine fault.

use axum::Json;
use serde::Serialize;
use zerocode_core::Status;

#[derive(Serialize)]
pub struct StatusView {
    /// The `status.kind` string this variant serialises to.
    pub kind: &'static str,
    /// Submission will not change again.
    pub terminal: bool,
    /// Describes the submitted code, and is therefore safe to grade and to cache.
    pub verdict: bool,
    /// Resubmitting identical work may produce a different answer.
    pub retryable: bool,
    /// What the status means, in one line.
    pub description: &'static str,
}

#[derive(Serialize)]
pub struct StatusVocabulary {
    /// Bumped when a variant is added or its semantics change, so a client can
    /// assert it still understands the vocabulary it was written against.
    pub vocabulary_version: u32,
    /// How a client should treat a `kind` it does not recognise. Always
    /// `"not_a_verdict"` — fail closed, never grade it.
    pub unknown_kind_policy: &'static str,
    pub statuses: Vec<StatusView>,
}

/// Incremented on any change to the set of kinds or their three booleans.
const VOCABULARY_VERSION: u32 = 1;

fn describe(s: &Status) -> &'static str {
    use Status as S;
    match s {
        S::Queued => "Accepted and persisted, not yet claimed by a worker.",
        S::Processing => "A worker holds the claim; execution is in progress.",
        S::Accepted => {
            "Ran to completion and exited 0 within every limit. Compare stdout yourself — ZeroCode executes, it does not grade."
        }
        S::CompileError => {
            "The compile phase exited non-zero. Diagnostics are in compile_output; the program never ran, so stdout/stderr are empty."
        }
        S::RuntimeError(_) => "Killed by a signal. detail carries the signal name.",
        S::NonZeroExit(_) => "Ran to completion but exited non-zero. detail carries the exit code.",
        S::TimeLimitExceeded(_) => {
            "Exhausted a time budget. detail is \"wall\" or \"cpu\". The compile phase has its own budget, so this always refers to the submitted program."
        }
        S::MemoryLimitExceeded => "The cgroup reported an OOM kill during the run phase.",
        S::OutputLimitExceeded => {
            "Exceeded the stdout/stderr cap; output is truncated at the limit."
        }
        S::SandboxFailure => {
            "We could not execute the submission — the sandbox failed to build or its result was lost. Says NOTHING about the code. Never grade this."
        }
        S::InternalError => {
            "Any other fault on our side. Says NOTHING about the code. Never grade this."
        }
        S::Cancelled => "Cancelled through the API before completion.",
        S::Expired => {
            "Past the retention TTL; the row stub remains for audit but outputs are gone."
        }
    }
}

pub async fn list() -> Json<StatusVocabulary> {
    Json(StatusVocabulary {
        vocabulary_version: VOCABULARY_VERSION,
        unknown_kind_policy: "not_a_verdict",
        statuses: Status::ALL
            .iter()
            .map(|s| StatusView {
                kind: s.kind(),
                terminal: s.is_terminal(),
                verdict: s.is_verdict(),
                retryable: s.is_retryable(),
                description: describe(s),
            })
            .collect(),
    })
}

#[utoipa::path(
    get, path = "/v1/statuses", tag = "meta",
    summary = "The complete status vocabulary",
    description = "Every `status.kind` the API can return, each marked terminal / \
                   verdict / retryable. Generated from the same enum the engine \
                   uses, so it cannot drift from the implementation.\n\n\
                   Grade ONLY entries with `verdict: true`. Treat every other \
                   kind — and any kind absent from this list — as an engine \
                   fault, never as a result: non-verdict statuses carry empty \
                   stdout, so comparing stdout to expected output would score a \
                   correct program as wrong.",
    responses(
        (status = 200, description = "Status vocabulary"),
    ),
)]
#[allow(dead_code)]
pub fn list_doc() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn vocabulary_covers_every_variant_and_marks_faults_non_verdict() {
        let Json(v) = list().await;
        assert_eq!(v.statuses.len(), Status::ALL.len());
        assert_eq!(v.unknown_kind_policy, "not_a_verdict");

        let by = |k: &str| {
            v.statuses
                .iter()
                .find(|s| s.kind == k)
                .unwrap_or_else(|| panic!("{k} missing from the published vocabulary"))
        };
        // The whole point of the endpoint: our faults must never look gradeable.
        for k in ["sandbox_failure", "internal_error"] {
            assert!(!by(k).verdict, "{k} must not be a verdict");
            assert!(by(k).retryable, "{k} must be retryable");
        }
        assert!(by("accepted").verdict);
        assert!(!by("accepted").retryable);
        assert!(!by("queued").terminal);
        // No wrong_answer: ZeroCode executes, it does not grade.
        assert!(v.statuses.iter().all(|s| s.kind != "wrong_answer"));
        // Every status carries a human-readable description.
        assert!(v.statuses.iter().all(|s| !s.description.is_empty()));
    }
}
