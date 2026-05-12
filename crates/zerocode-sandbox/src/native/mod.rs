//! Production sandbox built on cgroups v2 + Linux namespaces + dropped
//! capabilities. Lands incrementally across Phases 1.5–4.5.
//!
//! - **Phase 1.5 (now)** — cgroup v2 limits enforced; PID/NET/IPC/UTS/MNT/USER
//!   namespaces isolate the child; all caps dropped; `PR_SET_NO_NEW_PRIVS`;
//!   wall-clock timeout via `cgroup.kill`; outcomes mapped to `Status` via the
//!   triage decision tree in `docs/EDGE_CASES.md`. **Python-only happy path.**
//! - **Phase 2** — seccomp allowlist on top of Docker default; landlock fs
//!   policy; `pivot_root` into the read-only runner rootfs.
//! - **Phase 3a–c** — generalize for remaining languages; two-phase
//!   compile/run; per-language seccomp augments.
//! - **Phase 4.6** — sandbox template pool (pre-created cgroups + mount layouts).

use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;

use crate::{Sandbox, SandboxError, SandboxJob, SandboxResult};

/// Configuration shared by every per-submission invocation.
#[derive(Debug, Clone)]
pub struct NativeSandboxConfig {
    /// Existing cgroup v2 directory we'll create per-submission sub-cgroups under.
    /// Typically `/sys/fs/cgroup/zerocode/`. Must be delegated to the worker UID.
    pub cgroup_parent: PathBuf,
    /// Read-only runner rootfs path (Phase 2+ bind-mounts this). For Phase 1.5
    /// it's just used to resolve the language binaries (`run_cmd[0]`).
    pub runner_rootfs: PathBuf,
    /// Where per-submission scratch dirs are created (each gets its own
    /// `<scratch_dir>/<ulid>/box/`).
    pub scratch_dir: PathBuf,
}

impl NativeSandboxConfig {
    pub fn from_env() -> Self {
        Self {
            cgroup_parent: std::env::var("ZEROCODE_CGROUP_PARENT")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/sys/fs/cgroup/zerocode")),
            runner_rootfs: std::env::var("ZEROCODE_RUNNER_ROOTFS")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/var/lib/zerocode/runner-rootfs")),
            scratch_dir: std::env::var("ZEROCODE_SCRATCH_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/run/zerocode-sandbox")),
        }
    }
}

pub struct NativeSandbox {
    config: Arc<NativeSandboxConfig>,
}

impl NativeSandbox {
    pub fn new(config: NativeSandboxConfig) -> Result<Self, SandboxError> {
        crate::kernel_check::preflight()?;
        ensure_dir_exists(&config.cgroup_parent, "cgroup_parent")?;
        ensure_dir_exists(&config.scratch_dir, "scratch_dir")?;
        // runner_rootfs is checked when Phase 2 introduces pivot_root.
        Ok(Self {
            config: Arc::new(config),
        })
    }
}

#[async_trait]
impl Sandbox for NativeSandbox {
    async fn execute(&self, job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        let config = self.config.clone();
        let handle = tokio::task::spawn_blocking(move || {
            #[cfg(target_os = "linux")]
            {
                linux::execute(&config, job)
            }
            #[cfg(not(target_os = "linux"))]
            {
                let _ = (config, job);
                Err(SandboxError::KernelFeatureMissing(
                    "native sandbox requires Linux (cgroup v2 + namespaces)",
                ))
            }
        });
        handle
            .await
            .map_err(|e| SandboxError::Internal(format!("worker join failed: {e}")))?
    }
}

fn ensure_dir_exists(p: &std::path::Path, label: &'static str) -> Result<(), SandboxError> {
    if !p.exists() {
        return Err(SandboxError::Internal(format!(
            "{label} path {} does not exist",
            p.display()
        )));
    }
    if !p.is_dir() {
        return Err(SandboxError::Internal(format!(
            "{label} path {} is not a directory",
            p.display()
        )));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
mod cgroup;
#[cfg(target_os = "linux")]
mod exec;
#[cfg(target_os = "linux")]
mod landlock_policy;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
mod mounts;
#[cfg(target_os = "linux")]
mod scratch;
#[cfg(target_os = "linux")]
mod seccomp;
#[cfg(target_os = "linux")]
mod triage;
#[cfg(target_os = "linux")]
mod userns;
