use serde::{Deserialize, Serialize};

/// Terminal disposition of a submission. The worker's triage decision tree
/// (see `docs/EDGE_CASES.md`) maps cgroup events / signals / exit codes to one
/// of these variants in highest-confidence-first order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "detail")]
pub enum Status {
    /// Row written, not yet claimed by a worker.
    Queued,
    /// Worker holds the claim.
    Processing,
    /// Exit 0, all limits respected.
    Accepted,
    /// Wall-clock or CPU budget exceeded. The `Limit` field distinguishes which.
    TimeLimitExceeded(TimeLimitKind),
    /// Compile phase exited non-zero (compile output surfaced to `compile_output`).
    CompileError,
    /// Cgroup OOM event detected via `memory.events.oom_kill`.
    MemoryLimitExceeded,
    /// Run completed but ring-buffered output overflowed and exit was otherwise clean.
    OutputLimitExceeded,
    /// Killed by a signal (SIGSEGV, SIGFPE, etc.).
    RuntimeError(Signal),
    /// Non-zero exit without a terminating signal.
    NonZeroExit(i32),
    /// Sandbox itself could not be constructed (kernel feature missing, cgroup EBUSY,
    /// etc.). Distinct from `InternalError`: this is *our* fault, not the user's code.
    SandboxFailure,
    /// Catch-all for anything else (panic in worker code, malformed cgroup state).
    InternalError,
    /// Submission was cancelled via API (v2).
    Cancelled,
    /// Past retention TTL but row stub kept for audit (410 Gone semantics).
    Expired,
}

impl Status {
    pub fn is_terminal(&self) -> bool {
        !matches!(self, Status::Queued | Status::Processing)
    }

    /// Whether this status is a judgement about the *submitted code*.
    ///
    /// `Accepted`, `CompileError`, `RuntimeError`, the limit statuses and
    /// `NonZeroExit` all describe what the user's program did — resubmitting the
    /// identical source, stdin and limits must reproduce them. The rest describe
    /// what happened to *us* (an unusable sandbox, an internal fault) or to the
    /// submission's lifecycle (cancelled, expired), and say nothing about the
    /// code.
    ///
    /// Callers use this to decide what may be memoised. Caching a non-verdict is
    /// actively harmful: a single transient worker fault would otherwise be
    /// replayed to every subsequent identical submission for the whole cache TTL,
    /// turning one blip into a run of "deterministic" wrong answers.
    pub fn is_verdict(&self) -> bool {
        use Status as S;
        match self {
            S::Accepted
            | S::TimeLimitExceeded(_)
            | S::CompileError
            | S::MemoryLimitExceeded
            | S::OutputLimitExceeded
            | S::RuntimeError(_)
            | S::NonZeroExit(_) => true,
            S::Queued
            | S::Processing
            | S::SandboxFailure
            | S::InternalError
            | S::Cancelled
            | S::Expired => false,
        }
    }

    /// Whether a client may safely resubmit identical work after seeing this
    /// status. True only for the infrastructure faults — a verdict is a verdict,
    /// and retrying it just burns quota on the same answer.
    pub fn is_retryable(&self) -> bool {
        matches!(self, Status::SandboxFailure | Status::InternalError)
    }

    /// The `kind` string this status serialises to, for docs and for clients
    /// enumerating the vocabulary.
    pub fn kind(&self) -> &'static str {
        use Status as S;
        match self {
            S::Queued => "queued",
            S::Processing => "processing",
            S::Accepted => "accepted",
            S::TimeLimitExceeded(_) => "time_limit_exceeded",
            S::CompileError => "compile_error",
            S::MemoryLimitExceeded => "memory_limit_exceeded",
            S::OutputLimitExceeded => "output_limit_exceeded",
            S::RuntimeError(_) => "runtime_error",
            S::NonZeroExit(_) => "non_zero_exit",
            S::SandboxFailure => "sandbox_failure",
            S::InternalError => "internal_error",
            S::Cancelled => "cancelled",
            S::Expired => "expired",
        }
    }

    /// One value of every variant the API can return, in the order documented
    /// in `docs/STATUS.md`. Exposed so the docs, the OpenAPI spec and clients
    /// enumerate the vocabulary from one source instead of hand-maintaining
    /// three copies of it. The `all_covers_every_variant` test keeps it honest.
    ///
    /// Note there is no `wrong_answer`: ZeroCode executes, it does not grade.
    /// A program that runs to completion is `accepted` regardless of what it
    /// printed; comparing stdout to an expected output is the caller's job.
    pub const ALL: &'static [Status] = &[
        Status::Queued,
        Status::Processing,
        Status::Accepted,
        Status::CompileError,
        Status::RuntimeError(Signal::Sigsegv),
        Status::NonZeroExit(1),
        Status::TimeLimitExceeded(TimeLimitKind::Wall),
        Status::MemoryLimitExceeded,
        Status::OutputLimitExceeded,
        Status::SandboxFailure,
        Status::InternalError,
        Status::Cancelled,
        Status::Expired,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeLimitKind {
    Wall,
    Cpu,
}

