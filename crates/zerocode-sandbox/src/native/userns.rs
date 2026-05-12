//! User-namespace UID/GID mapping. Parent-side: after the child has called
//! `unshare(NEWUSER)` and signalled us via the sync pipe, we write the
//! `/proc/<child>/uid_map` and `gid_map` files. Inside the new namespace the
//! child then appears as in-container UID 0 while on the host it remains the
//! worker's unprivileged UID.
//!
//! Why this matters:
//! - `CAP_CHOWN` inside a user namespace can only target UIDs that map into
//!   that namespace — historical Judge0 CVE-2024-28189 (chown bypass) is
//!   structurally impossible because there's no mapping for arbitrary UIDs.
//! - Mount calls inside the child only need namespace-scoped capabilities,
//!   so we don't need to grant the worker any extra privilege on the host.
//!
//! The single-UID mapping pattern (`0 <our_uid> 1`) is allowed without
//! `CAP_SETUID` on the parent because we're only mapping our own UID.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use crate::SandboxError;

pub fn write_maps(child_pid: i32) -> Result<(), SandboxError> {
    let host_uid = nix::unistd::getuid().as_raw();
    let host_gid = nix::unistd::getgid().as_raw();
    let base = PathBuf::from(format!("/proc/{child_pid}"));

    // setgroups must be denied before gid_map can be written by an
    // unprivileged process. Errors here are typically "already denied" on
    // newer kernels; we only fail if the write itself errors.
    let setgroups_path = base.join("setgroups");
    write_atomic(&setgroups_path, b"deny\n")
        .map_err(|e| SandboxError::NamespaceSetup(format!("write setgroups: {e}")))?;

    let uid_map_path = base.join("uid_map");
    let map = format!("0 {host_uid} 1\n");
    write_atomic(&uid_map_path, map.as_bytes())
        .map_err(|e| SandboxError::NamespaceSetup(format!("write uid_map: {e}")))?;

    let gid_map_path = base.join("gid_map");
    let map = format!("0 {host_gid} 1\n");
    write_atomic(&gid_map_path, map.as_bytes())
        .map_err(|e| SandboxError::NamespaceSetup(format!("write gid_map: {e}")))?;

    Ok(())
}

fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut f = fs::OpenOptions::new().write(true).open(path)?;
    // /proc map files accept a single write of the full content. Anything
    // else (multiple writes, partial writes) gets rejected by the kernel.
    f.write_all(bytes)?;
    Ok(())
}
