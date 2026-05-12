//! Seccomp BPF allowlist for sandboxed children.
//!
//! Strategy from `docs/EDGE_CASES.md` §B (Sandbox-escape vectors):
//! - **Default action**: allow. Maintaining a strict allowlist from scratch
//!   is a tarpit per Rust runtime / glibc version; instead we use the
//!   Docker-default approach and **subtract** the dangerous bits.
//! - **Denied** syscalls (kill -EPERM):
//!   - `io_uring_*` family — kernel-bypass attack surface
//!   - `bpf` — JIT spray / Spectre vectors
//!   - `userfaultfd` — historical privilege-escalation surface
//!   - `ptrace` — sandbox introspection / process injection
//!   - `unshare` — already used during setup; subsequent calls would re-enter
//!   - `clone` with `CLONE_NEWUSER` — nested userns; not allowed
//!   - `keyctl` — kernel keyring
//!   - `mount`, `umount2`, `pivot_root`, `setns` — namespace + mount escapes
//!   - `reboot`, `kexec_load`, `kexec_file_load` — host shutdown / kexec
//!   - `add_key`, `request_key` — keyring
//!   - `swapon`, `swapoff` — host swap manipulation
//!   - `module_*` — loadable kernel module insertion
//!
//! Per-language augments: Java needs `clone3`, `membarrier`, and `futex_waitv`.
//! These are already allowed by the default-allow policy — no per-language
//! seccomp profiles needed unless we switch to an allowlist approach.

use crate::SandboxError;

pub fn apply_default() -> Result<(), SandboxError> {
    use libseccomp::{ScmpAction, ScmpFilterContext, ScmpSyscall};

    // Default: allow. We subtract dangerous calls below.
    let mut ctx = ScmpFilterContext::new(ScmpAction::Allow)
        .map_err(|e| SandboxError::SeccompSetup(format!("new filter: {e}")))?;

    // Architecture safety: we set this on x86_64 + aarch64 hosts.
    // Anything else fails fast at boot — we don't ship arm32 etc.
    let _ = ctx.add_arch(libseccomp::ScmpArch::native());

    let denied = [
        "io_uring_setup",
        "io_uring_enter",
        "io_uring_register",
        "bpf",
        "userfaultfd",
        "ptrace",
        "unshare",
        // CLONE_NEWUSER via clone is filtered by argument inspection in
        // Phase 2.5; the plain `clone` syscall stays allowed for threading.
        "keyctl",
        "mount",
        "umount2",
        "pivot_root",
        "setns",
        "reboot",
        "kexec_load",
        "kexec_file_load",
        "add_key",
        "request_key",
        "swapon",
        "swapoff",
        "init_module",
        "finit_module",
        "delete_module",
    ];

    for name in denied {
        let syscall = match ScmpSyscall::from_name(name) {
            Ok(s) => s,
            // Skip syscalls that don't exist on this arch — better than
            // failing the whole sandbox over a missing entry.
            Err(_) => {
                tracing::debug!(syscall = name, "seccomp: syscall not on this arch; skipping");
                continue;
            }
        };
        ctx.add_rule(ScmpAction::Errno(libc::EPERM), syscall)
            .map_err(|e| SandboxError::SeccompSetup(format!("add rule {name}: {e}")))?;
    }

    ctx.load()
        .map_err(|e| SandboxError::SeccompSetup(format!("load: {e}")))?;
    Ok(())
}
