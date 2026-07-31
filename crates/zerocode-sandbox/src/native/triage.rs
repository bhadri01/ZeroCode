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
    // Bill the two phases separately. `cgroup.cpu_time()` is the whole job;
    // `raw.compile_cpu_time` is what the compiler had burned at the compile→run
    // barrier, so the difference is the user's program.
    //
    // Two things depend on this being split. First, the reported `time` is now
    // the run phase alone, which is what other judges report and what a caller
    // comparing engines is actually measuring — a 1.5 s C++ header parse used to
    // land in the user's execution figure. Second, the CPU-limit check below
    // compares the *run* against the limit: previously a slow compile ate the
    // submission's CPU budget and could push an otherwise fine program over it.
    // (`finish` reads the compile wall-clock straight off `raw`.)
    let total_cpu = cgroup.cpu_time();
    let cpu_time = match raw.compile_cpu_time {
        Some(compile_cpu) => total_cpu.saturating_sub(compile_cpu),
        None => total_cpu,
    };
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

    // 3. Compile-failed sentinel beats everything else exit-related. The
    //    outer child raised it after waiting on a non-zero compile sub-child.
    //    stderr at this point IS the compiler's diagnostic output; we route
    //    it into `compile_output` and leave stdout/stderr empty since the
    //    run phase never happened.
    //
    //    THIS MUST STAY ABOVE THE CPU-BUDGET CHECK. The compile phase never
    //    reaches the compile→run barrier when it fails, so there is no sampled
    //    split and `cpu_time` here is the *compiler's* CPU. Checking the CPU
    //    budget first therefore reported a plain compile error as
    //    `time_limit_exceeded{cpu}` whenever the compiler out-burned the
    //    submission's CPU limit — and `finish` filled `exit_code` from the raw
    //    status, leaking the internal 253 sentinel to the client. Reproduced on
    //    Java (`cpu_time_limit: 0.2`, a one-line syntax error): status
    //    `time_limit_exceeded/cpu`, `exit_code: 253`, with the real javac
    //    diagnostic sitting in `compile_output`. A program that failed to
    //    compile did not exceed a *run* budget; it has no run phase at all.
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
        // A failed compile never reaches the compile→run barrier, so there is no
        // sampled split to subtract — the whole job WAS the compile. Bill it that
        // way rather than reporting the compiler's CPU as the program's `time`
        // for a program that never ran.
        out.compile_time = wall_elapsed;
        out.cpu_time = std::time::Duration::ZERO;
        return Ok(out);
    }

    // 4. CPU budget elapsed (parent didn't wall-kill, but the child consumed
    // more CPU than the limit allowed). We compare against `cpu_limit` rather
    // than `wall_elapsed` because a CPU-bound child may exit with a clean
    // status after the kernel throttled it. `cpu_time` is the run phase alone
    // for compiled languages, so the user's budget is charged for the user's
    // program — a slow compile no longer pushes a fine program over the line.
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
    // Wall-clock of the compile phase, zero when there wasn't one (interpreted
    // language, or a compile-cache hit that skipped straight to the run).
    let compile_time = raw.compile_wall_time.unwrap_or_default();
    SandboxResult {
        status,
        compile_time,
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
            compile_cpu_time: None,
            compile_wall_time: None,
        }
    }

    /// A `RawOutcome` that went through a compile->run barrier, so triage has a
    /// compile/run split to apply.
    fn raw_compiled(
        status: WaitStatus,
        compile_cpu: std::time::Duration,
        compile_wall: std::time::Duration,
    ) -> RawOutcome {
        RawOutcome {
            compile_cpu_time: Some(compile_cpu),
            compile_wall_time: Some(compile_wall),
            ..raw(status, false)
        }
    }

    // We can exercise the decision branches without a real cgroup by hand-
    // assembling the `RawOutcome`. cgroup-readers return 0 when the dir
    // doesn't exist, which is fine for the branches that don't depend on
    // memory.peak or cpu.stat.

    // NB: classify() reads from `cgroup` via fs::read_to_string; we provide
    // a dummy Cgroup path that doesn't exist, which makes all reads return 0
    // / false. This is sufficient for the branch coverage we care about here.

    /// A throwaway directory shaped like a cgroup, with a `cpu.stat` reporting
    /// `usec` of CPU. `classify` reads these files straight off disk, so this is
    /// enough to drive the CPU-budget branch without a real cgroup.
    fn cgroup_reporting_cpu_usec(usec: u64) -> Cgroup {
        let dir =
            std::env::temp_dir().join(format!("zerocode_triage_cg_{usec}_{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create fake cgroup dir");
        std::fs::write(dir.join("cpu.stat"), format!("usage_usec {usec}\n"))
            .expect("write cpu.stat");
        Cgroup { path: dir }
    }

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

    /// Regression: a compile error whose compiler out-burned the submission's
    /// CPU budget used to be classified `time_limit_exceeded{cpu}` with the
    /// internal 253 sentinel leaked as `exit_code`, because the CPU-budget
    /// branch was evaluated before the compile sentinel. Reproduced live on
    /// Java with `cpu_time_limit: 0.2`.
    #[test]
    fn compile_error_outranks_the_cpu_budget_check() {
        let r = RawOutcome {
            exit_status: exited(COMPILE_FAILED_EXIT_CODE),
            stdout: Bytes::new(),
            stderr: Bytes::new(),
            compile_stderr: Bytes::from_static(b"Main.java:1: error: illegal start of expression"),
            compiled_binary: Bytes::new(),
            killed_by_wall_timeout: false,
            run_phase_memory_kb: None,
            // No barrier fired, so triage sees the compiler's CPU as the total.
            compile_cpu_time: None,
            compile_wall_time: None,
        };
        // A cgroup that reports MORE CPU than the limit allows, which is what
        // the real Java repro produced (0.32 s against a 0.2 s budget).
        let cg = cgroup_reporting_cpu_usec(320_000);
        let out = classify(
            r,
            &cg,
            std::time::Duration::from_millis(200),
            std::time::Duration::from_millis(340),
            Utc::now(),
        )
        .unwrap();
        assert!(
            matches!(out.status, Status::CompileError),
            "a program that never ran cannot exceed a RUN budget; got {:?}",
            out.status,
        );
        assert_eq!(
            out.exit_code, None,
            "the internal {COMPILE_FAILED_EXIT_CODE} sentinel must never reach the client",
        );
        assert_eq!(
            out.compile_output.as_deref().unwrap(),
            b"Main.java:1: error: illegal start of expression",
        );
    }

    /// A genuine run-phase CPU overrun must still be caught.
    #[test]
    fn run_phase_cpu_overrun_is_still_time_limit_exceeded() {
        let cg = cgroup_reporting_cpu_usec(3_000_000);
        let out = classify(
            raw(exited(0), false),
            &cg,
            std::time::Duration::from_secs(2),
            std::time::Duration::from_secs(3),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(
            out.status,
            Status::TimeLimitExceeded(TimeLimitKind::Cpu)
        ));
    }

    // ── compile / run time split ───────────────────────────────────────
    //
    // `time` must describe the submitted program, not our toolchain. These
    // pin the arithmetic; the end-to-end behaviour is covered by
    // `tests/edge_cases/c_cpp.rs`.

    #[test]
    fn compile_cpu_is_subtracted_from_reported_cpu_time() {
        // The dummy cgroup reads back 0 CPU, so total_cpu is 0 and any
        // compile_cpu must saturate rather than wrap into a huge duration.
        let r = raw_compiled(
            exited(0),
            std::time::Duration::from_millis(800),
            std::time::Duration::from_millis(870),
        );
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(10),
            std::time::Duration::from_millis(900),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(out.status, Status::Accepted));
        assert_eq!(
            out.cpu_time,
            std::time::Duration::ZERO,
            "compile CPU exceeding the total must saturate, never wrap"
        );
        assert_eq!(out.compile_time, std::time::Duration::from_millis(870));
    }

    #[test]
    fn no_compile_phase_reports_zero_compile_time() {
        // Interpreted languages and compile-cache hits never reach the barrier,
        // so the whole-job CPU is already run-only and compile_time is zero.
        let out = classify(
            raw(exited(0), false),
            &dummy_cg(),
            std::time::Duration::from_secs(2),
            std::time::Duration::from_millis(40),
            Utc::now(),
        )
        .unwrap();
        assert_eq!(out.compile_time, std::time::Duration::ZERO);
    }

    #[test]
    fn compile_error_bills_everything_to_compile_time() {
        // A failed compile never reaches the barrier, so there is no sampled
        // split. Reporting the compiler's CPU as the program's `time` would be
        // wrong for a program that never ran.
        let r = RawOutcome {
            exit_status: exited(COMPILE_FAILED_EXIT_CODE),
            stdout: Bytes::new(),
            stderr: Bytes::new(),
            compile_stderr: Bytes::from_static(b"error: expected ';'"),
            compiled_binary: Bytes::new(),
            killed_by_wall_timeout: false,
            run_phase_memory_kb: None,
            compile_cpu_time: None,
            compile_wall_time: None,
        };
        let out = classify(
            r,
            &dummy_cg(),
            std::time::Duration::from_secs(10),
            std::time::Duration::from_millis(640),
            Utc::now(),
        )
        .unwrap();
        assert!(matches!(out.status, Status::CompileError));
        assert_eq!(out.cpu_time, std::time::Duration::ZERO);
        assert_eq!(out.compile_time, std::time::Duration::from_millis(640));
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
            compile_cpu_time: None,
            compile_wall_time: None,
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
