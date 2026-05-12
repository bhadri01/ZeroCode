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

    #[test]
    fn status_serializes_with_kind_tag() {
        let s = Status::TimeLimitExceeded(TimeLimitKind::Wall);
        let j = serde_json::to_string(&s).unwrap();
        // Tagged repr: { "kind": "time_limit_exceeded", "detail": "wall" }
        assert!(j.contains("time_limit_exceeded"));
        assert!(j.contains("wall"));
    }
}
