//! Per-submission cgroup v2 directory. We deliberately treat cgroup v2 as a
//! filesystem (it is) rather than going through `cgroups-rs`'s higher-level
//! abstractions — the writes we need are small, well-defined, and easier to
//! audit when explicit.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use zerocode_core::ResourceLimits;

use crate::SandboxError;

const PERIOD_US: u64 = 100_000; // 100 ms standard

pub struct Cgroup {
    pub path: PathBuf,
}

impl Cgroup {
    /// Create a fresh cgroup under `parent/<id>/` and apply the resource limits.
    pub fn create(parent: &Path, id: &str, limits: &ResourceLimits) -> Result<Self, SandboxError> {
        let path = parent.join(id);
        fs::create_dir(&path)
            .map_err(|e| SandboxError::CgroupSetup(format!("create {}: {e}", path.display())))?;

        // memory.max = limit in bytes; memory.swap.max = 0 to refuse swap.
        write_file(
            &path.join("memory.max"),
            &format!("{}", (limits.memory_mb as u64) * 1024 * 1024),
        )?;
        // swap.max may not exist if the kernel has no swap controller; ignore
        // ENOENT and report any other error.
        if let Err(e) = write_file(&path.join("memory.swap.max"), "0") {
            if !matches!(&e, SandboxError::CgroupSetup(msg) if msg.contains("No such file")) {
                return Err(e);
            }
        }

        // cpu.max = "<quota_us> <period_us>". cpu_time is in seconds; we
        // translate to "this fraction of <period>". For a budget of 2s of CPU
        // per 5s wall-clock we'd usually want a fractional quota, but the
        // simplest sane policy is: 100% of a single CPU within the wall window.
        // Cgroup-level CPU enforcement runs the parent timer separately.
        let quota = PERIOD_US;
        write_file(&path.join("cpu.max"), &format!("{} {}", quota, PERIOD_US))?;

        // pids.max controls fork bombs / thread bombs.
        write_file(&path.join("pids.max"), &format!("{}", limits.max_pids))?;

        Ok(Self { path })
    }

    /// Attach a PID to the cgroup. Called by the parent right after the child
    /// is spawned (the child does NOT touch its own cgroup file — that path
    /// would need writable /sys/fs/cgroup inside the user namespace).
    pub fn attach(&self, pid: i32) -> Result<(), SandboxError> {
        write_file(&self.path.join("cgroup.procs"), &format!("{pid}"))
    }

    /// Atomic kill: write "1" to `cgroup.kill` (kernel ≥5.14). Sends SIGKILL
    /// to every process in the cgroup and prevents new clones from joining.
    pub fn kill(&self) -> Result<(), SandboxError> {
        write_file(&self.path.join("cgroup.kill"), "1")
    }

    pub fn oom_killed(&self) -> bool {
        let txt = match fs::read_to_string(self.path.join("memory.events")) {
            Ok(s) => s,
            Err(_) => return false,
        };
        for line in txt.lines() {
            if let Some(rest) = line.strip_prefix("oom_kill ") {
                let n: u64 = rest.trim().parse().unwrap_or(0);
                return n > 0;
            }
        }
        false
    }

