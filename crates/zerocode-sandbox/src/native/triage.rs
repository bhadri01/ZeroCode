//! Decision tree from `docs/EDGE_CASES.md` §"Detection / triage flow":
//! given a finished sandbox, choose the highest-confidence `Status`.

use bytes::Bytes;
use chrono::Utc;
use nix::sys::wait::WaitStatus;
use zerocode_core::status::TimeLimitKind;
use zerocode_core::{Signal, Status};

use crate::{SandboxError, SandboxResult};

use super::cgroup::Cgroup;
use super::exec::{COMPILE_FAILED_EXIT_CODE, RawOutcome};

pub fn classify(
    raw: RawOutcome,
    cgroup: &Cgroup,
    cpu_limit: std::time::Duration,
    wall_elapsed: std::time::Duration,
    started_at: chrono::DateTime<Utc>,
) -> Result<SandboxResult, SandboxError> {
    let cpu_time = cgroup.cpu_time();
    let memory_kb = (cgroup.memory_peak_bytes() / 1024) as u32;
    let oom = cgroup.oom_killed();

    // 1. Cgroup OOM event wins regardless of how the child terminated.
    if oom {
        return Ok(finish(
            raw,
            cpu_time,
            wall_elapsed,
            memory_kb,
            started_at,
            Status::MemoryLimitExceeded,
            None,
        ));
    }

    // 2. Wall-clock kill is the next-most-confident terminal.
    if raw.killed_by_wall_timeout {
        return Ok(finish(
            raw,
            cpu_time,
            wall_elapsed,
            memory_kb,
            started_at,
            Status::TimeLimitExceeded(TimeLimitKind::Wall),
            Some(Signal::Sigkill),
        ));
    }

    // 3. CPU budget elapsed (parent didn't wall-kill, but the child consumed
    // more CPU than the limit allowed). We compare against `cpu_limit` rather
    // than `wall_elapsed` because a CPU-bound child may exit with a clean
    // status after the kernel throttled it.
    if cpu_time > cpu_limit {
        let (status, signal) = match &raw.exit_status {
            WaitStatus::Signaled(_, sig, _) => (
                Status::TimeLimitExceeded(TimeLimitKind::Cpu),
                Some(Signal::from_raw(*sig as i32)),
            ),
            _ => (Status::TimeLimitExceeded(TimeLimitKind::Cpu), None),
        };
        return Ok(finish(
            raw,
            cpu_time,
            wall_elapsed,
            memory_kb,
            started_at,
            status,
            signal,
        ));
    }

    // 4. Compile-failed sentinel beats everything else exit-related. The
    //    outer child raised it after waiting on a non-zero compile sub-child.
    //    stderr at this point IS the compiler's diagnostic output; we route
    //    it into `compile_output` and leave stdout/stderr empty since the
    //    run phase never happened.
    if matches!(raw.exit_status, WaitStatus::Exited(_, code) if code == COMPILE_FAILED_EXIT_CODE) {
        let mut out = finish(
            raw,
            cpu_time,
            wall_elapsed,
            memory_kb,
            started_at,
            Status::CompileError,
            None,
        );
        out.stdout = Bytes::new();
        out.stderr = Bytes::new();
        out.exit_code = None; // not a meaningful exit code for the user
        return Ok(out);
    }

    // 5-7. Signal exit / non-zero exit / Accepted.
    let (status, signal, exit_code) = match &raw.exit_status {
        WaitStatus::Exited(_, code) => {
            if *code == 0 {
                (Status::Accepted, None, Some(*code))
            } else {
                (Status::NonZeroExit(*code), None, Some(*code))
            }
        }
        WaitStatus::Signaled(_, sig, _) => (
            Status::RuntimeError(Signal::from_raw(*sig as i32)),
            Some(Signal::from_raw(*sig as i32)),
            None,
        ),
        // Anything else (Stopped, Continued, StillAlive) shouldn't reach this
        // point, but if it does, we treat it as internal.
        _ => (Status::InternalError, None, None),
    };

    let mut out = finish(
        raw,
        cpu_time,
        wall_elapsed,
        memory_kb,
        started_at,
        status,
        signal,
    );
    out.exit_code = exit_code;
    Ok(out)
}

