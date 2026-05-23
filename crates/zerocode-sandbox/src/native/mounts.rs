//! Mount setup the child performs after entering its mount namespace.
//!
//! Phase 2.5 added `pivot_root` into the runner rootfs. The full sequence:
//!
//! 1. `mount("/", MS_PRIVATE | MS_REC)` — mount-propagation off.
//! 2. `mount("rbind", runner_rootfs → scratch_dir/root)` — runner image
//!    becomes the new root candidate.
//! 3. `mount("tmpfs", scratch_dir/root/box)` — per-submission writable
//!    scratch, sized so it counts against cgroup memory without dominating it.
//! 4. `mount("tmpfs", scratch_dir/root/tmp)` — for compilers + runtime scratch.
//! 5. Copy source + stdin from the host scratch dir into the box tmpfs.
//! 6. `pivot_root(scratch_dir/root, scratch_dir/root/box/.zc-old)` — put_old
//!    lives *inside* the box tmpfs so the rmdir-cleanup that follows can't
//!    leak back into the read-only runner image.
//! 7. `umount2("/box/.zc-old", MNT_DETACH)` + `rmdir`.
//! 8. `mount("proc", "/proc")` — fresh procfs view scoped to the new PID ns.
//! 9. `chdir("/box")` — language run_cmd resolves relative paths against /box.
//!
//! `bring_loopback_up` brings `lo` UP inside the NET namespace via
//! `SIOCSIFFLAGS`; some language runtimes (Python `urllib`) bind `127.0.0.1`
//! during init and fail with `ENETUNREACH` if it's left DOWN.

use std::ffi::CString;
use std::path::Path;

use crate::SandboxError;

#[cfg(target_os = "linux")]
pub fn make_namespace_private() -> Result<(), SandboxError> {
    use nix::mount::{MsFlags, mount};
    mount::<str, str, str, str>(None, "/", None, MsFlags::MS_PRIVATE | MsFlags::MS_REC, None)
        .map_err(|e| SandboxError::MountSetup(format!("make rprivate /: {e}")))?;
    Ok(())
}

