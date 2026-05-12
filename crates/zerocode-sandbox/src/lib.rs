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

#[cfg(feature = "unsafe-naive")]
pub mod naive;

#[cfg(feature = "native")]
pub mod native;

#[cfg(feature = "native")]
pub use native::{NativeSandbox, NativeSandboxConfig};

/// What the worker hands to a sandbox to run.
#[derive(Debug, Clone)]
pub struct SandboxJob {
    pub token: Token,
    pub language: LanguageSpec,
    pub source_code: Bytes,
    pub stdin: Bytes,
    pub limits: ResourceLimits,
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
    pub cpu_time: Duration,
    pub wall_time: Duration,
    pub memory_kb: u32,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
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

