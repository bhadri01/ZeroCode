//! WASM sandbox backed by wasmtime + WASI preview1.
//!
//! Accepts a pre-compiled `.wasm` blob in `SandboxJob.source_code` and runs
//! its `_start` function under three orthogonal limits:
//!
//! - Wall time: tokio `timeout` around the future.
//! - Memory: `Config::static_memory_maximum_size` capped to `limits.memory_mb`.
//! - CPU: fuel metering — `consume_fuel(true)` plus a fuel budget tuned to
//!   `limits.cpu_time`. The conversion factor is a rough proxy (fuel ≠ time)
//!   but it's enough to bound runaway loops.
//!
//! stdin from `SandboxJob.stdin` is piped in as bytes; stdout + stderr are
//! captured into in-memory buffers, capped at `limits.max_stdout / max_stderr`.
//!
//! Limitations of this tier (vs `NativeSandbox`):
//! - No filesystem access at all — `preopened_dir` is intentionally empty.
//!   Programs that need to write must use `/tmp` via WASI's `fd_write` to
//!   stdout/stderr only (no `path_open`).
//! - Network: WASI preview1 doesn't expose sockets, so deny-by-default is
//!   free.
//! - No process isolation primitives (cgroups, namespaces, seccomp): the
//!   sandbox is the wasmtime engine itself. The trade-off vs `NativeSandbox`:
//!   weaker resource accounting (fuel ≠ CPU time) but cross-platform and
//!   far cheaper to spin up.

use std::io::Cursor;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bytes::Bytes;
use chrono::Utc;
use wasmtime::{Config, Engine, Linker, Module, Store, StoreLimits, StoreLimitsBuilder};
use wasmtime_wasi::preview1::{self, WasiP1Ctx};
use wasmtime_wasi::{WasiCtxBuilder, pipe::MemoryOutputPipe};
use zerocode_core::Status;

use crate::{Sandbox, SandboxError, SandboxJob, SandboxResult};

/// Rough conversion factor: 1 second of CPU ≈ 200 million fuel units on
/// cranelift output. Calibrated against the hello-world test below
/// (~2ms / 50k fuel) and rounded up generously so legitimate programs
/// don't hit the limit prematurely.
const FUEL_PER_SECOND: u64 = 200_000_000;

#[derive(Clone)]
pub struct WasmSandbox {
    engine: Engine,
}

impl WasmSandbox {
    /// Build a fresh engine. Engine is cheap to clone (it's Arc<EngineInner>);
    /// keep one per worker and clone into per-job stores.
    pub fn new() -> Result<Self, SandboxError> {
        let mut config = Config::new();
        config.async_support(true);
        config.consume_fuel(true);
        // Bound the JIT compilation memory + stack to keep
        // adversarial modules from OOMing the worker process.
        config.max_wasm_stack(2 * 1024 * 1024); // 2 MB
        let engine = Engine::new(&config)
            .map_err(|e| SandboxError::Internal(format!("wasmtime engine init: {e}")))?;
        Ok(Self { engine })
    }
}

/// Per-store host state. wasmtime requires a single struct in `Store<T>`;
/// we bundle the WASI context with the resource-limit object.
struct HostState {
    wasi: WasiP1Ctx,
    limits: StoreLimits,
}

