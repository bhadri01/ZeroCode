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
use nix::sys::wait::{WaitStatus, waitpid};
use nix::unistd::{
    ForkResult, Pid, dup2_stderr, dup2_stdin, dup2_stdout, execvpe, fork, pipe, read, write,
};
use zerocode_core::LanguageSpec;

use crate::SandboxError;

use super::cgroup::Cgroup;
use super::landlock_policy;
use super::mounts;
use super::scratch::Scratch;
use super::seccomp;
use super::userns;

/// The child's outcome from the parent's perspective. Mapped to `Status` in
/// `triage.rs`.
pub struct RawOutcome {
    pub exit_status: WaitStatus,
    pub stdout: Bytes,
    pub stderr: Bytes,
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
    spec: &LanguageSpec,
    scratch: &Scratch,
    cgroup: &Cgroup,
    wall_time: std::time::Duration,
    max_stdout: usize,
    max_stderr: usize,
) -> Result<RawOutcome, SandboxError> {
    // Three pipes drive the parent ↔ child handshake:
    //   stdout / stderr — captured by the parent reader threads
    //   ready_pipe     — child→parent: "I've called unshare(NEWUSER)"
    //   start_pipe     — parent→child: "uid_map + cgroup are set, proceed"
    let (stdout_rd, stdout_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe stdout: {e}")))?;
    let (stderr_rd, stderr_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe stderr: {e}")))?;
    let (ready_rd, ready_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe ready: {e}")))?;
    let (start_rd, start_wr) =
        pipe().map_err(|e| SandboxError::Spawn(format!("pipe start: {e}")))?;

    let scratch_path = scratch.path.clone();
    let env_strings = build_env(spec);
    let argv_strings = build_argv(spec);

    // SAFETY: fork is unsafe in any Rust runtime. Inside the child block we
    // restrict ourselves to async-signal-safe operations and execve.
    match unsafe { fork() }.map_err(|e| SandboxError::Spawn(format!("fork: {e}")))? {
        ForkResult::Parent { child } => {
            drop(stdout_wr);
            drop(stderr_wr);
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

            // Read stdout/stderr concurrently with a size cap.
            let stdout = std::thread::spawn(move || read_capped(stdout_rd, max_stdout));
            let stderr = std::thread::spawn(move || read_capped(stderr_rd, max_stderr));

            // Wall-clock budget; on overrun we ask the cgroup to atomically
            // SIGKILL every process in the sandbox.
            let (status, killed_by_wall_timeout) = wait_with_timeout(child, wall_time, cgroup)?;

            let stdout = stdout
                .join()
                .map_err(|_| SandboxError::Internal("stdout reader panicked".into()))?;
            let stderr = stderr
                .join()
                .map_err(|_| SandboxError::Internal("stderr reader panicked".into()))?;

            Ok(RawOutcome {
                exit_status: status,
                stdout,
                stderr,
                killed_by_wall_timeout,
            })
        }
        ForkResult::Child => {
            drop(stdout_rd);
            drop(stderr_rd);
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
                &scratch_path,
                &stdout_wr,
                &stderr_wr,
                &argv_strings,
                &env_strings,
            ) {
                eprintln!("zerocode child: {e}");
                std::process::exit(127);
            }
            unreachable!("execvpe returns only on error")
        }
    }
}

fn run_child(
    flags: &CloneFlags,
    ready_wr: &OwnedFd,
    start_rd: &OwnedFd,
    scratch_path: &Path,
    stdout_wr: &OwnedFd,
    stderr_wr: &OwnedFd,
    argv_strings: &[CString],
    env_strings: &[CString],
) -> Result<(), SandboxError> {
    // 1. Enter the namespaces. After this we appear as "nobody" inside the
    //    new user namespace until the parent writes our uid_map.
    unshare(*flags).map_err(|e| SandboxError::NamespaceSetup(format!("unshare: {e}")))?;

    // 2. Tell the parent we're in the new userns; wait for ack.
    write(ready_wr, b"1").map_err(|e| SandboxError::Spawn(format!("ready signal: {e}")))?;
    let mut byte = [0u8; 1];
    read(start_rd, &mut byte).map_err(|e| SandboxError::Spawn(format!("start ack: {e}")))?;

    // 3. Make the mount namespace private so subsequent tmpfs mounts don't
    //    propagate back to the host.
    mounts::make_namespace_private()?;

    // 4. Mount the per-submission tmpfs on /tmp inside the new mount ns.
    mounts::mount_tmp_tmpfs()?;

    // 5. Bring up loopback so 127.0.0.1 is reachable inside the NET ns.
    if let Err(e) = mounts::bring_loopback_up() {
        // Non-fatal — most language programs work fine without lo. We log
        // (via eprintln since tracing isn't async-signal-safe here) and
        // continue.
        eprintln!("zerocode child lo up failed (continuing): {e}");
    }

    // 6. Chdir into the scratch dir so relative paths (e.g. `main.py`) work.
    std::env::set_current_dir(scratch_path)
        .map_err(|e| SandboxError::MountSetup(format!("chdir scratch: {e}")))?;

    // 7. Redirect stdin from the prepared file. Done before stdout/stderr
    //    redirection so any subsequent errors still show up.
    let stdin_file = std::fs::File::open(scratch_path.join("stdin"))
        .map_err(|e| SandboxError::MountSetup(format!("open stdin: {e}")))?;
    dup2_stdin(&stdin_file).map_err(|e| SandboxError::Spawn(format!("dup2 stdin: {e}")))?;

    // 8. Redirect stdout/stderr to the parent's pipe ends.
    dup2_stdout(stdout_wr).map_err(|e| SandboxError::Spawn(format!("dup2 stdout: {e}")))?;
    dup2_stderr(stderr_wr).map_err(|e| SandboxError::Spawn(format!("dup2 stderr: {e}")))?;

    // 9. Drop every capability across all 5 capsets.
    drop_all_capabilities()?;

    // 10. Lock NO_NEW_PRIVS so even if the child re-enters a setuid binary
    //     it can't regain capabilities.
    nix::sys::prctl::set_no_new_privs()
        .map_err(|e| SandboxError::Spawn(format!("PR_SET_NO_NEW_PRIVS: {e}")))?;

    // 11. Apply landlock filesystem policy. After this point file accesses
    //     outside the allowed paths fail with EACCES.
    landlock_policy::apply(scratch_path)?;

    // 12. Install the seccomp BPF filter. Must come AFTER NO_NEW_PRIVS or
    //     the kernel will refuse to load the filter for an unprivileged task.
    seccomp::apply_default()?;

    // 13. Hand off control. The argv slice owns the CStrings; we collect
    //     references into Vec<&CString> for execvpe.
    let prog = argv_strings
        .first()
        .ok_or_else(|| SandboxError::Spawn("empty run_cmd".into()))?
        .clone();
    let argv: Vec<&CString> = argv_strings.iter().collect();
    let envp: Vec<&CString> = env_strings.iter().collect();
    execvpe(&prog, &argv, &envp)
        .map_err(|e| SandboxError::Spawn(format!("execvpe {prog:?}: {e}")))?;
    Ok(())
}

fn drop_all_capabilities() -> Result<(), SandboxError> {
    use caps::{CapSet, clear};
    clear(None, CapSet::Effective).map_err(|e| SandboxError::Spawn(format!("drop eff: {e}")))?;
    clear(None, CapSet::Permitted).map_err(|e| SandboxError::Spawn(format!("drop perm: {e}")))?;
    clear(None, CapSet::Inheritable).map_err(|e| SandboxError::Spawn(format!("drop inh: {e}")))?;
    clear(None, CapSet::Bounding).map_err(|e| SandboxError::Spawn(format!("drop bnd: {e}")))?;
    clear(None, CapSet::Ambient).map_err(|e| SandboxError::Spawn(format!("drop amb: {e}")))?;
    Ok(())
}

fn build_argv(spec: &LanguageSpec) -> Vec<CString> {
    spec.run_cmd
        .iter()
        .filter_map(|s| CString::new(s.as_bytes()).ok())
        .collect()
}

fn build_env(spec: &LanguageSpec) -> Vec<CString> {
    let mut env = vec![
        cstring("LANG=C.UTF-8"),
        cstring("LC_ALL=C.UTF-8"),
        cstring("HOME=/tmp"),
        cstring("PATH=/usr/local/bin:/usr/bin:/bin"),
    ];
    for (k, v) in &spec.env {
        if let Ok(s) = CString::new(format!("{k}={v}").into_bytes()) {
            env.push(s);
        }
    }
    env
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
        };
        let argv = build_argv(&spec);
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
        };
        let env = build_env(&spec);
        let any = |needle: &str| env.iter().any(|c| c.to_bytes() == needle.as_bytes());
        assert!(any("LANG=C.UTF-8"));
        assert!(any("PYTHONUNBUFFERED=1"));
    }
}
