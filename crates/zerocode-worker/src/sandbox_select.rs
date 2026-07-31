//! Picks the right [`Sandbox`] implementation for the current build features
//! and the per-language sandbox tier.
//!
//! Build-feature axis (compile-time):
//! - `--features native`: includes `NativeSandbox` for Linux production submissions.
//! - `--features unsafe-naive`: includes `NaiveSandbox` (no isolation; dev only).
//! - `--features wasm`: includes `WasmSandbox` (cross-platform wasmtime+WASI tier).
//! - default: a stub that returns `SandboxError::NotImplemented` so the worker
//!   loop is exercisable.
//!
//! Per-language axis (runtime): `LanguageSpec.tier` dispatches each job to
//! the matching backend. `Native` is the default; `Wasm` opts a language into
//! `WasmSandbox`. Everything routes through the [`TieredSandbox`] wrapper
//! returned by `pick()`, so call sites continue to see a single
//! `Arc<dyn Sandbox>`.

use std::sync::Arc;

use async_trait::async_trait;
use zerocode_core::SandboxTier;
use zerocode_sandbox::{Sandbox, SandboxError, SandboxJob, SandboxResult};

pub fn pick() -> anyhow::Result<Arc<dyn Sandbox>> {
    let native = build_native()?;
    let wasm = build_wasm()?;

    if native.is_none() && wasm.is_none() {
        tracing::warn!(
            "no sandbox feature enabled; using StubSandbox that returns NotImplemented. \
             Build with `--features native` for production, `--features unsafe-naive` for \
             plumbing, or `--features wasm` for the wasmtime tier."
        );
    }

    Ok(Arc::new(TieredSandbox { native, wasm }))
}

// ---------- Native build (Phase 1.5+ NativeSandbox or Phase 1 NaiveSandbox) ----------

#[cfg(feature = "native")]
fn build_native() -> anyhow::Result<Option<Arc<dyn Sandbox>>> {
    use zerocode_sandbox::{NativeSandbox, NativeSandboxConfig};
    let config = NativeSandboxConfig::from_env();
    tracing::info!(
        cgroup_parent = %config.cgroup_parent.display(),
        runner_rootfs = %config.runner_rootfs.display(),
        scratch_dir = %config.scratch_dir.display(),
        "starting NativeSandbox for tier=Native"
    );
    Ok(Some(Arc::new(NativeSandbox::new(config)?)))
}

#[cfg(all(not(feature = "native"), feature = "unsafe-naive"))]
fn build_native() -> anyhow::Result<Option<Arc<dyn Sandbox>>> {
    tracing::warn!(
        "starting with NaiveSandbox (no isolation) for tier=Native. \
         This build is for Phase 1 plumbing only — never enable `unsafe-naive` in production."
    );
    use zerocode_sandbox::naive::NaiveSandbox;
    Ok(Some(Arc::new(NaiveSandbox)))
}

#[cfg(all(not(feature = "native"), not(feature = "unsafe-naive")))]
fn build_native() -> anyhow::Result<Option<Arc<dyn Sandbox>>> {
    Ok(None)
}

// ---------- WASM tier (v2) ----------

#[cfg(feature = "wasm")]
fn build_wasm() -> anyhow::Result<Option<Arc<dyn Sandbox>>> {
    use zerocode_sandbox::WasmSandbox;
    tracing::info!("starting WasmSandbox for tier=Wasm");
    Ok(Some(Arc::new(WasmSandbox::new()?)))
}

#[cfg(not(feature = "wasm"))]
fn build_wasm() -> anyhow::Result<Option<Arc<dyn Sandbox>>> {
    Ok(None)
}

// ---------- Tiered dispatcher ----------

/// Wraps every available backend and dispatches each job to the matching
/// tier based on `job.language.tier`. Returns a clear `NotImplemented`
/// error when the requested tier wasn't built into this binary.
pub struct TieredSandbox {
    native: Option<Arc<dyn Sandbox>>,
    wasm: Option<Arc<dyn Sandbox>>,
}

#[async_trait]
impl Sandbox for TieredSandbox {
    async fn execute(&self, job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        match job.language.tier {
            SandboxTier::Native => match &self.native {
                Some(s) => s.execute(job).await,
                None => {
                    tracing::error!(
                        token = %job.token,
                        language_id = job.language.id,
                        "tier=Native requested but no native sandbox was built into this binary"
                    );
                    Err(SandboxError::NotImplemented)
                }
            },
            SandboxTier::Wasm => match &self.wasm {
                Some(s) => s.execute(job).await,
                None => {
                    tracing::error!(
                        token = %job.token,
                        language_id = job.language.id,
                        "tier=Wasm requested but `wasm` feature wasn't enabled at build time"
                    );
                    Err(SandboxError::NotImplemented)
                }
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use bytes::Bytes;
    use chrono::Utc;
    use std::time::Duration;
    use zerocode_core::{LanguageSpec, ResourceLimits, Status, Token};

    /// Mock that records which tier it was called as so the dispatch test can
    /// assert routing without bringing in a real sandbox.
    struct Marker {
        label: &'static str,
    }

    #[async_trait]
    impl Sandbox for Marker {
        async fn execute(&self, _job: SandboxJob) -> Result<SandboxResult, SandboxError> {
            Ok(SandboxResult {
                status: Status::Accepted,
                stdout: Bytes::from_static(self.label.as_bytes()),
                stderr: Bytes::new(),
                compile_output: None,
                exit_code: Some(0),
                signal: None,
                cpu_time: Duration::ZERO,
                wall_time: Duration::ZERO,
                compile_time: Duration::ZERO,
                memory_kb: 0,
                started_at: Utc::now(),
                finished_at: Utc::now(),
                compiled_binary: None,
            })
        }
    }

    fn spec(tier: SandboxTier) -> LanguageSpec {
        LanguageSpec {
            id: 1,
            name: "x".into(),
            version: "0".into(),
            source_file: "x".into(),
            compile_cmd: None,
            run_cmd: vec![],
            env: vec![],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier,
        }
    }

    fn job(spec: LanguageSpec) -> SandboxJob {
        SandboxJob {
            token: Token::new(),
            language: spec,
            source_code: Bytes::new(),
            stdin: Bytes::new(),
            limits: ResourceLimits::default(),
            cached_binary: None,
        }
    }

    #[tokio::test]
    async fn routes_native_tier_to_native_backend() {
        let tiered = TieredSandbox {
            native: Some(Arc::new(Marker { label: "native" })),
            wasm: Some(Arc::new(Marker { label: "wasm" })),
        };
        let res = tiered
            .execute(job(spec(SandboxTier::Native)))
            .await
            .unwrap();
        assert_eq!(&res.stdout[..], b"native");
    }

    #[tokio::test]
    async fn routes_wasm_tier_to_wasm_backend() {
        let tiered = TieredSandbox {
            native: Some(Arc::new(Marker { label: "native" })),
            wasm: Some(Arc::new(Marker { label: "wasm" })),
        };
        let res = tiered.execute(job(spec(SandboxTier::Wasm))).await.unwrap();
        assert_eq!(&res.stdout[..], b"wasm");
    }

    #[tokio::test]
    async fn returns_not_implemented_when_tier_missing() {
        let tiered = TieredSandbox {
            native: Some(Arc::new(Marker { label: "native" })),
            wasm: None,
        };
        let err = tiered
            .execute(job(spec(SandboxTier::Wasm)))
            .await
            .unwrap_err();
        assert!(matches!(err, SandboxError::NotImplemented));
    }
}
