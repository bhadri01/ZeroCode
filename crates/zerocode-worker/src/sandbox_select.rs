//! Picks the right [`Sandbox`] implementation for the current build features.
//!
//! - `--features native` (Phase 1.5+): `NativeSandbox`.
//! - `--features unsafe-naive` (Phase 1 plumbing only): `NaiveSandbox`, never ship enabled.
//! - default build: a stub that returns `SandboxError::NotImplemented` so the
//!   worker loop is exercisable without enabling either above.

use std::sync::Arc;

use async_trait::async_trait;
use zerocode_sandbox::{Sandbox, SandboxError, SandboxJob, SandboxResult};

#[cfg(feature = "native")]
pub fn pick() -> anyhow::Result<Arc<dyn Sandbox>> {
    use zerocode_sandbox::{NativeSandbox, NativeSandboxConfig};
    let config = NativeSandboxConfig::from_env();
    tracing::info!(
        cgroup_parent = %config.cgroup_parent.display(),
        runner_rootfs = %config.runner_rootfs.display(),
        scratch_dir = %config.scratch_dir.display(),
        "starting NativeSandbox"
    );
    Ok(Arc::new(NativeSandbox::new(config)?))
}

#[cfg(all(not(feature = "native"), feature = "unsafe-naive"))]
pub fn pick() -> anyhow::Result<Arc<dyn Sandbox>> {
    tracing::warn!(
        "starting with NaiveSandbox (no isolation). This build is for Phase 1 \
         plumbing only — never enable `unsafe-naive` in production."
    );
    use zerocode_sandbox::naive::NaiveSandbox;
    Ok(Arc::new(NaiveSandbox))
}

#[cfg(all(not(feature = "native"), not(feature = "unsafe-naive")))]
pub fn pick() -> anyhow::Result<Arc<dyn Sandbox>> {
    tracing::warn!(
        "no sandbox feature enabled; using StubSandbox that returns NotImplemented. \
         Build with `--features native` for production or `--features unsafe-naive` for plumbing."
    );
    Ok(Arc::new(StubSandbox))
}

#[allow(dead_code)]
struct StubSandbox;

#[async_trait]
impl Sandbox for StubSandbox {
    async fn execute(&self, _job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        Err(SandboxError::NotImplemented)
    }
}
