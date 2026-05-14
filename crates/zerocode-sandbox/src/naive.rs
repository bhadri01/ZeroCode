//! Phase 1 plumbing sandbox. NO isolation. Behind the `unsafe-naive` feature
//! gate so binaries can't ship it by accident.
//!
//! The sole reason this exists is to wire `API → queue → worker → "sandbox" →
//! Submission row` end-to-end before the real native sandbox lands in
//! Phase 1.5. Once `NativeSandbox` works, this module is removed.

use std::process::Stdio;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bytes::Bytes;
use chrono::Utc;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use zerocode_core::{Signal, Status};

use crate::{Sandbox, SandboxError, SandboxJob, SandboxResult};

pub struct NaiveSandbox;

impl NaiveSandbox {
    /// Resolve a program path relative to the runner rootfs if it's absolute.
    /// For paths like `/usr/bin/python3`, this will prefix them with the
    /// runner-rootfs mount point if ZEROCODE_RUNNER_ROOTFS is set.
    fn resolve_program(program: &str) -> String {
        if program.starts_with('/') {
            if let Ok(rootfs) = std::env::var("ZEROCODE_RUNNER_ROOTFS") {
                return format!("{}{}", rootfs, program);
            }
        }
        program.to_string()
    }
}

#[async_trait]
impl Sandbox for NaiveSandbox {
    async fn execute(&self, job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        tracing::warn!(
            token = %job.token,
            "NaiveSandbox executes WITHOUT isolation — never ship this enabled"
        );

        let (program, args) = job
            .language
            .run_cmd
            .split_first()
            .ok_or_else(|| SandboxError::Internal("empty run_cmd".into()))?;

        let program = Self::resolve_program(program);

        // Create a temporary directory for the sandbox workdir
        let workdir = std::env::temp_dir().join(format!("zerocode-{}", job.token));
        std::fs::create_dir_all(&workdir)
            .map_err(|e| SandboxError::Internal(format!("create workdir: {e}")))?;

        // Write source code to the appropriate file
        let source_file = workdir.join(&job.language.source_file);
        std::fs::write(&source_file, &job.source_code)
            .map_err(|e| SandboxError::Internal(format!("write source file: {e}")))?;

        let started_at = Utc::now();
        let start = Instant::now();
        let wall_budget = Duration::from_secs_f64(job.limits.wall_time);

        // Build PATH to include runner-rootfs binaries
        let path_value = if let Ok(rootfs) = std::env::var("ZEROCODE_RUNNER_ROOTFS") {
            // Prepend rootfs paths, fallback to host paths
            format!(
                "{}/usr/local/bin:{}/usr/bin:{}/bin:/usr/local/bin:/usr/bin:/bin",
                rootfs, rootfs, rootfs
            )
        } else {
            "/usr/local/bin:/usr/bin:/bin".to_string()
        };

        // Build LD_LIBRARY_PATH to include runner-rootfs libraries
        let ld_lib_path_value = if let Ok(rootfs) = std::env::var("ZEROCODE_RUNNER_ROOTFS") {
            format!(
                "{}/usr/local/lib:{}/usr/lib:{}/lib:{}/usr/lib/aarch64-linux-gnu:{}/usr/lib/x86_64-linux-gnu:/usr/local/lib:/usr/lib:/lib",
                rootfs, rootfs, rootfs, rootfs, rootfs
            )
        } else {
            String::new()
        };

        let mut cmd = Command::new(&program);
        cmd.current_dir(&workdir)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_clear()
            .env("LANG", "C.UTF-8")
            .env("HOME", "/tmp")
            .env("PATH", &path_value);
        
        // Only set LD_LIBRARY_PATH if it's not empty
        if !ld_lib_path_value.is_empty() {
            cmd.env("LD_LIBRARY_PATH", &ld_lib_path_value);
        }
        
        for (k, v) in &job.language.env {
            cmd.env(k, v);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| SandboxError::Spawn(e.to_string()))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(&job.stdin)
                .await
                .map_err(|e| SandboxError::Spawn(format!("stdin write: {e}")))?;
            drop(stdin);
        }

        let output = match tokio::time::timeout(wall_budget, child.wait_with_output()).await {
            Ok(r) => r.map_err(|e| SandboxError::Wait(e.to_string()))?,
            Err(_) => {
                // Clean up temp directory on timeout
                let _ = std::fs::remove_dir_all(&workdir);
                return Ok(SandboxResult {
                    status: Status::TimeLimitExceeded(zerocode_core::status::TimeLimitKind::Wall),
                    stdout: Bytes::new(),
                    stderr: Bytes::new(),
                    compile_output: None,
                    compiled_binary: None,
                    exit_code: None,
                    signal: Some(Signal::Sigkill),
                    cpu_time: start.elapsed(),
                    wall_time: start.elapsed(),
                    memory_kb: 0,
                    started_at,
                    finished_at: Utc::now(),
                });
            }
        };

        let elapsed = start.elapsed();
        let status = if output.status.success() {
            Status::Accepted
        } else {
            match output.status.code() {
                Some(c) => Status::NonZeroExit(c),
                None => Status::RuntimeError(Signal::Sigkill),
            }
        };

        // Clean up temp directory
        let _ = std::fs::remove_dir_all(&workdir);

        Ok(SandboxResult {
            status,
            stdout: cap(output.stdout, job.limits.max_stdout as usize),
            stderr: cap(output.stderr, job.limits.max_stderr as usize),
            compile_output: None,
            compiled_binary: None,
            exit_code: output.status.code(),
            signal: None,
            cpu_time: elapsed,
            wall_time: elapsed,
            memory_kb: 0,
            started_at,
            finished_at: Utc::now(),
        })
    }
}

fn cap(mut v: Vec<u8>, max: usize) -> Bytes {
    if v.len() > max {
        v.truncate(max);
    }
    Bytes::from(v)
}
