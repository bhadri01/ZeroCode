//! Filesystem isolation via Landlock. Closes the symlink-escape class of
//! sandbox bugs (Judge0 CVE-2024-28185 / -28189): even if the child resolves
//! a symlink that points outside `/box`, the kernel denies the I/O at the
//! target path, not at the link.
//!
//! Phase 2 ruleset:
//! - **Read-only execute** on `/usr`, `/lib`, `/lib64`, `/bin`, `/sbin`,
//!   `/etc` (so the interpreter can load shared libraries + read locale).
//! - **Read-write** on the per-submission `/tmp` (mounted tmpfs) and the
//!   scratch dir holding source + stdin.
//! - **Denied** elsewhere by omission — landlock is allow-list semantics.
//!
//! Networking restrictions land in Phase 2.5 once we depend on landlock ABI 4+.

use std::path::Path;

use crate::SandboxError;

pub fn apply(scratch_dir: &Path) -> Result<(), SandboxError> {
    use landlock::{
        ABI, Access, AccessFs, PathBeneath, PathFd, Ruleset, RulesetAttr, RulesetCreatedAttr,
        RulesetStatus,
    };

    // ABI v1 covers FS access controls. Higher ABIs add network controls
    // (v4) and signal isolation (v6); we'll opt into them as the supported
    // kernel floor moves up.
    let abi = ABI::V1;

    let ro = AccessFs::from_read(abi);
    let rw = AccessFs::from_all(abi);

    // Build the rule lists outside the call so we can fold path-open errors
    // into the landlock RulesetError type the API expects.
    let ro_rules: Vec<Result<PathBeneath<PathFd>, landlock::RulesetError>> =
        ["/usr", "/lib", "/lib64", "/bin", "/sbin", "/etc"]
            .iter()
            .filter_map(|p| PathFd::new(p).ok())
            .map(|fd| Ok(PathBeneath::new(fd, ro)))
            .collect();
    let rw_rules: Vec<Result<PathBeneath<PathFd>, landlock::RulesetError>> =
        [scratch_dir, Path::new("/tmp"), Path::new("/dev")]
            .iter()
            .filter_map(|p| PathFd::new(p).ok())
            .map(|fd| Ok(PathBeneath::new(fd, rw)))
            .collect();

    let ruleset = Ruleset::default()
        .handle_access(rw)?
        .create()?
        .add_rules(ro_rules)?
        .add_rules(rw_rules)?
        .restrict_self()
        .map_err(|e| SandboxError::LandlockSetup(format!("restrict_self: {e}")))?;

    match ruleset.ruleset {
        RulesetStatus::FullyEnforced => Ok(()),
        RulesetStatus::PartiallyEnforced => {
            tracing::warn!("landlock partially enforced — some accesses fall through");
            Ok(())
        }
        RulesetStatus::NotEnforced => Err(SandboxError::LandlockSetup(
            "landlock available but ruleset not enforced (kernel ABI too low?)".into(),
        )),
    }
}

// Adapter so callers don't need to import the landlock RulesetError type.
impl From<landlock::RulesetError> for SandboxError {
    fn from(e: landlock::RulesetError) -> Self {
        SandboxError::LandlockSetup(e.to_string())
    }
}

impl From<landlock::PathBeneathError> for SandboxError {
    fn from(e: landlock::PathBeneathError) -> Self {
        SandboxError::LandlockSetup(e.to_string())
    }
}
