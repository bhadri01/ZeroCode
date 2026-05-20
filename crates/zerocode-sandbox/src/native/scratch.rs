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
        // This is a worker->sandbox input only; it is never bind-mounted into
        // /box, so the run phase can't reach or alter it.
        if let Some(binary) = &job.cached_binary {
            let prog = path.join("cached_prog");
            fs::write(&prog, binary)
                .map_err(|e| SandboxError::MountSetup(format!("write cached_prog: {e}")))?;
        }

        // The compiled binary is captured OUT of the sandbox over a CLOEXEC pipe
        // at compile time (exec.rs), not via a file here — so the run phase can
        // never poison the cache or write unbounded data to host disk.

        Ok(Self { path })
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
