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
    let scratch = Scratch::create(&config.scratch_dir, &job)?;
    let has_cached_binary = scratch.has_cached_binary();

    // Per-phase memory: when a compile phase will actually run, create the cgroup
    // at the (larger) compile budget so the compiler has headroom; the exec
    // barrier then drops memory.max to job.limits.memory_mb (the run budget) once
    // the compiler exits. With no compile phase (interpreted langs, cache hits)
    // the cgroup is created at the run budget and never shrinks. Only memory_mb
    // differs by phase — pids/cpu stay at job.limits the whole job (a higher
    // pids ceiling reserves nothing). job.limits is Copy.
    let will_compile = job.language.compile_cmd.is_some() && !has_cached_binary;
    let mut cgroup_limits = job.limits;
    if will_compile {
        if let Some(cl) = job.language.compile_limits.as_ref() {
            cgroup_limits.memory_mb = cl.memory_mb.max(job.limits.memory_mb);
        }
    }
    let cgroup = match Cgroup::create(&config.cgroup_parent, &job.token.to_string(), &cgroup_limits)
    {
        Ok(c) => c,
        Err(e) => {
            scratch.destroy();
            return Err(e);
        }
    };

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
    // The compiled binary arrived over the CLOEXEC artifact pipe (captured
    // before user code ran). Empty for interpreted languages, compile failures,
    // and cache hits.
    let compiled_binary = if !has_cached_binary
        && job.language.compile_cmd.is_some()
        && !raw.compiled_binary.is_empty()
    {
        Some(raw.compiled_binary.clone())
    } else {
        None
    };

    // Run-phase memory sampled across the compile→run barrier (compiled langs);
    // overrides the whole-job memory.peak triage would otherwise report, so the
    // compiler's transient RSS is excluded. None for interpreted/cache hits.
    let run_phase_memory_kb = raw.run_phase_memory_kb;

    let mut result = triage::classify(raw, &cgroup, cpu_time, wall_elapsed, started_at)?;
    result.compiled_binary = compiled_binary;
    if let Some(kb) = run_phase_memory_kb {
        result.memory_kb = kb;
    }

    cgroup.destroy();
    scratch.destroy();
    Ok(result)
}
