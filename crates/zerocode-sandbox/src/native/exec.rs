//! Forks a child into fresh Linux namespaces, drops capabilities, attaches it
//! to a cgroup, and exec's the language binary. Stdout/stderr come back via
//! pipes the parent reads with a per-fd size cap.
//!
//! Phase 1.5 scope: PID/NET/IPC/UTS/MNT/USER namespaces + cap-drop +
//! `PR_SET_NO_NEW_PRIVS`. **No seccomp, no landlock, no `pivot_root` yet** —
//! those land in Phase 2. The child runs inside the worker's filesystem view
//! but with all the other isolation primitives.

use std::ffi::CString;
use std::io::Read;
use std::os::fd::OwnedFd;
use std::path::Path;

use bytes::Bytes;
use nix::sched::{CloneFlags, unshare};
use nix::sys::wait::{WaitStatus, waitpid};
use nix::unistd::{
    ForkResult, Pid, dup2_stderr, dup2_stdin, dup2_stdout, execvpe, fork, pipe, write,
};
use zerocode_core::LanguageSpec;

use crate::SandboxError;

use super::cgroup::Cgroup;
use super::scratch::Scratch;

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

/// Spawn the child and run it under cgroup limits + namespaces + cap-drop +
/// wall-clock timeout. Caller is responsible for cgroup creation/cleanup and
/// scratch dir lifecycle.
pub fn run(
    spec: &LanguageSpec,
    scratch: &Scratch,
    cgroup: &Cgroup,
    wall_time: std::time::Duration,
    max_stdout: usize,
    max_stderr: usize,
) -> Result<RawOutcome, SandboxError> {
    // Pipes for stdout, stderr, and a separate "child-ready" sync pipe so the
    // parent knows the child has unshared into its new namespaces before it
    // tries to interact with the cgroup or set up its own IDs.
    let (stdout_rd, stdout_wr) = pipe().map_err(|e| SandboxError::Spawn(format!("pipe stdout: {e}")))?;
    let (stderr_rd, stderr_wr) = pipe().map_err(|e| SandboxError::Spawn(format!("pipe stderr: {e}")))?;
    let (sync_rd, sync_wr) = pipe().map_err(|e| SandboxError::Spawn(format!("pipe sync: {e}")))?;

    let stdin_path = scratch.stdin_path();
    let source_dir = scratch.path.clone();

    // Pre-build env vars in the parent so we don't allocate after fork.
    let env_strings = build_env(spec);
    let argv_strings = build_argv(spec);

    // SAFETY: fork is unsafe in any Rust runtime; the child is restricted to
    // async-signal-safe operations until execve, which is what the post-fork
    // block does.
    match unsafe { fork() }.map_err(|e| SandboxError::Spawn(format!("fork: {e}")))? {
        ForkResult::Parent { child } => {
            drop(stdout_wr);
            drop(stderr_wr);
            drop(sync_rd);

            // Attach the child to the cgroup before it execs into the user
            // program. The child blocks on sync_rd until we're done.
            cgroup.attach(child.as_raw())?;
            // Tell the child "you're in the cgroup, proceed".
            let _ = write(&sync_wr, b"1");
            drop(sync_wr);

            // Read stdout/stderr concurrently, capped.
            let stdout = std::thread::spawn(move || read_capped(stdout_rd, max_stdout));
            let stderr = std::thread::spawn(move || read_capped(stderr_rd, max_stderr));

            // Wall-clock timeout: in the parent we sleep up to `wall_time`,
            // and if the child hasn't exited we ask the cgroup to kill it.
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
            // Everything from here is async-signal-safe until execve. Any
            // failure is signalled to the parent by writing a non-zero exit
            // code; we MUST NOT panic or allocate via the global allocator
            // (in practice the small allocations below are unavoidable, but
            // we keep them simple and accept the risk).
            drop(stdout_rd);
            drop(stderr_rd);
            drop(sync_wr);

            if let Err(e) = setup_child(&NAMESPACE_FLAGS, &stdin_path, &source_dir) {
                eprintln!("zerocode child setup failed: {e}");
                std::process::exit(127);
            }

            // Wait for parent to attach us to the cgroup. A read of length 0
            // means EOF (parent closed), which is also fine.
            let mut buf = [0u8; 1];
            let _ = nix::unistd::read(&sync_rd, &mut buf);
            drop(sync_rd);

            // Redirect stdout/stderr to the pipes.
            if let Err(e) = dup2_stdout(&stdout_wr) {
                eprintln!("zerocode child dup2 stdout: {e}");
                std::process::exit(127);
            }
            if let Err(e) = dup2_stderr(&stderr_wr) {
                eprintln!("zerocode child dup2 stderr: {e}");
                std::process::exit(127);
            }
            drop(stdout_wr);
            drop(stderr_wr);

            // Drop *every* capability and lock no_new_privs so even setuid
            // binaries we exec into can't regain them.
            if let Err(e) = drop_all_capabilities() {
                eprintln!("zerocode child drop_caps: {e}");
                std::process::exit(127);
            }
            if let Err(e) = nix::sys::prctl::set_no_new_privs() {
                eprintln!("zerocode child no_new_privs: {e}");
                std::process::exit(127);
            }

            // Final hand-off: execve into the language run command.
            let prog = match argv_strings.first() {
                Some(p) => p.clone(),
                None => {
                    eprintln!("zerocode child empty run_cmd");
                    std::process::exit(127);
                }
            };
            let argv: Vec<&CString> = argv_strings.iter().collect();
            let envp: Vec<&CString> = env_strings.iter().collect();

            // execvpe goes through PATH, but we keep it explicit so language
            // specs that name absolute paths (typical) just work.
            match execvpe(&prog, &argv, &envp) {
                Ok(_) => unreachable!(),
                Err(e) => {
                    eprintln!("zerocode child execvpe {prog:?}: {e}");
                    std::process::exit(127);
                }
            }
        }
    }
}

fn setup_child(
    flags: &CloneFlags,
    _stdin_path: &Path,
    source_dir: &Path,
) -> Result<(), SandboxError> {
    // Establish fresh namespaces. User namespace gives us a context where we
    // can pretend to be UID 0 for setup steps without actually being root on
    // the host.
    unshare(*flags).map_err(|e| SandboxError::NamespaceSetup(format!("unshare: {e}")))?;

    // Chdir into the scratch dir so relative paths (e.g. `main.py`) Just Work.
    std::env::set_current_dir(source_dir)
        .map_err(|e| SandboxError::MountSetup(format!("chdir scratch: {e}")))?;

    // Redirect stdin from the file the parent prepared. We replace stdin
    // *after* dup2'ing stdout/stderr so any errors above still report.
    let stdin_file = std::fs::File::open(source_dir.join("stdin"))
        .map_err(|e| SandboxError::MountSetup(format!("open stdin: {e}")))?;
    dup2_stdin(&stdin_file).map_err(|e| SandboxError::Spawn(format!("dup2 stdin: {e}")))?;

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
                    // Drain remainder so the writer doesn't get SIGPIPE on the
                    // next write — we still want the child to exit cleanly.
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
                    // Wall-clock budget exceeded. cgroup.kill atomically
                    // SIGKILLs every process in the cgroup.
                    let _ = cgroup.kill();
                    // Block-wait now that we've asked for the kill.
                    let final_status = waitpid(pid, None)
                        .map_err(|e| SandboxError::Wait(format!("post-kill wait: {e}")))?;
                    return Ok((final_status, true));
                }
                // Poll cadence: 10ms keeps overhead low while still being
                // responsive enough for the smallest budgets we support
                // (0.1s minimum from limits.rs).
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