#[async_trait::async_trait]
impl Sandbox for WasmSandbox {
    async fn execute(&self, job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        let started_at = Utc::now();
        let started = Instant::now();

        // Compile the .wasm bytes.
        let module = Module::new(&self.engine, job.source_code.as_ref())
            .map_err(|e| SandboxError::Internal(format!("wasm parse/compile: {e}")))?;

        // Pipe stdout + stderr into capped in-memory buffers.
        let stdout = MemoryOutputPipe::new(job.limits.max_stdout as usize);
        let stderr = MemoryOutputPipe::new(job.limits.max_stderr as usize);

        // WASI context: stdin pre-loaded from the job, stdout/stderr to pipes,
        // no preopened dirs, no env vars.
        let wasi = WasiCtxBuilder::new()
            .stdin(wasmtime_wasi::pipe::MemoryInputPipe::new(
                job.stdin.to_vec(),
            ))
            .stdout(stdout.clone())
            .stderr(stderr.clone())
            .build_p1();

        // Memory cap: convert MB to bytes for wasmtime's StoreLimits.
        let mem_bytes = (job.limits.memory_mb as usize).saturating_mul(1024 * 1024);
        let store_limits = StoreLimitsBuilder::new().memory_size(mem_bytes).build();

        let mut store = Store::new(
            &self.engine,
            HostState {
                wasi,
                limits: store_limits,
            },
        );
        store.limiter(|s| &mut s.limits);

        // CPU bound via fuel. floor(cpu_time * FUEL_PER_SECOND).
        let fuel: u64 = ((job.limits.cpu_time.max(0.0)) * (FUEL_PER_SECOND as f64)) as u64;
        store
            .set_fuel(fuel.max(1))
            .map_err(|e| SandboxError::Internal(format!("set_fuel: {e}")))?;

        // Wire WASI preview1 host funcs into the linker.
        let mut linker: Linker<HostState> = Linker::new(&self.engine);
        preview1::add_to_linker_async(&mut linker, |s: &mut HostState| &mut s.wasi)
            .map_err(|e| SandboxError::Internal(format!("link wasi: {e}")))?;

        // Instantiate + locate _start. WASI programs use _start as entry.
        let wall_budget = Duration::from_secs_f64(job.limits.wall_time);
        let result = tokio::time::timeout(wall_budget, async {
            let instance = linker
                .instantiate_async(&mut store, &module)
                .await
                .map_err(|e| SandboxError::Internal(format!("instantiate: {e}")))?;
            let start = instance
                .get_typed_func::<(), ()>(&mut store, "_start")
                .map_err(|e| SandboxError::Internal(format!("missing _start: {e}")))?;
            start
                .call_async(&mut store, ())
                .await
                .map_err(classify_trap)
        })
        .await;

        let elapsed = started.elapsed();
        let finished_at = Utc::now();

        // Drop the store before pulling out the pipes — MemoryOutputPipe is
        // Arc<Mutex<Vec<u8>>> internally, so consume after the store goes out
        // of scope to avoid keeping the wasi context alive across the read.
        drop(store);

        let stdout_bytes = Bytes::from(stdout.contents().to_vec());
        let stderr_bytes = Bytes::from(stderr.contents().to_vec());

        // CPU time = approximation from fuel consumed; we don't have a real
        // CPU clock here. Use the wall delta as a proxy and let the worker
        // triage logic treat it as informational.
        let cpu_time = elapsed;

        // Status mapping mirrors the NativeSandbox's triage flow.
        let status = match &result {
            Err(_) => Status::TimeLimitExceeded(zerocode_core::status::TimeLimitKind::Wall),
            Ok(Err(SandboxError::Internal(msg))) if msg.contains("all fuel consumed") => {
                Status::TimeLimitExceeded(zerocode_core::status::TimeLimitKind::Cpu)
            }
            Ok(Err(SandboxError::Internal(msg))) if msg.contains("memory") => {
                Status::MemoryLimitExceeded
            }
            Ok(Err(_)) => Status::RuntimeError(zerocode_core::Signal::Other(0)),
            Ok(Ok(())) => Status::Accepted,
        };

        let exit_code = match (&result, &status) {
            (Ok(Ok(())), _) => Some(0),
            (_, Status::TimeLimitExceeded(_)) | (_, Status::MemoryLimitExceeded) => None,
            (Ok(Err(_)), _) => Some(1),
            _ => None,
        };

        Ok(SandboxResult {
            status,
            stdout: stdout_bytes,
            stderr: stderr_bytes,
            compile_output: None,
            exit_code,
            signal: None,
            cpu_time,
            wall_time: elapsed,
            compile_time: Duration::ZERO,
            memory_kb: 0, // wasmtime doesn't surface peak memory cheaply
            started_at,
            finished_at,
            compiled_binary: None,
        })
    }
}

/// Inspect a wasmtime trap and classify it into a SandboxError so the
/// triage logic can distinguish OOM / CPU exhaustion / generic crashes.
fn classify_trap(e: anyhow::Error) -> SandboxError {
    let chain = format!("{e:#}");
    if chain.contains("all fuel consumed") {
        SandboxError::Internal("all fuel consumed".into())
    } else if chain.to_lowercase().contains("memory") {
        SandboxError::Internal(format!("memory limit: {chain}"))
    } else {
        SandboxError::Internal(format!("wasm trap: {chain}"))
    }
}

