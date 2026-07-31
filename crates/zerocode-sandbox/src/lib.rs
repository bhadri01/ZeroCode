//! Sandbox abstraction + implementations.
//!
//! - [`Sandbox`] is the trait every isolation backend implements.
//! - [`NaiveSandbox`] (feature `unsafe-naive`) — Phase 1 plumbing only. No isolation.
//! - [`NativeSandbox`] (feature `native`) — Phase 1.5+ production sandbox built on
//!   `libcontainer` + cgroups v2 + seccomp + landlock + dropped capabilities.

use std::time::Duration;

use bytes::Bytes;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zerocode_core::{LanguageSpec, ResourceLimits, Signal, Status, Token};

pub mod kernel_check;

/// Compile-artifact (de)serialization for the compile cache — tar pack/unpack.
pub mod artifact;

/// PIDs the sandbox owns and will `waitpid` itself. The worker's orphan reaper
/// consults this so its `waitpid(-1)` drain can't steal a sandbox child's exit
/// status out from under `exec::wait_with_timeout`.
pub mod owned_children;

#[cfg(feature = "unsafe-naive")]
pub mod naive;

#[cfg(feature = "native")]
pub mod native;

#[cfg(feature = "native")]
pub use native::{NativeSandbox, NativeSandboxConfig};

#[cfg(feature = "wasm")]
pub mod wasm;

#[cfg(feature = "wasm")]
pub use wasm::WasmSandbox;

/// What the worker hands to a sandbox to run.
#[derive(Debug, Clone)]
pub struct SandboxJob {
    pub token: Token,
    pub language: LanguageSpec,
    pub source_code: Bytes,
    pub stdin: Bytes,
    pub limits: ResourceLimits,
    /// Pre-compiled binary from the compile cache. When present, the sandbox
    /// writes it to `/box/prog` and skips the compile phase entirely.
    pub cached_binary: Option<Bytes>,
}

/// What every sandbox returns. The worker's triage decision tree (see
/// `docs/EDGE_CASES.md` §"Detection / triage flow") consumes this to produce a
/// final `Status` for the submission.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxResult {
    pub status: Status,
    pub stdout: Bytes,
    pub stderr: Bytes,
    pub compile_output: Option<Bytes>,
    pub exit_code: Option<i32>,
    pub signal: Option<Signal>,
    /// CPU consumed by the **run phase only**. For a compiled language the
    /// compiler's CPU is excluded (it is reported as `compile_time` instead), so
    /// this measures the submitted program rather than our toolchain.
    pub cpu_time: Duration,
    /// Wall-clock for the whole submission — compile phase included.
    pub wall_time: Duration,
    /// Wall-clock spent compiling. Zero for interpreted languages and for
    /// compile-cache hits, which skip the compile phase entirely.
    pub compile_time: Duration,
    pub memory_kb: u32,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    /// Binary produced by the compile phase. The worker stores this in the
    /// compile-artifact cache so subsequent runs of the same source can skip
    /// recompilation.
    #[serde(skip)]
    pub compiled_binary: Option<Bytes>,
}

/// Universal interface for any isolation backend. Concrete impls in this crate
/// are async-friendly because compile + run flows interleave I/O with
/// fork/wait; production impls run blocking syscalls via `tokio::task::spawn_blocking`.
#[async_trait::async_trait]
pub trait Sandbox: Send + Sync {
    async fn execute(&self, job: SandboxJob) -> Result<SandboxResult, SandboxError>;
}

#[derive(Debug, Error)]
pub enum SandboxError {
    #[error("sandbox not implemented yet for this build (feature gate disabled)")]
    NotImplemented,
    #[error("kernel feature missing or insufficient: {0}")]
    KernelFeatureMissing(&'static str),
    #[error("cgroup setup failed: {0}")]
    CgroupSetup(String),
    #[error("seccomp setup failed: {0}")]
    SeccompSetup(String),
    #[error("landlock setup failed: {0}")]
    LandlockSetup(String),
    #[error("mount setup failed: {0}")]
    MountSetup(String),
    #[error("namespace setup failed: {0}")]
    NamespaceSetup(String),
    #[error("spawn failed: {0}")]
    Spawn(String),
    #[error("wait failed: {0}")]
    Wait(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("internal error: {0}")]
    Internal(String),
}

impl SandboxError {
    /// Whether re-running the identical job could plausibly succeed.
    ///
    /// These are *infrastructure* faults — a fork that hit EAGAIN, a cgroup
    /// that was still being torn down, a lost exit status. The user's program
    /// either never ran or its verdict was destroyed, so the worker must retry
    /// rather than write back a terminal status: a `sandbox_failure` with empty
    /// stdout is indistinguishable from "wrong answer" to a grader, which is how
    /// a correct submission gets silently marked wrong.
    ///
    /// The config-level variants (kernel feature missing, seccomp/landlock
    /// policy rejected, feature gate off) are deliberately excluded: they fail
    /// identically every time and retrying only delays the error.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SandboxError::CgroupSetup(_)
                | SandboxError::MountSetup(_)
                | SandboxError::NamespaceSetup(_)
                | SandboxError::Spawn(_)
                | SandboxError::Wait(_)
                | SandboxError::Io(_)
                | SandboxError::Internal(_)
        )
    }
}
