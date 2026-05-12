//! Worker-level process tree hygiene.
//!
//! - On boot we set `PR_SET_CHILD_SUBREAPER` so orphaned grandchildren reparent
//!   to the worker instead of PID 1. Without this, a sandboxed child that
//!   spawned grandchildren and then exited would leak descendants into the
//!   container init.
//! - A background task drains `waitpid(-1, WNOHANG)` periodically to clean up
//!   any zombies. The fork+exec path in `zerocode-sandbox` reaps its own
//!   direct child, so anything this catches is a grandchild that the
//!   sandboxed program forked but didn't wait on.

use std::sync::Arc;

use tokio::sync::Notify;

#[cfg(target_os = "linux")]
pub fn install_subreaper() -> anyhow::Result<()> {
    // PR_SET_CHILD_SUBREAPER = 36. nix exposes this as a Prctl variant.
    nix::sys::prctl::set_child_subreaper(true)
        .map_err(|e| anyhow::anyhow!("PR_SET_CHILD_SUBREAPER: {e}"))?;
    tracing::info!("PR_SET_CHILD_SUBREAPER installed; orphans will reparent to this worker");
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn install_subreaper() -> anyhow::Result<()> {
    Ok(())
}

/// Lower the worker's OOM score so the kernel preferentially kills sandbox
/// children (which have the default score) rather than the worker itself.
#[cfg(target_os = "linux")]
pub fn set_oom_score_adj() {
    match std::fs::write("/proc/self/oom_score_adj", "-500") {
        Ok(()) => tracing::info!("set oom_score_adj=-500"),
        Err(e) => tracing::warn!(error = %e, "could not set oom_score_adj (needs CAP_SYS_RESOURCE or root)"),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn set_oom_score_adj() {}

#[cfg(target_os = "linux")]
pub async fn run(shutdown: Arc<Notify>) {
    use std::time::Duration;

    use nix::sys::wait::{WaitPidFlag, WaitStatus, waitpid};
    use nix::unistd::Pid;

    let mut tick = tokio::time::interval(Duration::from_secs(2));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = tick.tick() => {
                // Drain everything that's reapable right now.
                loop {
                    match waitpid(Pid::from_raw(-1), Some(WaitPidFlag::WNOHANG)) {
                        Ok(WaitStatus::StillAlive) => break,
                        Ok(WaitStatus::Exited(pid, code)) => {
                            tracing::debug!(%pid, exit_code = code, "reaped orphan");
                        }
                        Ok(WaitStatus::Signaled(pid, sig, _)) => {
                            tracing::debug!(%pid, ?sig, "reaped signaled orphan");
                        }
                        Ok(_) => continue,
                        // ECHILD = no children right now, which is the steady state.
                        Err(nix::Error::ECHILD) => break,
                        Err(e) => {
                            tracing::warn!(error = %e, "waitpid drain failed");
                            break;
                        }
                    }
                }
            }
            _ = shutdown.notified() => {
                tracing::info!("reaper shutdown");
                break;
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub async fn run(shutdown: Arc<Notify>) {
    shutdown.notified().await;
}