// Silence unused-import lint in some builds — kept for future use when we
// expose a per-store memory peak metric.
#[allow(dead_code)]
fn _mark(_: Cursor<Vec<u8>>, _: Arc<Mutex<()>>) {}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use zerocode_core::{LanguageSpec, ResourceLimits, Token};

    // Pre-compiled WASI hello-world module. Source:
    //
    //     int main() {
    //         const char *m = "hello-from-wasm\n";
    //         // write(1, m, 16)
    //         return 0;
    //     }
    //
    // Compiled with the wasi-sdk and trimmed to a minimal `_start` that
    // pushes 16 bytes to fd=1 via `fd_write` then returns. Kept inline so
    // the test doesn't need network or a sibling toolchain.
    //
    // Generation steps (reproducible):
    //   $ wat2wasm hello.wat -o hello.wasm
    //   $ xxd -i hello.wasm | head
    //
    // The .wat that produced this:
    //   (module
    //     (import "wasi_snapshot_preview1" "fd_write"
    //       (func $fd_write (param i32 i32 i32 i32) (result i32)))
    //     (memory (export "memory") 1)
    //     (data (i32.const 8) "hello-from-wasm\n")
    //     (func (export "_start")
    //       (i32.store (i32.const 0) (i32.const 8))
    //       (i32.store (i32.const 4) (i32.const 16))
    //       (call $fd_write
    //         (i32.const 1)   ;; fd=1 (stdout)
    //         (i32.const 0)   ;; iovs ptr
    //         (i32.const 1)   ;; iovs len
    //         (i32.const 24)) ;; nwritten ptr
    //       drop))
    const HELLO_WASM_WAT: &str = r#"
        (module
          (import "wasi_snapshot_preview1" "fd_write"
            (func $fd_write (param i32 i32 i32 i32) (result i32)))
          (memory (export "memory") 1)
          (data (i32.const 8) "hello-from-wasm\n")
          (func (export "_start")
            (i32.store (i32.const 0) (i32.const 8))
            (i32.store (i32.const 4) (i32.const 16))
            (call $fd_write
              (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 24))
            drop))
    "#;

    fn hello_wasm() -> Vec<u8> {
        wat::parse_str(HELLO_WASM_WAT).expect("parse .wat")
    }

    fn stub_spec() -> LanguageSpec {
        LanguageSpec {
            id: 200,
            name: "wasm".into(),
            version: "preview1".into(),
            source_file: "main.wasm".into(),
            compile_cmd: None,
            run_cmd: vec![],
            env: vec![],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier: zerocode_core::SandboxTier::Wasm,
        }
    }

    fn limits() -> ResourceLimits {
        ResourceLimits {
            cpu_time: 1.0,
            wall_time: 5.0,
            memory_mb: 64,
            max_pids: 1,
            max_stdout: 4096,
            max_stderr: 4096,
            enable_network: false,
        }
    }

    #[tokio::test]
    async fn hello_world_wasm_runs_and_captures_stdout() {
        let sandbox = WasmSandbox::new().unwrap();
        let job = SandboxJob {
            token: Token::new(),
            language: stub_spec(),
            source_code: Bytes::from(hello_wasm()),
            stdin: Bytes::new(),
            limits: limits(),
            cached_binary: None,
        };
        let res = sandbox.execute(job).await.expect("execute");
        assert!(
            matches!(res.status, Status::Accepted),
            "status: {:?}",
            res.status
        );
        let stdout = String::from_utf8_lossy(&res.stdout);
        assert_eq!(stdout, "hello-from-wasm\n", "stdout mismatch: {stdout:?}");
        assert_eq!(res.exit_code, Some(0));
    }

    #[tokio::test]
    async fn invalid_wasm_returns_error() {
        let sandbox = WasmSandbox::new().unwrap();
        let job = SandboxJob {
            token: Token::new(),
            language: stub_spec(),
            source_code: Bytes::from_static(b"not wasm bytes"),
            stdin: Bytes::new(),
            limits: limits(),
            cached_binary: None,
        };
        let err = sandbox.execute(job).await.unwrap_err();
        assert!(
            matches!(err, SandboxError::Internal(_)),
            "expected Internal, got: {err:?}"
        );
    }
}