/// Subset of POSIX signals we report distinctly. Anything not in this list is
/// reported as `Signal::Other(n)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "name", content = "raw")]
pub enum Signal {
    Sigsegv,
    Sigfpe,
    Sigabrt,
    Sigxfsz,
    Sigpipe,
    Sigkill,
    Sigterm,
    Sigill,
    Sigbus,
    Other(i32),
}

impl Signal {
    pub fn from_raw(n: i32) -> Self {
        match n {
            4 => Signal::Sigill,
            6 => Signal::Sigabrt,
            7 => Signal::Sigbus,
            8 => Signal::Sigfpe,
            9 => Signal::Sigkill,
            11 => Signal::Sigsegv,
            13 => Signal::Sigpipe,
            15 => Signal::Sigterm,
            25 => Signal::Sigxfsz,
            other => Signal::Other(other),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signal_mapping() {
        assert_eq!(Signal::from_raw(11), Signal::Sigsegv);
        assert_eq!(Signal::from_raw(42), Signal::Other(42));
    }

    #[test]
    fn status_terminality() {
        assert!(!Status::Queued.is_terminal());
        assert!(!Status::Processing.is_terminal());
        assert!(Status::Accepted.is_terminal());
        assert!(Status::TimeLimitExceeded(TimeLimitKind::Wall).is_terminal());
        assert!(Status::CompileError.is_terminal());
    }

    /// `Status::ALL` is what `docs/STATUS.md` and the OpenAPI enum are built
    /// from, so a new variant that isn't listed there would silently ship an
    /// undocumented status — which is precisely the P2 complaint
    /// (`sandbox_failure` was discovered by hitting it in production).
    #[test]
    fn all_covers_every_variant() {
        let kinds: Vec<&str> = Status::ALL.iter().map(|s| s.kind()).collect();
        let mut sorted = kinds.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), kinds.len(), "duplicate kind in Status::ALL");
        // Every kind `kind()` can produce must be represented. Update both this
        // list and `Status::ALL` when adding a variant.
        for expected in [
            "queued",
            "processing",
            "accepted",
            "compile_error",
            "runtime_error",
            "non_zero_exit",
            "time_limit_exceeded",
            "memory_limit_exceeded",
            "output_limit_exceeded",
            "sandbox_failure",
            "internal_error",
            "cancelled",
            "expired",
        ] {
            assert!(
                kinds.contains(&expected),
                "{expected} missing from Status::ALL"
            );
        }
    }

    #[test]
    fn only_code_judgements_are_verdicts() {
        assert!(Status::Accepted.is_verdict());
        assert!(Status::CompileError.is_verdict());
        assert!(Status::NonZeroExit(1).is_verdict());
        assert!(Status::TimeLimitExceeded(TimeLimitKind::Cpu).is_verdict());
        // Infrastructure faults are not verdicts and must never be memoised.
        assert!(!Status::SandboxFailure.is_verdict());
        assert!(!Status::InternalError.is_verdict());
        assert!(!Status::Queued.is_verdict());
    }

    #[test]
    fn only_infra_faults_are_retryable() {
        assert!(Status::SandboxFailure.is_retryable());
        assert!(Status::InternalError.is_retryable());
        assert!(!Status::Accepted.is_retryable());
        assert!(!Status::TimeLimitExceeded(TimeLimitKind::Wall).is_retryable());
    }

    #[test]
    fn status_serializes_with_kind_tag() {
        let s = Status::TimeLimitExceeded(TimeLimitKind::Wall);
        let j = serde_json::to_string(&s).unwrap();
        // Tagged repr: { "kind": "time_limit_exceeded", "detail": "wall" }
        assert!(j.contains("time_limit_exceeded"));
        assert!(j.contains("wall"));
    }
}
