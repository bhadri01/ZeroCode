//! Per-submission scratch directory holding source code + stdin. Created
//! before the child is spawned and destroyed once the child has exited (and
//! its cgroup has been removed).
//!
//! In Phase 1.5 this is a plain directory on the host filesystem; Phase 2
//! makes it a per-submission tmpfs that gets bind-mounted into `/box/` inside
//! the sandbox.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use crate::{SandboxError, SandboxJob};

pub struct Scratch {
    pub path: PathBuf,
}

impl Scratch {
    pub fn create(parent: &Path, job: &SandboxJob) -> Result<Self, SandboxError> {
        let path = parent.join(job.token.to_string());
        fs::create_dir_all(&path).map_err(|e| {
            SandboxError::MountSetup(format!("create scratch {}: {e}", path.display()))
        })?;
        // 0700 so other UIDs on the host can't peek (defence in depth — the
        // sandboxed UID is mapped to our worker UID via the user namespace).
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|e| {
            SandboxError::MountSetup(format!("chmod scratch {}: {e}", path.display()))
        })?;

        // Write the source file using the language spec's source filename.
        let source_path = path.join(&job.language.source_file);
        fs::write(&source_path, &job.source_code).map_err(|e| {
            SandboxError::MountSetup(format!("write source {}: {e}", source_path.display()))
        })?;

        // Always write a stdin file (empty if the request didn't include one).
        let stdin_path = path.join("stdin");
        fs::write(&stdin_path, &job.stdin).map_err(|e| {
            SandboxError::MountSetup(format!("write stdin {}: {e}", stdin_path.display()))
        })?;

        // If the worker supplied a cached compile artifact, write it so
        // `pivot_into_runner` can copy it into /box/prog and skip compilation.
        if let Some(binary) = &job.cached_binary {
            let prog = path.join("cached_prog");
            fs::write(&prog, binary)
                .map_err(|e| SandboxError::MountSetup(format!("write cached_prog: {e}")))?;
        }

        // Empty exchange file for compiled-binary extraction. A bind-mount in
        // `pivot_into_runner` links this to /box/.artifact inside the sandbox;
        // after a successful compile the child writes the binary here so the
        // parent can read it post-exit.
        fs::write(path.join("artifact"), b"")
            .map_err(|e| SandboxError::MountSetup(format!("create artifact exchange: {e}")))?;

        Ok(Self { path })
    }

    /// Read the compiled binary that the child wrote via the bind-mounted
    /// exchange file. Returns `None` if the file is empty (interpreted language
    /// or compile failed).
    pub fn read_artifact(&self) -> Option<Vec<u8>> {
        let data = fs::read(self.path.join("artifact")).ok()?;
        if data.is_empty() { None } else { Some(data) }
    }

    pub fn has_cached_binary(&self) -> bool {
        self.path.join("cached_prog").exists()
    }

    pub fn destroy(self) {
        if let Err(e) = fs::remove_dir_all(&self.path) {
            tracing::warn!(
                error = %e,
                path = %self.path.display(),
                "could not remove scratch dir"
            );
        }
    }
}
