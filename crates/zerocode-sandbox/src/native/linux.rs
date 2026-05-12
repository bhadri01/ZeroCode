//! The linux-only entrypoint. Orchestrates cgroup creation, scratch dir
//! population, child fork+exec, outcome triage, and cleanup.

use chrono::Utc;

use crate::{SandboxError, SandboxJob, SandboxResult};

use super::cgroup::Cgroup;
use super::exec;
use super::scratch::Scratch;
use super::triage;
use super::NativeSandboxConfig;

pub fn execute(
    config: &NativeSandboxConfig,
    job: SandboxJob,
) -> Result<SandboxResult, SandboxError> {
    let cgroup = Cgroup::create(&config.cgroup_parent, &job.token.to_string(), &job.limits)?;
    let scratch = Scratch::create(&config.scratch_dir, &job)?;

    let wall_time = std::time::Duration::from_secs_f64(job.limits.wall_time);
    let cpu_time = std::time::Duration::from_secs_f64(job.limits.cpu_time);
    let started_at = Utc::now();
    let started_inst = std::time::Instant::now();

    let raw = match exec::run(
        &job.language,
        &scratch,
        &cgroup,
        wall_time,
        job.limits.max_stdout as usize,
        job.limits.max_stderr as usize,
    ) {
        Ok(r) => r,
        Err(e) => {
            // Best-effort cleanup before we surface the error.
            cgroup.destroy();
            scratch.destroy();
            return Err(e);
        }
    };

    let wall_elapsed = started_inst.elapsed();
    let result = triage::classify(raw, &cgroup, cpu_time, wall_elapsed, started_at)?;

    cgroup.destroy();
    scratch.destroy();
    Ok(result)
}
