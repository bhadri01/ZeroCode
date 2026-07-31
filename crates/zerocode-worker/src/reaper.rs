//! Worker-level process tree hygiene.
//!
//! - On boot we set `PR_SET_CHILD_SUBREAPER` so orphaned grandchildren reparent
//!   to the worker instead of PID 1. Without this, a sandboxed child that
//!   spawned grandchildren and then exited would leak descendants into the
//!   container init.
//! - A background task drains reapable zombies periodically. The fork+exec path
//!   in `zerocode-sandbox` reaps its own direct child, so anything this catches
//!   is a grandchild that the sandboxed program forked but didn't wait on.
//!
//! That drain used to call `waitpid(-1, WNOHANG)` directly, which is
//! indiscriminate: when a tick landed in the window between a sandbox child
//! exiting and `exec::wait_with_timeout`'s next poll, the reaper consumed that
//! child's exit status and the sandbox saw `ECHILD`. The submission was then
//! written back as `sandbox_failure` with empty stdout — a correct program
//! silently marked wrong, at a rate that rose with concurrency. The drain now
//! *peeks* with `WNOWAIT` and skips PIDs the sandbox has claimed in
//! [`zerocode_sandbox::owned_children`], reaping only genuine orphans.

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
        Err(e) => {
            tracing::warn!(error = %e, "could not set oom_score_adj (needs CAP_SYS_RESOURCE or root)")
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn set_oom_score_adj() {}

#[cfg(target_os = "linux")]
pub async fn run(shutdown: Arc<Notify>) {
    use std::time::Duration;

    let mut tick = tokio::time::interval(Duration::from_secs(2));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = tick.tick() => { drain_orphans(); }
            _ = shutdown.notified() => {
                tracing::info!("reaper shutdown");
                break;
            }
        }
    }
}

/// Reap every zombie that is currently reapable and *not* owned by an in-flight
/// sandbox. Split out from [`run`] so the ownership rule can be tested without
/// spinning up the whole worker.
#[cfg(target_os = "linux")]
pub fn drain_orphans() {
    use nix::sys::wait::{Id, WaitPidFlag, WaitStatus, waitid, waitpid};

    // Peek at the next reapable child WITHOUT consuming it, so we can decide
    // whether it is ours to reap. WNOWAIT leaves the zombie in place for its
    // real owner; WNOHANG keeps the drain non-blocking.
    let peek_flags = WaitPidFlag::WEXITED | WaitPidFlag::WNOWAIT | WaitPidFlag::WNOHANG;

    loop {
        let peeked = match waitid(Id::All, peek_flags) {
            Ok(WaitStatus::StillAlive) => return,
            Ok(WaitStatus::Exited(pid, _)) => pid,
            Ok(WaitStatus::Signaled(pid, _, _)) => pid,
            Ok(_) => return,
            // ECHILD = no children right now, which is the steady state.
            Err(nix::Error::ECHILD) => return,
            Err(e) => {
                tracing::warn!(error = %e, "waitid peek failed");
                return;
            }
        };

        // A sandbox owns this one; `exec::wait_with_timeout` will collect it
        // within ~10 ms. Stop the drain rather than spin: the peek is not
        // resumable past a skipped entry, and the next tick (2 s) picks up
        // anything queued behind it.
        if zerocode_sandbox::owned_children::is_owned(peeked.as_raw()) {
            return;
        }

        match waitpid(peeked, Some(WaitPidFlag::WNOHANG)) {
            Ok(WaitStatus::Exited(pid, code)) => {
                tracing::debug!(%pid, exit_code = code, "reaped orphan");
            }
            Ok(WaitStatus::Signaled(pid, sig, _)) => {
                tracing::debug!(%pid, ?sig, "reaped signaled orphan");
            }
            // Raced with the owner reaping it, or it is no longer reapable —
            // either way there is nothing left to do.
            Ok(_) | Err(nix::Error::ECHILD) => return,
            Err(e) => {
                tracing::warn!(error = %e, "waitpid drain failed");
                return;
            }
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use nix::sys::wait::{Id, WaitPidFlag, WaitStatus, waitid, waitpid};
    use nix::unistd::{ForkResult, fork};
    use std::sync::{Mutex, MutexGuard, OnceLock};
    use zerocode_sandbox::owned_children::OwnedChild;

    /// Child reaping is process-wide, so these tests cannot run concurrently:
    /// one test's `drain_orphans()` would collect the other's zombie. Cargo runs
    /// tests in threads of a single process, hence the explicit lock.
    fn serial() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// Fork a child that exits immediately and block until it is a zombie.
    ///
    /// SAFETY: the child does nothing but `_exit`, which is async-signal-safe.
    fn spawn_zombie() -> nix::unistd::Pid {
        match unsafe { fork() }.expect("fork") {
            ForkResult::Child => unsafe { nix::libc::_exit(7) },
            ForkResult::Parent { child } => {
                // Wait for it to actually become reapable, without consuming it.
                // WNOWAIT is a `waitid` flag — `waitpid`/`wait4` reject it with
                // EINVAL — so the non-destructive peek has to go through waitid.
                let flags = WaitPidFlag::WEXITED | WaitPidFlag::WNOWAIT | WaitPidFlag::WNOHANG;
                for _ in 0..1000 {
                    let peeked = waitid(Id::Pid(child), flags);
                    if matches!(peeked, Ok(WaitStatus::Exited(_, _))) {
                        return child;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
                panic!("child never became reapable");
            }
        }
    }

    /// The regression this whole mechanism exists for. The old drain called
    /// `waitpid(-1, WNOHANG)`, which consumed the exit status of whatever child
    /// happened to be reapable — including a sandbox's own. The sandbox's next
    /// `waitpid` then returned ECHILD, the submission was written back as
    /// `sandbox_failure` with empty stdout, and a grader scored a correct
    /// program as wrong.
    #[test]
    fn drain_leaves_owned_children_for_their_owner() {
        let _serial = serial();
        let child = spawn_zombie();
        let _owned = OwnedChild::register(child.as_raw());

        super::drain_orphans();

        // The owner must still be able to collect the real exit status.
        let status = waitpid(child, Some(WaitPidFlag::WNOHANG))
            .expect("owned child must NOT have been reaped by the drain");
        assert!(
            matches!(status, WaitStatus::Exited(_, 7)),
            "expected the owner to observe exit code 7, got {status:?}",
        );
    }

    #[test]
    fn drain_reaps_unowned_orphans() {
        let _serial = serial();
        let child = spawn_zombie();

        super::drain_orphans();

        // Nobody claimed it, so the drain should have collected it and the
        // owner-style wait now finds no such child.
        let res = waitpid(child, Some(WaitPidFlag::WNOHANG));
        assert!(
            matches!(res, Err(nix::Error::ECHILD)),
            "unowned orphan should have been reaped by the drain, got {res:?}",
        );
    }
}

#[cfg(not(target_os = "linux"))]
pub async fn run(shutdown: Arc<Notify>) {
    shutdown.notified().await;
}
