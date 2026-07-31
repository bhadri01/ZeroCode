//! Registry of PIDs the sandbox forked and intends to `waitpid` itself.
//!
//! Why this exists: the worker also runs a background *reaper* task that drains
//! `waitpid(-1, WNOHANG)` every couple of seconds to clean up orphaned
//! grandchildren (see `zerocode-worker/src/reaper.rs`). `waitpid(-1)` is
//! indiscriminate — it reaps *any* reapable child of the process, including the
//! sandbox's own direct child. When the reaper's tick landed in the window
//! between a sandbox child exiting and `exec::wait_with_timeout`'s next 10 ms
//! poll, the reaper consumed the exit status and the sandbox's next
//! `waitpid(pid, …)` returned `ECHILD`. That surfaced as
//!
//!   ERROR submission failed at worker layer
//!         error="sandbox: wait failed: waitpid: ECHILD: No child processes"
//!
//! and the submission was written back as `sandbox_failure` with empty stdout —
//! i.e. a *correct* program silently marked wrong, at random, under load.
//!
//! The fix is ownership: `exec::run` registers its child here for the lifetime
//! of the wait, and the reaper peeks at what is reapable with `WNOWAIT` and
//! skips anything registered, leaving it for its owner.
//!
//! A plain `Mutex<HashSet>` is enough — registrations happen twice per
//! submission and the reaper reads it a handful of times every 2 s.

use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

fn registry() -> &'static Mutex<HashSet<i32>> {
    static REG: OnceLock<Mutex<HashSet<i32>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Claim `pid`: this process will `waitpid` it itself, so no other reaper may.
/// Call immediately after `fork()` in the parent, before the child can exit.
pub fn register(pid: i32) {
    if let Ok(mut set) = registry().lock() {
        set.insert(pid);
    }
}

/// Release `pid` once it has been waited on (or the wait was abandoned).
pub fn unregister(pid: i32) {
    if let Ok(mut set) = registry().lock() {
        set.remove(&pid);
    }
}

/// True when `pid` belongs to an in-flight sandbox and must not be reaped by
/// anyone else. A poisoned lock answers `true` (fail safe): declining to reap
/// leaves at worst a zombie until the next tick, whereas reaping someone else's
/// child corrupts a submission's verdict.
pub fn is_owned(pid: i32) -> bool {
    match registry().lock() {
        Ok(set) => set.contains(&pid),
        Err(_) => true,
    }
}

/// Drops the registration when the guard goes out of scope, including on the
/// error paths out of `exec::run`.
pub struct OwnedChild(i32);

impl OwnedChild {
    pub fn register(pid: i32) -> Self {
        register(pid);
        Self(pid)
    }
}

impl Drop for OwnedChild {
    fn drop(&mut self) {
        unregister(self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_then_unregister() {
        // PIDs picked high and distinct so parallel tests in this module don't
        // collide on the process-wide registry.
        assert!(!is_owned(4_000_001));
        register(4_000_001);
        assert!(is_owned(4_000_001));
        unregister(4_000_001);
        assert!(!is_owned(4_000_001));
    }

    #[test]
    fn guard_unregisters_on_drop() {
        {
            let _g = OwnedChild::register(4_000_002);
            assert!(is_owned(4_000_002));
        }
        assert!(!is_owned(4_000_002));
    }
}
