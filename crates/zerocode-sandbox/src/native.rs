//! Production sandbox built on `libcontainer` + cgroups v2 + seccomp + landlock
//! + dropped capabilities. Lands incrementally across Phases 1.5–4.5.
//!
//! Implementation roadmap (this module is a skeleton until Phase 1.5):
//!
//! 1. **Phase 1.5** — Single-language (Python) end-to-end. Build OCI config in
//!    memory per submission, hand to `libcontainer::container::ContainerBuilder`,
//!    drive lifecycle. Read stdout/stderr from sandbox pipes; read `memory.peak`,
//!    `cpu.stat`, `memory.events.oom_kill` post-exit.
//! 2. **Phase 2** — Layer seccomp allowlist (`libseccomp`) on top of libcontainer's
//!    default; subtract `io_uring_*`, `bpf`, `userfaultfd`, `ptrace`, post-init
//!    `unshare`, `clone(CLONE_NEWUSER)`. Apply landlock fs policy. Verify cap-drop.
//! 3. **Phase 3a–c** — generalize for remaining languages. Two-phase compile/run
//!    for compiled langs. Per-language seccomp augments (Java).
//! 4. **Phase 4.6** — sandbox template pool (pre-create K cgroups + mount layouts +
//!    landlock rulesets at worker boot; per-submission acquire/release).
//!
//! Until that work lands, this module is a stub that returns
//! `SandboxError::NotImplemented`.

use async_trait::async_trait;

use crate::{Sandbox, SandboxError, SandboxJob, SandboxResult};

pub struct NativeSandbox {
    // Will hold: pool of pre-built sandbox templates, cgroup parent path,
    // landlock policy template, seccomp profile cache, runner rootfs path.
}

impl NativeSandbox {
    pub fn new() -> Result<Self, SandboxError> {
        // Phase 1.5 will: run kernel_check::preflight(), open the cgroup parent,
        // verify rootfs exists, pre-allocate the template pool.
        Ok(Self {})
    }
}

#[async_trait]
impl Sandbox for NativeSandbox {
    async fn execute(&self, _job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        Err(SandboxError::NotImplemented)
    }
}
