//! Mount setup the child does after entering its mount namespace.
//!
//! Phase 2 scope:
//! - Make the mount namespace private so propagations don't affect the host.
//! - Mount a per-submission tmpfs on `/tmp` (size 64 MB) inside the sandbox's
//!   view so language runtimes that scribble to /tmp (Python pyc fallback,
//!   gcc intermediates, JVM tooling) have an isolated scratch area.
//! - Bring up the loopback interface inside the NET namespace so `127.0.0.1`
//!   resolves. Without this, languages that bind localhost during init (e.g.
//!   some test frameworks) fail with `ENETUNREACH`.
//!
//! Phase 2.5 will add `pivot_root` into the runner rootfs + a per-submission
//! tmpfs on `/box`. Right now the child still sees the worker's filesystem
//! view, with landlock restricting what it can read/write.

use std::ffi::CString;

use crate::SandboxError;

#[cfg(target_os = "linux")]
pub fn make_namespace_private() -> Result<(), SandboxError> {
    use nix::mount::{MsFlags, mount};
    // Setting `/` to MS_PRIVATE | MS_REC prevents any mounts we add from
    // leaking out to the host's mount propagation. Same incantation
    // `docker run --mount-propagation=private` uses internally.
    mount::<str, str, str, str>(
        None,
        "/",
        None,
        MsFlags::MS_PRIVATE | MsFlags::MS_REC,
        None,
    )
    .map_err(|e| SandboxError::MountSetup(format!("make rprivate /: {e}")))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn mount_tmp_tmpfs() -> Result<(), SandboxError> {
    use nix::mount::{MsFlags, mount};

    // 64 MB cap on /tmp keeps a runaway submission from filling the host's
    // tmpfs region. We pass it as a mount option string; the tmpfs filesystem
    // honours `size=64M`.
    let opts = CString::new("size=64m,mode=1777").expect("static cstring");
    mount(
        Some("tmpfs"),
        "/tmp",
        Some("tmpfs"),
        MsFlags::MS_NOSUID | MsFlags::MS_NODEV,
        Some(opts.to_bytes()),
    )
    .map_err(|e| SandboxError::MountSetup(format!("mount tmpfs /tmp: {e}")))?;
    Ok(())
}

/// Bring up the `lo` interface inside the new NET namespace. The kernel
/// creates `lo` automatically but leaves it DOWN; many language runtimes
/// fall over without it (Python `urllib`'s `_check_default_url` is a common
/// surprise).
///
/// We send a netlink RTM_NEWLINK with IFF_UP. The nix crate exposes the
/// SIOCSIFFLAGS ioctl path which is simpler.
#[cfg(target_os = "linux")]
pub fn bring_loopback_up() -> Result<(), SandboxError> {
    use nix::libc;
    use std::mem;
    use std::os::fd::AsRawFd;

    // Open an AF_INET dgram socket so we can ioctl on it.
    let sock = match nix::sys::socket::socket(
        nix::sys::socket::AddressFamily::Inet,
        nix::sys::socket::SockType::Datagram,
        nix::sys::socket::SockFlag::empty(),
        None,
    ) {
        Ok(s) => s,
        Err(e) => {
            return Err(SandboxError::NamespaceSetup(format!(
                "socket(AF_INET) for lo up: {e}"
            )));
        }
    };

    let mut ifreq: libc::ifreq = unsafe { mem::zeroed() };
    let name = b"lo\0";
    // SAFETY: writing a NUL-terminated short interface name into the fixed-size buffer.
    for (i, b) in name.iter().enumerate() {
        ifreq.ifr_name[i] = *b as libc::c_char;
    }
    ifreq.ifr_ifru.ifru_flags = (libc::IFF_UP | libc::IFF_RUNNING) as libc::c_short;

    // SAFETY: ifreq is the layout the kernel expects for SIOCSIFFLAGS.
    let ret = unsafe { libc::ioctl(sock.as_raw_fd(), libc::SIOCSIFFLAGS, &ifreq) };
    if ret < 0 {
        let err = std::io::Error::last_os_error();
        return Err(SandboxError::NamespaceSetup(format!(
            "SIOCSIFFLAGS lo: {err}"
        )));
    }
    Ok(())
}
