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

        let started_at = Utc::now();
        let start = Instant::now();
        let wall_budget = Duration::from_secs_f64(job.limits.wall_time);

        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_clear()
            .env("LANG", "C.UTF-8")
            .env("HOME", "/tmp")
            .env("PATH", "/usr/local/bin:/usr/bin:/bin");
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
                return Ok(SandboxResult {
                    status: Status::TimeLimitExceeded(zerocode_core::status::TimeLimitKind::Wall),
                    stdout: Bytes::new(),
                    stderr: Bytes::new(),
                    compile_output: None,
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

        Ok(SandboxResult {
            status,
            stdout: cap(output.stdout, job.limits.max_stdout as usize),
            stderr: cap(output.stderr, job.limits.max_stderr as usize),
            compile_output: None,
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
