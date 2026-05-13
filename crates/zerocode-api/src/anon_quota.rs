//! Per-IP submission counter for anonymous callers.
//!
//! `tower_governor` already rate-limits the overall request volume per IP, but
//! its bucket counts every request (including health checks, language listings,
//! and GETs on existing submissions). For the anonymous tier we need a *much*
//! tighter cap, and we only want to count expensive operations
//! (`POST /v1/submissions`). This module is invoked explicitly from
//! `submissions::create` and `batches::create`, only when the request's
//! `AuthTier` is `Anonymous`.
//!
//! Implementation: a Moka cache keyed by `IpAddr` whose value is an
//! `AtomicU32` counter. Each entry expires after `window`, so the count
//! resets organically with no background sweeper.

use std::net::IpAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use moka::sync::Cache;

#[derive(Clone)]
pub struct AnonymousQuota {
    inner: Arc<Inner>,
}

struct Inner {
    cache: Cache<IpAddr, Arc<AtomicU32>>,
    max_per_window: u32,
}

impl AnonymousQuota {
    pub fn new(max_per_window: u32, window: Duration) -> Self {
        let cache = Cache::builder()
            .time_to_live(window)
            .max_capacity(50_000)
            .build();
        Self {
            inner: Arc::new(Inner {
                cache,
                max_per_window,
            }),
        }
    }

    /// Increment the bucket for `ip`. Returns `Ok(())` if still under the cap,
    /// `Err(())` once the cap is exceeded. The window slides by entry-TTL —
    /// after `window` of inactivity the entry is dropped and the counter
    /// resets to zero on the next call.
    pub fn check(&self, ip: IpAddr) -> Result<(), ()> {
        let counter = self
            .inner
            .cache
            .get_with(ip, || Arc::new(AtomicU32::new(0)));
        let n = counter.fetch_add(1, Ordering::Relaxed) + 1;
        if n > self.inner.max_per_window {
            Err(())
        } else {
            Ok(())
        }
    }

    #[allow(dead_code)] // exposed for future telemetry / /v1/about reporting
    pub fn max_per_window(&self) -> u32 {
        self.inner.max_per_window
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_at_n_then_blocks() {
        let q = AnonymousQuota::new(3, Duration::from_secs(60));
        let ip: IpAddr = "10.0.0.1".parse().unwrap();
        assert!(q.check(ip).is_ok());
        assert!(q.check(ip).is_ok());
        assert!(q.check(ip).is_ok());
        assert!(q.check(ip).is_err());
        assert!(q.check(ip).is_err());
    }

    #[test]
    fn separate_ips_have_separate_buckets() {
        let q = AnonymousQuota::new(1, Duration::from_secs(60));
        let a: IpAddr = "10.0.0.1".parse().unwrap();
        let b: IpAddr = "10.0.0.2".parse().unwrap();
        assert!(q.check(a).is_ok());
        assert!(q.check(b).is_ok());
        assert!(q.check(a).is_err());
        assert!(q.check(b).is_err());
    }
}
