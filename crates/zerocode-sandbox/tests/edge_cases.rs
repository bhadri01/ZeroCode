//! Integration tests that exercise adversarial submission patterns against the
//! real `NativeSandbox`. Requires Linux with a full sandbox environment:
//!
//! - cgroup v2 parent directory (default `/sys/fs/cgroup/zerocode/`)
//! - runner rootfs populated (default `/var/lib/zerocode/runner-rootfs/`)
//! - scratch dir (default `/run/zerocode-sandbox/`)
//!
//! Run with: `cargo test -p zerocode-sandbox --features edge-cases --test edge_cases`
//!
//! These tests are intentionally excluded from the default test suite because
//! they need a real sandbox environment that only exists on Linux CI hosts.

#![cfg(all(target_os = "linux", feature = "edge-cases"))]

mod edge_cases {
    mod harness;
    mod common;
    mod python;
    mod node;
    mod c_cpp;
    mod go_lang;
    mod rust_lang;
    mod java;
}