    /// Peak memory usage in bytes. Returns 0 if `memory.peak` doesn't exist
    /// on this kernel (need ≥5.19); callers should fall back to a sample of
    /// `memory.current` if so.
    pub fn memory_peak_bytes(&self) -> u64 {
        fs::read_to_string(self.path.join("memory.peak"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0)
    }

    /// Reclaim the compile phase's lingering footprint at the compile→run
    /// boundary (after the compiler sub-child has exited): force-reclaim the
    /// cgroup's reclaimable memory — chiefly the page cache the compiler
    /// touched, which stays charged to the cgroup after the process exits — so
    /// the subsequent run-phase `memory.current` sampling (see `exec.rs`) reads
    /// the user program's footprint, not the compiler's leftover cache.
    ///
    /// It also best-effort resets `memory.peak`, which helps on kernels that
    /// expose it writable (≥6.8 upstream); on kernels where it is read-only
    /// (e.g. the deployed 6.8.0 Ubuntu build) that write fails harmlessly and
    /// the run-phase figure comes entirely from the current-sampling path.
    pub fn reset_run_baseline(&self) {
        reset_run_baseline_at(&self.path);
    }

    /// Total CPU time the cgroup consumed since creation.
    pub fn cpu_time(&self) -> Duration {
        cpu_time_at(&self.path)
    }

    /// Best-effort cleanup. Logs and continues on error — the worker process
    /// is the only thing that can fix a stuck cgroup, and a leak here is
    /// recoverable (next sweeper run, or restart).
    pub fn destroy(self) {
        // The cgroup must be empty (no procs) before rmdir succeeds. Caller
        // should have killed + reaped all children first.
        if let Err(e) = fs::remove_dir(&self.path) {
            tracing::warn!(
                error = %e,
                path = %self.path.display(),
                "could not remove cgroup; will be cleaned up by next sweeper"
            );
        }
    }
}

/// Free-function form of [`Cgroup::reset_run_baseline`], usable from a thread
/// that only holds the cgroup path (the compile→run barrier in `exec.rs`).
pub fn reset_run_baseline_at(path: &Path) {
    // Reclaim a large amount; the kernel reclaims as much as it can and any
    // -EAGAIN remainder is irrelevant — the compiler's page cache is the target.
    let _ = write_file(&path.join("memory.reclaim"), "1073741824");
    // Writing any value resets the peak to current usage (kernel ≥6.8).
    let _ = write_file(&path.join("memory.peak"), "0");
}

/// Free-function form of [`Cgroup::cpu_time`], usable from a thread that only
/// holds the cgroup path. The compile→run barrier reads it at the phase
/// boundary so triage can bill compile and run CPU separately.
pub fn cpu_time_at(path: &Path) -> Duration {
    let txt = match fs::read_to_string(path.join("cpu.stat")) {
        Ok(s) => s,
        Err(_) => return Duration::ZERO,
    };
    for line in txt.lines() {
        if let Some(rest) = line.strip_prefix("usage_usec ") {
            let us: u64 = rest.trim().parse().unwrap_or(0);
            return Duration::from_micros(us);
        }
    }
    Duration::ZERO
}

/// Lower `pids.max` mid-job, mirroring [`set_memory_max_at`]. Called at the
/// compile→run barrier so the run phase is bounded by its own (smaller) process
/// budget rather than the compiler's. Writing a value below the current count is
/// legal — it simply refuses further forks — so this cannot fail the running job.
pub fn set_pids_max_at(path: &Path, max: u32) {
    let _ = write_file(&path.join("pids.max"), &format!("{max}"));
}

/// Lower (or raise) `memory.max` mid-job. Used at the compile→run barrier to
/// drop the cgroup ceiling from the compile budget to the (smaller) run budget
/// once the compiler has exited — so the admission controller's per-job
/// reservation can be sized to the run, not the heavier cold compiler.
///
/// Writing a value below current usage makes the kernel reclaim to fit (and
/// OOM-kill only if it can't), so callers MUST reclaim first — the barrier runs
/// [`reset_run_baseline_at`] immediately before this, which drops the compiler's
/// now-orphaned page cache, leaving `memory.current` well under any sane run
/// budget. Best-effort: on failure the higher compile ceiling simply persists,
/// which is safe (only less memory-efficient).
pub fn set_memory_max_at(path: &Path, mb: u64) {
    let _ = write_file(&path.join("memory.max"), &format!("{}", mb * 1024 * 1024));
}

fn write_file(path: &Path, value: &str) -> Result<(), SandboxError> {
    let mut f = fs::OpenOptions::new().write(true).open(path).map_err(|e| {
        SandboxError::CgroupSetup(format!("open {} for write: {e}", path.display()))
    })?;
    f.write_all(value.as_bytes())
        .map_err(|e| SandboxError::CgroupSetup(format!("write {}: {e}", path.display())))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_oom_kill_from_events_text() {
        // Simulates parsing memory.events without an actual cgroup.
        let txt = "low 0\nhigh 0\nmax 1\noom 1\noom_kill 1\n";
        let parsed = txt
            .lines()
            .filter_map(|l| l.strip_prefix("oom_kill "))
            .next()
            .and_then(|s| s.trim().parse::<u64>().ok());
        assert_eq!(parsed, Some(1));
    }

    #[test]
    fn read_cpu_usage_from_stat_text() {
        let txt = "usage_usec 12345\nuser_usec 8000\nsystem_usec 4345\n";
        let parsed = txt
            .lines()
            .filter_map(|l| l.strip_prefix("usage_usec "))
            .next()
            .and_then(|s| s.trim().parse::<u64>().ok());
        assert_eq!(parsed, Some(12345));
    }
}
