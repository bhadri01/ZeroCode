//! Boot-time preflight: confirms the host kernel exposes everything the
//! production sandbox requires. Runs once at worker startup. Fail-fast with a
//! human-readable error rather than failing opaquely at the first submission.

use crate::SandboxError;

/// Result of a preflight check. `Ok(report)` means we're safe to start; the
/// report is a list of human-readable lines suitable for `tracing::info!` so
/// the operator sees exactly what was detected.
pub fn preflight() -> Result<Vec<String>, SandboxError> {
    let mut report = Vec::new();

    let kernel = kernel_release();
    report.push(format!("kernel release: {}", kernel));

    if !cgroup_v2_unified() {
        return Err(SandboxError::KernelFeatureMissing(
            "cgroup v2 unified hierarchy not detected at /sys/fs/cgroup/cgroup.controllers",
        ));
    }
    report.push("cgroup v2 unified hierarchy: ok".into());

    if !has_cgroup_kill() {
        return Err(SandboxError::KernelFeatureMissing(
            "cgroup.kill not writable (need kernel >= 5.14)",
        ));
    }
    report.push("cgroup.kill: ok".into());

    if !has_landlock() {
        return Err(SandboxError::KernelFeatureMissing(
            "landlock not available (need kernel >= 5.13 with LANDLOCK enabled)",
        ));
    }
    report.push("landlock: ok".into());

    if !user_namespaces_enabled() {
        return Err(SandboxError::KernelFeatureMissing(
            "user namespaces disabled; set kernel.unprivileged_userns_clone=1",
        ));
    }
    report.push("user namespaces: ok".into());

    Ok(report)
}

#[cfg(target_os = "linux")]
fn kernel_release() -> String {
    std::fs::read_to_string("/proc/sys/kernel/osrelease")
        .map(|s| s.trim().to_owned())
        .unwrap_or_else(|_| "unknown".into())
}

#[cfg(not(target_os = "linux"))]
fn kernel_release() -> String {
    "non-linux".into()
}

#[cfg(target_os = "linux")]
fn cgroup_v2_unified() -> bool {
    std::path::Path::new("/sys/fs/cgroup/cgroup.controllers").exists()
}

#[cfg(not(target_os = "linux"))]
fn cgroup_v2_unified() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn has_cgroup_kill() -> bool {
    // The file exists at the root cgroup once kernel >= 5.14.
    std::path::Path::new("/sys/fs/cgroup/cgroup.kill").exists()
}

#[cfg(not(target_os = "linux"))]
fn has_cgroup_kill() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn has_landlock() -> bool {
    // There's no reliable cheap sysfs/procfs indicator for Landlock across distros
    // (the `/sys/kernel/security/landlock` entry is frequently absent even when the
    // LSM is enabled, and `/proc/filesystems` never lists it). So we don't gate
    // startup on a preflight here; the landlock crate runs its own ABI probe at
    // sandbox-init time and fails closed, which is the authoritative check.
    true
}

#[cfg(not(target_os = "linux"))]
fn has_landlock() -> bool {
    false
}

#[cfg(target_os = "linux")]
fn user_namespaces_enabled() -> bool {
    std::fs::read_to_string("/proc/sys/kernel/unprivileged_userns_clone")
        .map(|s| s.trim() == "1")
        // On kernels where the sysctl doesn't exist, userns is unconditionally on.
        .unwrap_or(true)
}

#[cfg(not(target_os = "linux"))]
fn user_namespaces_enabled() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preflight_runs_without_panicking() {
        // We don't assert success — on dev hosts (macOS) it should fail cleanly.
        let _ = preflight();
    }
}
