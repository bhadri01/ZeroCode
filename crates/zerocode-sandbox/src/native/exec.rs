//! Forks a child into fresh Linux namespaces, drops capabilities, attaches it
//! to a cgroup, applies landlock + seccomp, and exec's the language binary.
//! Stdout/stderr come back via pipes the parent reads with a per-fd size cap.
//!
//! Phase 2 scope (active now):
//! - PID/NET/IPC/UTS/MNT/USER namespaces
//! - User-namespace UID/GID mapping (parent writes `/proc/<pid>/uid_map`)
//! - Mount namespace made `MS_PRIVATE | MS_REC`
//! - Per-submission tmpfs on `/tmp` (size 64 MB)
//! - Loopback `lo` brought up inside NET namespace
//! - All capabilities dropped + `PR_SET_NO_NEW_PRIVS`
//! - Landlock filesystem policy (RO `/usr` `/lib` etc; RW only scratch + /tmp)
//! - Seccomp allow-by-default with the Docker-default deny list subtracted
//!
//! Phase 2.5 layers on `pivot_root` into the read-only runner rootfs and a
//! per-submission tmpfs on `/box`.

use std::ffi::CString;
use std::io::Read;
use std::os::fd::OwnedFd;
use std::path::Path;

use bytes::Bytes;
use nix::sched::{CloneFlags, unshare};
use nix::sys::signal::{self, SigHandler};
use nix::sys::wait::{WaitStatus, waitpid};
use nix::unistd::{
    ForkResult, Pid, dup2_stderr, dup2_stdin, dup2_stdout, execvpe, fork, pipe, read, write,
};
use zerocode_core::{LanguageSpec, ResourceLimits};

use crate::SandboxError;

use super::NativeSandboxConfig;
use super::cgroup::Cgroup;
use super::landlock_policy;
use super::mounts;
use super::scratch::Scratch;
use super::seccomp;
use super::userns;

const BOX_TMPFS_MB: u32 = 32;
const TMP_TMPFS_MB: u32 = 64;

/// The child's outcome from the parent's perspective. Mapped to `Status` in
/// `triage.rs`.
pub struct RawOutcome {
    pub exit_status: WaitStatus,
    pub stdout: Bytes,
    pub stderr: Bytes,
    pub compile_stderr: Bytes,
    pub killed_by_wall_timeout: bool,
}

const NAMESPACE_FLAGS: CloneFlags = CloneFlags::empty()
    .union(CloneFlags::CLONE_NEWPID)
    .union(CloneFlags::CLONE_NEWNS)
    .union(CloneFlags::CLONE_NEWIPC)
    .union(CloneFlags::CLONE_NEWUTS)
    .union(CloneFlags::CLONE_NEWNET)
    .union(CloneFlags::CLONE_NEWUSER);

