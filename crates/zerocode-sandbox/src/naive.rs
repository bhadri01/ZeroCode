//! Phase 1 plumbing sandbox. NO isolation. Behind the `unsafe-naive` feature
//! gate so binaries can't ship it by accident.
//!
//! The sole reason this exists is to wire `API → queue → worker → "sandbox" →
//! Submission row` end-to-end before the real native sandbox lands in
//! Phase 1.5. Once `NativeSandbox` works, this module is removed.
//!
//! Three responsibilities the dev path can't skip even without isolation:
//!   1. **Chroot** into the runner rootfs before exec'ing the compile/run
//!      command. Without this, toolchains like gcc/g++/javac/rustc/node look
//!      up `/usr/include`, `/usr/share/...`, etc. on the host's debian-slim
//!      base image (where they don't exist) instead of inside the rootfs.
//!      The worker container has `CAP_SYS_CHROOT` for this; see
//!      `deploy/docker-compose.yml`.
//!   2. **Substitute placeholders** (`${memory_mb}`, `${jvm_heap_mb}`,
//!      `${cpu_time}`, `${wall_time}`, `${max_pids}`) in env values and
//!      compile/run args. Without this Node sees the literal `${memory_mb}`
//!      in `NODE_OPTIONS` and aborts; same for `GOMEMLIMIT`,
//!      `JAVA_TOOL_OPTIONS`, etc.
//!   3. **Compile-then-run** flow. Run `compile_cmd` first when non-empty,
//!      route stderr/stdout into `compile_output`, and only exec `run_cmd`
//!      on a zero-exit compile. Without this every compiled language errors
//!      with "./prog: not found".

use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Once};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bytes::Bytes;
use chrono::Utc;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::task::JoinHandle;
use zerocode_core::{ResourceLimits, Signal, Status};

use crate::{Sandbox, SandboxError, SandboxJob, SandboxResult};

/// Default location for the runner rootfs inside the worker container.
const DEFAULT_RUNNER_ROOTFS: &str = "/var/lib/zerocode/runner-rootfs";

/// Per-job workdir inside the chroot. Kept short to avoid surprising the
/// shell or any tool that imposes path-length limits.
fn inside_workdir(token: &str) -> String {
    format!("/box/{token}")
}

pub struct NaiveSandbox;

/// Bind-mounts `/proc` and `/dev` from the host into the runner rootfs so
/// chroot'd processes can read them. Many tools (Go's `os.Executable`,
/// rustc's working-dir probe, the JVM's `libjli.so` resolver) fail without
/// `/proc/self/exe`; others (anything that writes to stdout/stderr) need
/// `/dev/null`. Run once per worker process.
fn init_rootfs_binds(rootfs: &str) {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        for sub in ["proc", "dev"] {
            let target = format!("{rootfs}/{sub}");
            if !Path::new(&target).exists() {
                if let Err(e) = std::fs::create_dir_all(&target) {
                    tracing::warn!(
                        target = %target,
                        error = %e,
                        "could not create rootfs mount point — chroot'd processes may fail"
                    );
                    continue;
                }
            }
            // Skip if already mounted (the worker may have been restarted).
            let already = std::fs::read_to_string("/proc/self/mountinfo")
                .map(|s| s.lines().any(|l| l.contains(&target)))
                .unwrap_or(false);
            if already {
                continue;
            }
            // `mount --bind --rbind` via the `mount` binary; we can shell out
            // here because this is one-time setup. The worker container has
            // CAP_SYS_ADMIN so the mount syscall is permitted.
            let status = std::process::Command::new("/bin/mount")
                .args(["--rbind", &format!("/{sub}"), &target])
                .status();
            match status {
                Ok(s) if s.success() => {
                    tracing::info!(target = %target, "bind-mounted into runner rootfs");
                }
                Ok(s) => tracing::warn!(target = %target, code = ?s.code(), "bind-mount failed"),
                Err(e) => tracing::warn!(target = %target, error = %e, "bind-mount spawn failed"),
            }
        }
    });
}

/// Mirror of `native::exec::substitute_limits`. Cheap string replace —
/// matches the placeholders documented in `runners/languages.toml`.
fn substitute_limits(input: &str, limits: &ResourceLimits) -> String {
    let jvm_heap = limits.memory_mb.saturating_sub(256).max(32);
    input
        .replace("${memory_mb}", &limits.memory_mb.to_string())
        .replace("${jvm_heap_mb}", &jvm_heap.to_string())
        .replace("${cpu_time}", &format!("{:.3}", limits.cpu_time))
        .replace("${wall_time}", &format!("{:.3}", limits.wall_time))
        .replace("${max_pids}", &limits.max_pids.to_string())
}