/// Bring up the `lo` interface inside the new NET namespace. Sends
/// `SIOCSIFFLAGS` with `IFF_UP | IFF_RUNNING` against an AF_INET socket.
#[cfg(target_os = "linux")]
pub fn bring_loopback_up() -> Result<(), SandboxError> {
    use nix::libc;
    use std::mem;
    use std::os::fd::AsRawFd;

    let sock = nix::sys::socket::socket(
        nix::sys::socket::AddressFamily::Inet,
        nix::sys::socket::SockType::Datagram,
        nix::sys::socket::SockFlag::empty(),
        None,
    )
    .map_err(|e| SandboxError::NamespaceSetup(format!("socket(AF_INET) for lo up: {e}")))?;

    let mut ifreq: libc::ifreq = unsafe { mem::zeroed() };
    let name = b"lo\0";
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

/// Make `runner_rootfs` the new root for the calling process. The host scratch
/// directory survives — `Scratch::destroy` cleans it up after the child exits.
/// After this returns, the child's cwd is `/box`.
///
/// `box_size_mb` and `tmp_size_mb` size the two per-submission tmpfs mounts.
/// Both count against the cgroup's `memory.max`, so picking them too large
/// leaves no headroom for runtime allocations.
#[cfg(target_os = "linux")]
pub fn pivot_into_runner(
    runner_rootfs: &Path,
    scratch_dir: &Path,
    source_file: &str,
    box_size_mb: u32,
    tmp_size_mb: u32,
) -> Result<(), SandboxError> {
    use nix::mount::{MntFlags, MsFlags, mount, umount2};
    use nix::unistd::pivot_root;

    let new_root = scratch_dir.join("root");

    // 1. Materialise new_root and bind the runner image at it. Recursive so
    // any mounts inside the runner image come along.
    std::fs::create_dir_all(&new_root)
        .map_err(|e| SandboxError::MountSetup(format!("mkdir {}: {e}", new_root.display())))?;
    mount::<Path, Path, str, str>(
        Some(runner_rootfs),
        &new_root,
        None,
        MsFlags::MS_BIND | MsFlags::MS_REC,
        None,
    )
    .map_err(|e| SandboxError::MountSetup(format!("rbind runner_rootfs: {e}")))?;

    // 2. Per-submission tmpfs at /box. The runner image already provides the
    // mount-point (`runners/Dockerfile` creates /box at build time).
    let box_path = new_root.join("box");
    let box_opts =
        CString::new(format!("size={box_size_mb}m,mode=0700")).expect("box mount option string");
    mount::<str, Path, str, [u8]>(
        Some("tmpfs"),
        &box_path,
        Some("tmpfs"),
        MsFlags::MS_NOSUID | MsFlags::MS_NODEV,
        Some(box_opts.to_bytes()),
    )
    .map_err(|e| SandboxError::MountSetup(format!("tmpfs /box: {e}")))?;

    // 3. Per-submission tmpfs at /tmp.
    let tmp_path = new_root.join("tmp");
    let tmp_opts =
        CString::new(format!("size={tmp_size_mb}m,mode=1777")).expect("tmp mount option string");
    mount::<str, Path, str, [u8]>(
        Some("tmpfs"),
        &tmp_path,
        Some("tmpfs"),
        MsFlags::MS_NOSUID | MsFlags::MS_NODEV,
        Some(tmp_opts.to_bytes()),
    )
    .map_err(|e| SandboxError::MountSetup(format!("tmpfs /tmp: {e}")))?;

    // 3b. Minimal /dev. The runner rootfs ships an empty /dev mount point; many
    // toolchains/runtimes need real device nodes (Go's compiler opens
    // /dev/null; libraries read /dev/urandom). We can't mknod real devices in a
    // user namespace, so mount a per-submission tmpfs and bind the essential
    // nodes in from the worker's /dev (still visible pre-pivot). Done before
    // pivot_root for exactly that reason.
    let dev_path = new_root.join("dev");
    let dev_opts = CString::new("mode=0755,size=1m").expect("dev mount option string");
    mount::<str, Path, str, [u8]>(
        Some("tmpfs"),
        &dev_path,
        Some("tmpfs"),
        MsFlags::MS_NOSUID | MsFlags::MS_NOEXEC,
        Some(dev_opts.to_bytes()),
    )
    .map_err(|e| SandboxError::MountSetup(format!("tmpfs /dev: {e}")))?;
    for node in ["null", "zero", "full", "random", "urandom", "tty"] {
        let target = dev_path.join(node);
        std::fs::File::create(&target)
            .map_err(|e| SandboxError::MountSetup(format!("touch /dev/{node}: {e}")))?;
        let src = format!("/dev/{node}");
        mount::<str, Path, str, str>(Some(src.as_str()), &target, None, MsFlags::MS_BIND, None)
            .map_err(|e| SandboxError::MountSetup(format!("bind /dev/{node}: {e}")))?;
    }
    // Standard fd symlinks (resolve once the new /proc is mounted post-pivot).
    use std::os::unix::fs::symlink;
    let _ = symlink("/proc/self/fd", dev_path.join("fd"));
    let _ = symlink("/proc/self/fd/0", dev_path.join("stdin"));
    let _ = symlink("/proc/self/fd/1", dev_path.join("stdout"));
    let _ = symlink("/proc/self/fd/2", dev_path.join("stderr"));

    // 4. Source + stdin into the box tmpfs. We deliberately copy rather than
    // bind-mount: the box tmpfs is per-submission and writable, so the child
    // can read/modify these without escaping to a shared host path.
    std::fs::copy(scratch_dir.join(source_file), box_path.join(source_file))
        .map_err(|e| SandboxError::MountSetup(format!("copy source: {e}")))?;
    std::fs::copy(scratch_dir.join("stdin"), box_path.join("stdin"))
        .map_err(|e| SandboxError::MountSetup(format!("copy stdin: {e}")))?;

    // 4a. If a cached compile artifact exists, restore it into /box, skipping
    //     the compile phase. New entries are a tar of the compile outputs
    //     (handles JVM .class/.jar + .NET bin/); legacy entries are a single raw
    //     binary, so if untar fails we fall back to writing it as /box/prog.
    let cached = scratch_dir.join("cached_prog");
    if cached.exists() {
        let blob = std::fs::read(&cached)
            .map_err(|e| SandboxError::MountSetup(format!("read cached artifact: {e}")))?;
        if crate::artifact::unpack_into(&box_path, &blob).is_err() {
            // Legacy raw-binary cache entry — restore the single executable.
            use std::os::unix::fs::PermissionsExt;
            std::fs::write(box_path.join("prog"), &blob)
                .map_err(|e| SandboxError::MountSetup(format!("write cached binary: {e}")))?;
            std::fs::set_permissions(
                box_path.join("prog"),
                std::fs::Permissions::from_mode(0o755),
            )
            .map_err(|e| SandboxError::MountSetup(format!("chmod cached binary: {e}")))?;
        }
    }

    // NOTE: the compiled binary is NOT exchanged via a file in /box. It used to
    // be bind-mounted from scratch_dir/artifact, but that let the run phase
    // overwrite it (compile-cache poisoning) and write unbounded data to host
    // disk. It's now streamed to the parent over a CLOEXEC pipe at compile time,
    // before user code runs (see exec.rs::send_artifact).

    // 5. put_old lives inside the box tmpfs so the post-pivot rmdir cleanup
    // never touches the read-only runner image. Each submission has its own
    // tmpfs; no race possible.
    let put_old_host = box_path.join(".zc-old");
    std::fs::create_dir(&put_old_host)
        .map_err(|e| SandboxError::MountSetup(format!("mkdir put_old: {e}")))?;

    // 6. Make new_root the root. put_old captures the old root mount.
    pivot_root(&new_root, &put_old_host)
        .map_err(|e| SandboxError::MountSetup(format!("pivot_root: {e}")))?;

    // 7. From here, host paths are inaccessible. Walk to / so subsequent
    // operations don't resolve against the now-detached cwd.
    std::env::set_current_dir("/")
        .map_err(|e| SandboxError::MountSetup(format!("chdir /: {e}")))?;

    // 8. Fresh /proc reflecting the new PID namespace (the caller is PID 1 of
    // it). Mounted BEFORE detaching the old root: inside a nested user
    // namespace (e.g. the worker itself in a container) the kernel's
    // `mount_too_revealing` check requires a fully-visible reference procfs to
    // permit a new one — the old root's /proc, still mounted at
    // `/box/.zc-old/proc`, is that reference. Detaching first removes it and the
    // mount fails with EPERM. The runner image's own /proc is an empty mount
    // point that this overlays.
    mount::<str, str, str, str>(
        Some("proc"),
        "/proc",
        Some("proc"),
        MsFlags::MS_NOSUID | MsFlags::MS_NODEV | MsFlags::MS_NOEXEC,
        None,
    )
    .map_err(|e| SandboxError::MountSetup(format!("mount /proc: {e}")))?;

    // 9. Now detach the old root. MNT_DETACH is the lazy umount that succeeds
    // even if the old root has busy children; the actual teardown happens when
    // nothing references those mounts anymore.
    umount2("/box/.zc-old", MntFlags::MNT_DETACH)
        .map_err(|e| SandboxError::MountSetup(format!("umount /box/.zc-old: {e}")))?;
    std::fs::remove_dir("/box/.zc-old")
        .map_err(|e| SandboxError::MountSetup(format!("rmdir /box/.zc-old: {e}")))?;

    // 10. Run the program from /box where its source + stdin live.
    std::env::set_current_dir("/box")
        .map_err(|e| SandboxError::MountSetup(format!("chdir /box: {e}")))?;

    Ok(())
}
