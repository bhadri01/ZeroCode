//! The linux-only entrypoint. Orchestrates cgroup creation, scratch dir
//! population, child fork+exec, outcome triage, and cleanup.

use chrono::Utc;

use crate::{SandboxError, SandboxJob, SandboxResult};

use super::NativeSandboxConfig;
use super::cgroup::Cgroup;
use super::exec;
use super::scratch::Scratch;
use super::triage;

pub fn execute(
    config: &NativeSandboxConfig,
    job: SandboxJob,
) -> Result<SandboxResult, SandboxError> {
    let cgroup = Cgroup::create(&config.cgroup_parent, &job.token.to_string(), &job.limits)?;
    let scratch = Scratch::create(&config.scratch_dir, &job)?;
    let has_cached_binary = scratch.has_cached_binary();

    let cpu_time = std::time::Duration::from_secs_f64(job.limits.cpu_time);
    let started_at = Utc::now();
    let started_inst = std::time::Instant::now();

    let raw = match exec::run(
        config,
        &job.language,
        &scratch,
        &cgroup,
        &job.limits,
        has_cached_binary,
    ) {
        Ok(r) => r,
        Err(e) => {
            cgroup.destroy();
            scratch.destroy();
            return Err(e);
        }
    };

    let wall_elapsed = started_inst.elapsed();
    let compiled_binary = if !has_cached_binary && job.language.compile_cmd.is_some() {
        scratch.read_artifact().map(bytes::Bytes::from)
    } else {
        None
    };

    let mut result = triage::classify(raw, &cgroup, cpu_time, wall_elapsed, started_at)?;
    result.compiled_binary = compiled_binary;

    cgroup.destroy();
    scratch.destroy();
    Ok(result)
}