fn finish(
    raw: RawOutcome,
    cpu_time: std::time::Duration,
    wall_time: std::time::Duration,
    memory_kb: u32,
    started_at: chrono::DateTime<Utc>,
    status: Status,
    signal: Option<Signal>,
) -> SandboxResult {
    let compile_output = if raw.compile_stderr.is_empty() {
        None
    } else {
        Some(raw.compile_stderr)
    };
    SandboxResult {
        status,
        stdout: raw.stdout,
        stderr: raw.stderr,
        compile_output,
        exit_code: match &raw.exit_status {
            WaitStatus::Exited(_, code) => Some(*code),
            _ => None,
        },
        signal,
        cpu_time,
        wall_time,
        memory_kb,
        started_at,
        finished_at: Utc::now(),
        compiled_binary: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;

    fn exited(code: i32) -> WaitStatus {
        WaitStatus::Exited(nix::unistd::Pid::from_raw(1), code)
    }

    fn signaled(sig: nix::sys::signal::Signal) -> WaitStatus {
        WaitStatus::Signaled(nix::unistd::Pid::from_raw(1), sig, false)
    }

    fn raw(status: WaitStatus, wall: bool) -> RawOutcome {
        RawOutcome {
            exit_status: status,
            stdout: Bytes::new(),
            stderr: Bytes::new(),
            compile_stderr: Bytes::new(),
            compiled_binary: Bytes::new(),
            killed_by_wall_timeout: wall,
            run_phase_memory_kb: None,
        }
    }

    // We can exercise the decision branches without a real cgroup by hand-
    // assembling the `RawOutcome`. cgroup-readers return 0 when the dir
    // doesn't exist, which is fine for the branches that don't depend on
    // memory.peak or cpu.stat.

    // NB: classify() reads from `cgroup` via fs::read_to_string; we provide
    // a dummy Cgroup path that doesn't exist, which makes all reads return 0
    // / false. This is sufficient for the branch coverage we care about here.

    fn dummy_cg() -> Cgroup {
        Cgroup {
            path: std::path::PathBuf::from("/tmp/zerocode_does_not_exist_cgroup"),
        }
    }

    #[test]
    fn wall_timeout_overrides_clean_exit() {
        let r = raw(exited(0), true);
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(2),
            std::time::Duration::from_secs(5),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(
            out.status,
            Status::TimeLimitExceeded(TimeLimitKind::Wall)
        ));
        assert_eq!(out.signal, Some(Signal::Sigkill));
    }

    #[test]
    fn clean_exit_zero_is_accepted() {
        let r = raw(exited(0), false);
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(2),
            std::time::Duration::from_millis(50),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(out.status, Status::Accepted));
    }

    #[test]
    fn non_zero_exit_classified() {
        let r = raw(exited(42), false);
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(2),
            std::time::Duration::from_millis(50),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(out.status, Status::NonZeroExit(42)));
        assert_eq!(out.exit_code, Some(42));
    }

    #[test]
    fn sigsegv_classified_as_runtime_error() {
        let r = raw(signaled(nix::sys::signal::Signal::SIGSEGV), false);
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(2),
            std::time::Duration::from_millis(50),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(out.status, Status::RuntimeError(Signal::Sigsegv)));
        assert_eq!(out.signal, Some(Signal::Sigsegv));
    }

    #[test]
    fn sentinel_253_routes_stderr_to_compile_output() {
        // Simulate what the outer child does on compile failure: it captures
        // the compiler's stderr (via the shared stderr pipe) and exits with
        // COMPILE_FAILED_EXIT_CODE.
        let r = RawOutcome {
            exit_status: exited(COMPILE_FAILED_EXIT_CODE),
            stdout: Bytes::from_static(b"compiler-stdout-noise"),
            stderr: Bytes::new(),
            compile_stderr: Bytes::from_static(b"error[E0308]: mismatched types"),
            compiled_binary: Bytes::new(),
            killed_by_wall_timeout: false,
            run_phase_memory_kb: None,
        };
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(15),
            std::time::Duration::from_millis(80),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(out.status, Status::CompileError));
        // stderr is routed to compile_output, not kept as stderr.
        assert_eq!(
            out.compile_output.as_deref().unwrap(),
            b"error[E0308]: mismatched types"
        );
        assert!(out.stderr.is_empty());
        assert!(out.stdout.is_empty());
        // exit_code is meaningless when it's the sentinel — we hide it.
        assert!(out.exit_code.is_none());
    }
}