fn cap(mut v: Vec<u8>, max: usize) -> Bytes {
    if v.len() > max {
        v.truncate(max);
    }
    Bytes::from(v)
}

/// Background task that polls `/proc/<pid>/status` for `VmHWM` (peak resident
/// set size, in KiB) and records the maximum into a shared atomic. Used by
/// the NaiveSandbox to surface a real memory number on Docker Desktop
/// (where cgroup-v2 `memory.peak` isn't accessible). The task exits when the
/// child disappears from /proc or when the caller aborts it.
fn spawn_peak_rss_sampler(pid: u32) -> (JoinHandle<()>, Arc<AtomicU32>) {
    let peak = Arc::new(AtomicU32::new(0));
    let peak_writer = peak.clone();
    let handle = tokio::spawn(async move {
        let path = format!("/proc/{pid}/status");
        loop {
            match tokio::fs::read_to_string(&path).await {
                Ok(s) => {
                    if let Some(kb) = s
                        .lines()
                        .find(|l| l.starts_with("VmHWM:"))
                        .and_then(|l| l.split_whitespace().nth(1))
                        .and_then(|n| n.parse::<u32>().ok())
                    {
                        peak_writer.fetch_max(kb, Ordering::Relaxed);
                    }
                }
                Err(_) => break,
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    });
    (handle, peak)
}

#[async_trait]
impl Sandbox for NaiveSandbox {
    async fn execute(&self, job: SandboxJob) -> Result<SandboxResult, SandboxError> {
        tracing::warn!(
            token = %job.token,
            "NaiveSandbox executes WITHOUT isolation — never ship this enabled"
        );

        let rootfs = std::env::var("ZEROCODE_RUNNER_ROOTFS")
            .unwrap_or_else(|_| DEFAULT_RUNNER_ROOTFS.to_string());
        init_rootfs_binds(&rootfs);
        let token_str = job.token.to_string();
        let inside_dir = inside_workdir(&token_str);
        let host_workdir = format!("{rootfs}/box/{token_str}");

        std::fs::create_dir_all(&host_workdir)
            .map_err(|e| SandboxError::Internal(format!("create workdir {host_workdir}: {e}")))?;
        // Make the workdir world-readable/writable for now — chroot'd
        // processes here run as the host's root uid, but tools like gcc may
        // recreate temp files with restricted modes. World access keeps the
        // dev path simple.
        let _ = std::fs::set_permissions(
            &host_workdir,
            <std::fs::Permissions as std::os::unix::fs::PermissionsExt>::from_mode(0o777),
        );

        let source_file_host = format!("{host_workdir}/{}", job.language.source_file);
        std::fs::write(&source_file_host, &job.source_code)
            .map_err(|e| SandboxError::Internal(format!("write source: {e}")))?;

        let started_at = Utc::now();
        let start = Instant::now();
        let wall_budget = Duration::from_secs_f64(job.limits.wall_time);

        let substituted_env: Vec<(String, String)> = job
            .language
            .env
            .iter()
            .map(|(k, v)| (k.clone(), substitute_limits(v, &job.limits)))
            .collect();

        // Build a closure that prepares a tokio::process::Command with chroot
        // applied just before exec. The host workdir doubles as the cwd that
        // we set after chroot — its path inside the new root is `/box/<tok>`.
        let prepare_cmd = |program: &str, args: &[String], stdin: Stdio| -> Command {
            let rootfs_clone = rootfs.clone();
            let inside_dir_clone = inside_dir.clone();
            let mut cmd = Command::new(program);
            cmd.args(args)
                .stdin(stdin)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .env_clear()
                .env("LANG", "C.UTF-8")
                .env("HOME", "/tmp")
                .env("PATH", "/usr/local/bin:/usr/bin:/bin:/usr/local/go/bin");
            for (k, v) in &substituted_env {
                cmd.env(k, v);
            }
            // SAFETY: chroot + chdir are async-signal-safe; we don't call any
            // allocator-touching APIs from pre_exec.
            unsafe {
                cmd.pre_exec(move || {
                    std::os::unix::fs::chroot(&rootfs_clone)?;
                    std::env::set_current_dir(&inside_dir_clone)?;
                    Ok(())
                });
            }
            cmd
        };

        // ── compile phase ─────────────────────────────────────────────────
        let mut compile_output: Option<Bytes> = None;
        let compile_cmd = job.language.compile_cmd.as_deref().unwrap_or(&[]);
        if !compile_cmd.is_empty() {
            let (cprog, cargs) = compile_cmd
                .split_first()
                .ok_or_else(|| SandboxError::Internal("empty compile_cmd".into()))?;
            let cargs_subbed: Vec<String> = cargs
                .iter()
                .map(|a| substitute_limits(a, &job.limits))
                .collect();

            let child = prepare_cmd(cprog, &cargs_subbed, Stdio::null())
                .spawn()
                .map_err(|e| SandboxError::Spawn(format!("compile spawn: {e}")))?;

            let out = match tokio::time::timeout(wall_budget, child.wait_with_output()).await {
                Ok(r) => r.map_err(|e| SandboxError::Wait(format!("compile wait: {e}")))?,
                Err(_) => {
                    let _ = std::fs::remove_dir_all(&host_workdir);
                    let elapsed = start.elapsed();
                    return Ok(SandboxResult {
                        status: Status::TimeLimitExceeded(
                            zerocode_core::status::TimeLimitKind::Wall,
                        ),
                        stdout: Bytes::new(),
                        stderr: Bytes::new(),
                        compile_output: Some(Bytes::from_static(b"compile timed out")),
                        compiled_binary: None,
                        exit_code: None,
                        signal: Some(Signal::Sigkill),
                        cpu_time: elapsed,
                        wall_time: elapsed,
                        memory_kb: 0,
                        started_at,
                        finished_at: Utc::now(),
                    });
                }
            };

            let stderr_text = String::from_utf8_lossy(&out.stderr).into_owned();
            let stdout_text = String::from_utf8_lossy(&out.stdout).into_owned();
            let combined = if stdout_text.is_empty() {
                stderr_text
            } else if stderr_text.is_empty() {
                stdout_text
            } else {
                format!("{stdout_text}\n{stderr_text}")
            };

            if !out.status.success() {
                let _ = std::fs::remove_dir_all(&host_workdir);
                let elapsed = start.elapsed();
                return Ok(SandboxResult {
                    status: Status::CompileError,
                    stdout: Bytes::new(),
                    stderr: Bytes::new(),
                    compile_output: Some(Bytes::from(combined.into_bytes())),
                    compiled_binary: None,
                    exit_code: out.status.code(),
                    signal: None,
                    cpu_time: elapsed,
                    wall_time: elapsed,
                    memory_kb: 0,
                    started_at,
                    finished_at: Utc::now(),
                });
            }
            if !combined.is_empty() {
                compile_output = Some(Bytes::from(combined.into_bytes()));
            }
        }

        // ── run phase ─────────────────────────────────────────────────────
        let (rprog, rargs) = job
            .language
            .run_cmd
            .split_first()
            .ok_or_else(|| SandboxError::Internal("empty run_cmd".into()))?;
        let rargs_subbed: Vec<String> = rargs
            .iter()
            .map(|a| substitute_limits(a, &job.limits))
            .collect();

        let mut child = prepare_cmd(rprog, &rargs_subbed, Stdio::piped())
            .spawn()
            .map_err(|e| SandboxError::Spawn(format!("run spawn: {e}")))?;

        // Sample VmHWM while the child is alive — NaiveSandbox can't read
        // cgroup memory.peak under Docker Desktop. The sampler stops on its
        // own when the child exits and /proc/<pid>/ disappears.
        let pid = child.id().unwrap_or(0);
        let (sampler, peak_rss_kb) = spawn_peak_rss_sampler(pid);

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(&job.stdin)
                .await
                .map_err(|e| SandboxError::Spawn(format!("stdin write: {e}")))?;
            drop(stdin);
        }

        let remaining = wall_budget.saturating_sub(start.elapsed());
        let output = match tokio::time::timeout(remaining, child.wait_with_output()).await {
            Ok(r) => {
                sampler.abort();
                r.map_err(|e| SandboxError::Wait(e.to_string()))?
            }
            Err(_) => {
                sampler.abort();
                let memory_kb = peak_rss_kb.load(Ordering::Relaxed);
                let _ = std::fs::remove_dir_all(&host_workdir);
                return Ok(SandboxResult {
                    status: Status::TimeLimitExceeded(zerocode_core::status::TimeLimitKind::Wall),
                    stdout: Bytes::new(),
                    stderr: Bytes::new(),
                    compile_output,
                    compiled_binary: None,
                    exit_code: None,
                    signal: Some(Signal::Sigkill),
                    cpu_time: start.elapsed(),
                    wall_time: start.elapsed(),
                    memory_kb,
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

        let memory_kb = peak_rss_kb.load(Ordering::Relaxed);
        let _ = std::fs::remove_dir_all(&host_workdir);

        Ok(SandboxResult {
            status,
            stdout: cap(output.stdout, job.limits.max_stdout as usize),
            stderr: cap(output.stderr, job.limits.max_stderr as usize),
            compile_output,
            compiled_binary: None,
            exit_code: output.status.code(),
            signal: None,
            cpu_time: elapsed,
            wall_time: elapsed,
            memory_kb,
            started_at,
            finished_at: Utc::now(),
        })
    }
}