pub fn run(
    config: &NativeSandboxConfig,
    spec: &LanguageSpec,
    scratch: &Scratch,
    cgroup: &Cgroup,
    limits: &ResourceLimits,
    has_cached_binary: bool,
) -> Result<RawOutcome, SandboxError> {
    let wall_time = std::time::Duration::from_secs_f64(limits.wall_time);
    let max_stdout = limits.max_stdout as usize;
    let max_stderr = limits.max_stderr as usize;
    // Three pipes drive the parent ↔ child handshake:
    //   stdout / stderr — captured by the parent reader threads
    //   ready_pipe     — child→parent: "I've called unshare(NEWUSER)"
    //   start_pipe     — parent→child: "uid_map + cgroup are set, proceed"
    let (stdout_rd, stdout_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe stdout: {e}")))?;
    let (stderr_rd, stderr_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe stderr: {e}")))?;
    let (compile_rd, compile_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe compile: {e}")))?;
    let (ready_rd, ready_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe ready: {e}")))?;
    let (start_rd, start_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe start: {e}")))?;

    let scratch_path = scratch.path.clone();
    let runner_rootfs = config.runner_rootfs.clone();
    let source_file = spec.source_file.clone();
    let env_strings = build_env(spec, limits);
    let run_argv = build_argv(spec, limits);
    let compile_argv = build_compile_argv(spec, limits);

    // SAFETY: fork is unsafe in any Rust runtime. Inside the child block we
    // restrict ourselves to async-signal-safe operations and execve.
    match unsafe { fork() }.map_err(|e| SandboxError::Spawn(format!("fork: {e}")))? {
        ForkResult::Parent { child } => {
            drop(stdout_wr);
            drop(stderr_wr);
            drop(compile_wr);
            drop(start_rd);
            drop(ready_wr);

            // Wait for the child to enter its new user namespace.
            let mut byte = [0u8; 1];
            read(&ready_rd, &mut byte)
                .map_err(|e| SandboxError::Spawn(format!("read ready signal: {e}")))?;
            drop(ready_rd);

            // Now that the child is in the new userns, write its UID/GID map
            // before any other setup. This is done from the parent because
            // an unprivileged child can't write its own uid_map.
            if let Err(e) = userns::write_maps(child.as_raw()) {
                tracing::error!(error = %e, "userns map write failed; killing child");
                let _ = cgroup.kill();
            }

            // Attach the child to the cgroup before it execs. The kernel
            // doesn't care which task does the write to cgroup.procs as long
            // as the writer has permission; this is simpler than handing the
            // child a writable cgroup fd.
            cgroup.attach(child.as_raw())?;

            // Tell the child to proceed.
            let _ = write(&start_wr, b"1");
            drop(start_wr);

            // Read stdout/stderr/compile_stderr concurrently with a size cap.
            let stdout = std::thread::spawn(move || read_capped(stdout_rd, max_stdout));
            let stderr = std::thread::spawn(move || read_capped(stderr_rd, max_stderr));
            let compile_stderr = std::thread::spawn(move || read_capped(compile_rd, max_stderr));

            // Wall-clock budget; on overrun we ask the cgroup to atomically
            // SIGKILL every process in the sandbox.
            let (status, killed_by_wall_timeout) = wait_with_timeout(child, wall_time, cgroup)?;

            let stdout = stdout
                .join()
                .map_err(|_| SandboxError::Internal("stdout reader panicked".into()))?;
            let stderr = stderr
                .join()
                .map_err(|_| SandboxError::Internal("stderr reader panicked".into()))?;
            let compile_stderr = compile_stderr
                .join()
                .map_err(|_| SandboxError::Internal("compile stderr reader panicked".into()))?;

            Ok(RawOutcome {
                exit_status: status,
                stdout,
                stderr,
                compile_stderr,
                killed_by_wall_timeout,
            })
        }
        ForkResult::Child => {
            drop(stdout_rd);
            drop(stderr_rd);
            drop(compile_rd);
            drop(ready_rd);
            drop(start_wr);

            // Phase 2 child path: every step bails to exit(127) with a
            // message on stderr if it fails. We can't use ?-propagation here
            // because we're already past fork(); the parent only sees us via
            // the exit status + pipe contents.
            if let Err(e) = run_child(
                &NAMESPACE_FLAGS,
                &ready_wr,
                &start_rd,
                &runner_rootfs,
                &scratch_path,
                &source_file,
                &stdout_wr,
                &stderr_wr,
                &compile_wr,
                compile_argv.as_deref(),
                &run_argv,
                &env_strings,
                has_cached_binary,
            ) {
                eprintln!("zerocode child: {e}");
                std::process::exit(127);
            }
            unreachable!("execvpe returns only on error")
        }
    }
}

/// Sentinel exit code the outer child uses to tell its grandparent (the
/// worker) "the compile sub-child failed; treat my stderr as compile_output".
/// Picked at the top of the 8-bit range to minimise the chance of colliding
/// with a real program exit. Anything <253 is a real run-phase exit code.
pub const COMPILE_FAILED_EXIT_CODE: i32 = 253;

fn run_child(
    flags: &CloneFlags,
    ready_wr: &OwnedFd,
    start_rd: &OwnedFd,
    runner_rootfs: &Path,
    scratch_path: &Path,
    source_file: &str,
    stdout_wr: &OwnedFd,
    stderr_wr: &OwnedFd,
    compile_wr: &OwnedFd,
    compile_argv: Option<&[CString]>,
    run_argv: &[CString],
    env_strings: &[CString],
    has_cached_binary: bool,
) -> Result<(), SandboxError> {
    // 1. Enter the namespaces. We appear as "nobody" inside the new user
    //    namespace until the parent writes our uid_map.
    unshare(*flags).map_err(|e| SandboxError::NamespaceSetup(format!("unshare: {e}")))?;

    // 2. Tell the parent we're in the new userns; wait for ack (uid_map +
    //    cgroup attach).
    write(ready_wr, b"1").map_err(|e| SandboxError::Spawn(format!("ready signal: {e}")))?;
    let mut byte = [0u8; 1];
    read(start_rd, &mut byte).map_err(|e| SandboxError::Spawn(format!("start ack: {e}")))?;

    // 3. Fork into the new PID namespace. `unshare(CLONE_NEWPID)` only places
    //    our *children* in the new pidns — this process stays in the old one.
    //    The grandchild becomes PID 1 of the new namespace, which is required
    //    both to mount a fresh `/proc` (the kernel binds a procfs instance to
    //    the mounter's active pidns, and refuses the mount otherwise — fatal
    //    inside Docker's locked-mount /proc) and so user code actually runs
    //    under PID-namespace isolation. This intermediate process then mirrors
    //    the grandchild's exit status back up to the worker.
    match unsafe { fork() }.map_err(|e| SandboxError::Spawn(format!("pidns fork: {e}")))? {
        ForkResult::Parent { child } => relay_grandchild_exit(child),
        ForkResult::Child => run_sandbox_child(
            runner_rootfs,
            scratch_path,
            source_file,
            stdout_wr,
            stderr_wr,
            compile_wr,
            compile_argv,
            run_argv,
            env_strings,
            has_cached_binary,
        ),
    }
}

/// PID 1 of the new namespace: finishes sandbox setup and exec's user code.
/// Runs in the grandchild forked by [`run_child`]. Any `Err` propagates to the
/// `run()` child wrapper, which prints it and exits 127.
#[allow(clippy::too_many_arguments)]
fn run_sandbox_child(
    runner_rootfs: &Path,
    scratch_path: &Path,
    source_file: &str,
    stdout_wr: &OwnedFd,
    stderr_wr: &OwnedFd,
    compile_wr: &OwnedFd,
    compile_argv: Option<&[CString]>,
    run_argv: &[CString],
    env_strings: &[CString],
    has_cached_binary: bool,
) -> Result<(), SandboxError> {
    // 1. Mount-propagation off so our tmpfs mounts don't leak to the host.
    mounts::make_namespace_private()?;

    // 2. The big one: rbind the runner rootfs, mount /box and /tmp tmpfs,
    //    copy source + stdin, pivot_root, mount a fresh /proc scoped to this
    //    PID namespace, chdir /box. After this the child can no longer see
    //    anything from the host.
    mounts::pivot_into_runner(
        runner_rootfs,
        scratch_path,
        source_file,
        BOX_TMPFS_MB,
        TMP_TMPFS_MB,
    )?;

    // 3. Bring up loopback so 127.0.0.1 is reachable inside the NET ns.
    if let Err(e) = mounts::bring_loopback_up() {
        eprintln!("zerocode child lo up failed (continuing): {e}");
    }

    // 4. Redirect stdin from /box/stdin. Done before stdout/stderr so any
    //    subsequent errors still surface via the original stderr.
    let stdin_file = std::fs::File::open("/box/stdin")
        .map_err(|e| SandboxError::MountSetup(format!("open /box/stdin: {e}")))?;
    dup2_stdin(&stdin_file).map_err(|e| SandboxError::Spawn(format!("dup2 stdin: {e}")))?;

    // 5. Redirect stdout/stderr to the parent's pipes.
    dup2_stdout(stdout_wr).map_err(|e| SandboxError::Spawn(format!("dup2 stdout: {e}")))?;
    dup2_stderr(stderr_wr).map_err(|e| SandboxError::Spawn(format!("dup2 stderr: {e}")))?;

    // 6. Drop every capability across all 5 capsets.
    drop_all_capabilities()?;

    // 7. Lock NO_NEW_PRIVS so even if the child re-enters a setuid binary
    //    (none should exist in the runner image, but defence in depth) it
    //    can't regain capabilities.
    nix::sys::prctl::set_no_new_privs()
        .map_err(|e| SandboxError::Spawn(format!("PR_SET_NO_NEW_PRIVS: {e}")))?;

    // 8. Landlock — paths are inside the new root now. /box is RW; system
    //    paths like /usr, /lib are RO.
    landlock_policy::apply(Path::new("/box"))?;

    // 9. Seccomp. Must come AFTER NO_NEW_PRIVS or the kernel rejects the
    //    filter for unprivileged tasks. The filter is inherited by any
    //    fork() below, so the compile sub-child gets it too.
    seccomp::apply_default()?;

    // 10. If this language has a compile step, run it as a sub-child first.
    //     On compile failure the outer child exits with COMPILE_FAILED_EXIT_CODE
    //     so the worker's triage tree knows to populate `compile_output` from
    //     stderr instead of treating it as a run-phase exit code.
    if let Some(compile_argv) = compile_argv {
        if !compile_argv.is_empty() && !has_cached_binary {
            run_compile_phase(compile_argv, env_strings, compile_wr)?;
            // Write the compiled binary to the exchange file so the parent can
            // read it from scratch_dir/artifact after we exit. Best-effort —
            // the cache is an optimisation, not a correctness requirement.
            let _ = std::fs::copy("/box/prog", "/box/.artifact");
        }
    }

    // 11. Run phase. argv stays heap-owned via the CString vec; execvpe takes
    //     references. This is the last thing the child does — execvpe replaces
    //     the process image so we never return here.
    let prog = run_argv
        .first()
        .ok_or_else(|| SandboxError::Spawn("empty run_cmd".into()))?
        .clone();
    let argv: Vec<&CString> = run_argv.iter().collect();
    let envp: Vec<&CString> = env_strings.iter().collect();
    execvpe(&prog, &argv, &envp)
        .map_err(|e| SandboxError::Spawn(format!("execvpe {prog:?}: {e}")))?;
    Ok(())
}

/// The intermediate (old-pidns) process: wait for the sandbox grandchild and
/// terminate with the *same* status, so the worker's `wait_with_timeout`
/// observes the true outcome (exit code, or signal for segfault/CPU-TLE). If
/// the worker wall-kills the cgroup, this process is SIGKILLed too and never
/// reaches here. Never returns.
fn relay_grandchild_exit(child: Pid) -> ! {
    match waitpid(child, None) {
        Ok(WaitStatus::Exited(_, code)) => std::process::exit(code),
        Ok(WaitStatus::Signaled(_, sig, _)) => {
            // Re-raise the same signal so the parent sees `Signaled(sig)` and
            // triage maps it to RuntimeError / TimeLimitExceeded faithfully.
            // Reset to the default disposition first (we inherited the worker's
            // handlers across fork) so the raise actually terminates us.
            unsafe {
                let _ = signal::signal(sig, SigHandler::SigDfl);
            }
            let _ = signal::raise(sig);
            std::process::exit(128 + sig as i32)
        }
        // StillAlive can't happen with a blocking wait; treat anything else as
        // an internal failure the parent will surface.
        _ => std::process::exit(127),
    }
}

/// Fork a sub-child that execs the compile command and wait for it. If the
/// sub-child exits non-zero (or is signalled), the outer child exits with
/// `COMPILE_FAILED_EXIT_CODE`; otherwise we return normally so the caller
/// can proceed to execvpe the run command.
fn run_compile_phase(
    compile_argv: &[CString],
    env_strings: &[CString],
    compile_wr: &OwnedFd,
) -> Result<(), SandboxError> {
    // SAFETY: we're already inside the outer child; fork is permitted but
    // the sub-child must restrict itself to async-signal-safe ops + execvpe.
    match unsafe { fork() }.map_err(|e| SandboxError::Spawn(format!("compile fork: {e}")))? {
        ForkResult::Child => {
            // Redirect the sub-child's stderr to the compile pipe so
            // compiler diagnostics are captured separately from run-phase
            // stderr. The parent reads compile_rd in a dedicated thread.
            dup2_stderr(compile_wr)
                .map_err(|e| SandboxError::Spawn(format!("dup2 compile stderr: {e}")))
                .unwrap_or_else(|_| std::process::exit(127));
            let prog = match compile_argv.first() {
                Some(p) => p.clone(),
                None => {
                    eprintln!("zerocode compile sub-child: empty compile_cmd");
                    std::process::exit(127);
                }
            };
            let argv: Vec<&CString> = compile_argv.iter().collect();
            let envp: Vec<&CString> = env_strings.iter().collect();
            match execvpe(&prog, &argv, &envp) {
                Ok(_) => unreachable!(),
                Err(e) => {
                    eprintln!("zerocode compile execvpe {prog:?}: {e}");
                    std::process::exit(127);
                }
            }
        }
        ForkResult::Parent { child } => {
            let status = nix::sys::wait::waitpid(child, None)
                .map_err(|e| SandboxError::Wait(format!("compile wait: {e}")))?;
            match status {
                WaitStatus::Exited(_, 0) => Ok(()),
                _ => {
                    // Compile failed. Exit with the sentinel so the outer
                    // worker maps this to Status::CompileError. The stderr
                    // buffer already contains the compiler's diagnostics.
                    std::process::exit(COMPILE_FAILED_EXIT_CODE);
                }
            }
        }
    }
}

fn drop_all_capabilities() -> Result<(), SandboxError> {
    use caps::{CapSet, clear};
    // Order matters: dropping the bounding set uses PR_CAPBSET_DROP, which
    // requires *effective* CAP_SETPCAP. So clear Bounding (and Ambient) FIRST,
    // while we still hold a full effective set, then drop the rest. Clearing
    // Effective first would remove the capability that authorizes the bounding
    // drop and PR_CAPBSET_DROP would fail with EPERM.
    clear(None, CapSet::Bounding).map_err(|e| SandboxError::Spawn(format!("drop bnd: {e}")))?;
    clear(None, CapSet::Ambient).map_err(|e| SandboxError::Spawn(format!("drop amb: {e}")))?;
    clear(None, CapSet::Effective).map_err(|e| SandboxError::Spawn(format!("drop eff: {e}")))?;
    clear(None, CapSet::Permitted).map_err(|e| SandboxError::Spawn(format!("drop perm: {e}")))?;
    clear(None, CapSet::Inheritable).map_err(|e| SandboxError::Spawn(format!("drop inh: {e}")))?;
    Ok(())
}

fn build_argv(spec: &LanguageSpec, limits: &ResourceLimits) -> Vec<CString> {
    spec.run_cmd
        .iter()
        .filter_map(|s| CString::new(substitute_limits(s, limits).into_bytes()).ok())
        .collect()
}

fn build_compile_argv(spec: &LanguageSpec, limits: &ResourceLimits) -> Option<Vec<CString>> {
    let cmd = spec.compile_cmd.as_ref()?;
    if cmd.is_empty() {
        return None;
    }
    Some(
        cmd.iter()
            .filter_map(|s| CString::new(substitute_limits(s, limits).into_bytes()).ok())
            .collect(),
    )
}

fn build_env(spec: &LanguageSpec, limits: &ResourceLimits) -> Vec<CString> {
    let mut env = vec![
        cstring("LANG=C.UTF-8"),
        cstring("LC_ALL=C.UTF-8"),
        cstring("HOME=/tmp"),
        cstring("PATH=/usr/local/bin:/usr/bin:/bin"),
    ];
    for (k, v) in &spec.env {
        let expanded = substitute_limits(v, limits);
        if let Ok(s) = CString::new(format!("{k}={expanded}").into_bytes()) {
            env.push(s);
        }
    }
    env
}

/// Substitute `${memory_mb}`, `${cpu_time}`, `${wall_time}`, `${max_pids}`,
/// and `${jvm_heap_mb}` in a language-spec env value with the per-submission
/// limits. Cheap string replace, not a full template language — that's enough
/// for the JVM/Node/Go runtime hooks we care about.
fn substitute_limits(input: &str, limits: &ResourceLimits) -> String {
    let jvm_heap = limits.memory_mb.saturating_sub(256).max(32);
    input
        .replace("${memory_mb}", &limits.memory_mb.to_string())
        .replace("${jvm_heap_mb}", &jvm_heap.to_string())
        .replace("${cpu_time}", &format!("{:.3}", limits.cpu_time))
        .replace("${wall_time}", &format!("{:.3}", limits.wall_time))
        .replace("${max_pids}", &limits.max_pids.to_string())
}

fn cstring(s: &str) -> CString {
    CString::new(s).expect("static env string contains a nul byte")
}

fn read_capped(fd: OwnedFd, cap: usize) -> Bytes {
    let mut buf = Vec::with_capacity(cap.min(4096));
    let mut f = std::fs::File::from(fd);
    let mut tmp = [0u8; 8192];
    loop {
        match f.read(&mut tmp) {
            Ok(0) => break,
            Ok(n) => {
                let take = (cap - buf.len()).min(n);
                buf.extend_from_slice(&tmp[..take]);
                if buf.len() >= cap {
                    // Drain remainder so the writer doesn't get SIGPIPE on
                    // its next write — we still want the child to exit clean.
                    while let Ok(n) = f.read(&mut tmp) {
                        if n == 0 {
                            break;
                        }
                    }
                    break;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    Bytes::from(buf)
}

fn wait_with_timeout(
    pid: Pid,
    wall_time: std::time::Duration,
    cgroup: &Cgroup,
) -> Result<(WaitStatus, bool), SandboxError> {
    use nix::sys::wait::WaitPidFlag;

    let start = std::time::Instant::now();
    loop {
        match waitpid(pid, Some(WaitPidFlag::WNOHANG)) {
            Ok(WaitStatus::StillAlive) => {
                if start.elapsed() >= wall_time {
                    let _ = cgroup.kill();
                    let final_status = waitpid(pid, None)
                        .map_err(|e| SandboxError::Wait(format!("post-kill wait: {e}")))?;
                    return Ok((final_status, true));
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Ok(status) => return Ok((status, false)),
            Err(e) => return Err(SandboxError::Wait(format!("waitpid: {e}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_argv_keeps_order() {
        let spec = LanguageSpec {
            id: 71,
            name: "Python".into(),
            version: "3.13".into(),
            source_file: "main.py".into(),
            compile_cmd: None,
            run_cmd: vec!["/usr/bin/python3.13".into(), "main.py".into()],
            env: vec![],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier: zerocode_core::SandboxTier::Native,
        };
        let argv = build_argv(&spec, &ResourceLimits::default());
        assert_eq!(argv.len(), 2);
        assert_eq!(argv[0].to_bytes(), b"/usr/bin/python3.13");
        assert_eq!(argv[1].to_bytes(), b"main.py");
    }

    #[test]
    fn build_env_includes_locale_and_per_spec() {
        let spec = LanguageSpec {
            id: 71,
            name: "Python".into(),
            version: "3.13".into(),
            source_file: "main.py".into(),
            compile_cmd: None,
            run_cmd: vec!["/usr/bin/python3.13".into()],
            env: vec![("PYTHONUNBUFFERED".into(), "1".into())],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier: zerocode_core::SandboxTier::Native,
        };
        let env = build_env(&spec, &ResourceLimits::default());
        let any = |needle: &str| env.iter().any(|c| c.to_bytes() == needle.as_bytes());
        assert!(any("LANG=C.UTF-8"));
        assert!(any("PYTHONUNBUFFERED=1"));
    }

    #[test]
    fn build_env_substitutes_memory_mb() {
        let spec = LanguageSpec {
            id: 63,
            name: "Node.js".into(),
            version: "22".into(),
            source_file: "main.js".into(),
            compile_cmd: None,
            run_cmd: vec!["/usr/bin/node".into(), "main.js".into()],
            env: vec![(
                "NODE_OPTIONS".into(),
                "--max-old-space-size=${memory_mb}".into(),
            )],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier: zerocode_core::SandboxTier::Native,
        };
        let mut limits = ResourceLimits::default();
        limits.memory_mb = 256;
        let env = build_env(&spec, &limits);
        assert!(
            env.iter()
                .any(|c| c.to_bytes() == b"NODE_OPTIONS=--max-old-space-size=256")
        );
    }

    #[test]
    fn substitute_limits_handles_all_placeholders() {
        let mut limits = ResourceLimits::default();
        limits.memory_mb = 128;
        limits.cpu_time = 2.5;
        limits.wall_time = 5.0;
        limits.max_pids = 64;
        let out = substitute_limits(
            "m=${memory_mb} c=${cpu_time} w=${wall_time} p=${max_pids}",
            &limits,
        );
        assert_eq!(out, "m=128 c=2.500 w=5.000 p=64");
    }

    #[test]
    fn substitute_limits_jvm_heap_mb() {
        let mut limits = ResourceLimits::default();
        limits.memory_mb = 512;
        let out = substitute_limits("-Xmx${jvm_heap_mb}m", &limits);
        assert_eq!(out, "-Xmx256m"); // 512 - 256 = 256

        limits.memory_mb = 128;
        let out = substitute_limits("-Xmx${jvm_heap_mb}m", &limits);
        assert_eq!(out, "-Xmx32m"); // 128 - 256 saturates to 0, floor 32

        limits.memory_mb = 300;
        let out = substitute_limits("-Xmx${jvm_heap_mb}m", &limits);
        assert_eq!(out, "-Xmx44m"); // 300 - 256 = 44
    }

    #[test]
    fn substitute_limits_passes_through_unrecognised() {
        let limits = ResourceLimits::default();
        assert_eq!(
            substitute_limits("nothing to substitute here", &limits),
            "nothing to substitute here"
        );
    }
}
