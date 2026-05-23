//! Compile-artifact packing for the compile cache.
//!
//! The cache used to store a single `/box/prog` file, which only worked for
//! languages whose compiler emits one binary. JVM/.NET languages emit several
//! files (`*.class`, a `.jar`, a `bin/` directory), so they were never cached
//! and recompiled on every submission.
//!
//! These helpers pack the *post-compile* working directory into a tar blob —
//! uniformly capturing one binary, a jar, a class set, or a `bin/` tree — and
//! restore it on a cache hit. The submission's own inputs (source file + the
//! `stdin` file) are EXCLUDED: the cache key is (language, source), not stdin,
//! so a cache hit may carry different stdin and must not have it overwritten.

use std::path::Path;

/// Names always excluded from a packed artifact: caller passes the language's
/// source filename; this is the stdin file the sandbox stages next to it.
pub const STDIN_FILE: &str = "stdin";

/// Pack the compile outputs in `dir` into a tar blob, skipping any entry whose
/// file name is in `exclude` (the source file + stdin). File modes are recorded
/// so the executable bit survives a round trip; symlinks/special files are
/// skipped. Returns the tar bytes.
pub fn pack_dir(dir: &Path, exclude: &[&str]) -> std::io::Result<Vec<u8>> {
    let mut builder = tar::Builder::new(Vec::new());
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        if exclude.iter().any(|e| name.as_os_str() == *e) {
            continue;
        }
        let ft = entry.file_type()?;
        let path = entry.path();
        if ft.is_dir() {
            builder.append_dir_all(&name, &path)?;
        } else if ft.is_file() {
            let mut f = std::fs::File::open(&path)?;
            builder.append_file(&name, &mut f)?;
        }
        // symlinks / fifos / devices are not compile outputs — skip.
    }
    builder.into_inner()
}

/// Extract a blob produced by [`pack_dir`] into `dir`, preserving file modes.
/// Returns an error if `blob` isn't a valid tar (the caller treats that as a
/// legacy raw-binary cache entry and falls back). The tar crate rejects
/// `..`/absolute-path entries, and we only ever unpack our own archives.
pub fn unpack_into(dir: &Path, blob: &[u8]) -> std::io::Result<()> {
    let mut ar = tar::Archive::new(blob);
    ar.set_preserve_permissions(true);
    ar.set_overwrite(true);
    // Leave ownership alone (default): unpacking runs as in-userns root and we
    // don't want to chown to recorded ids.
    ar.unpack(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn round_trips_files_dirs_and_modes_excluding_inputs() {
        let src = tempfile::tempdir().unwrap();
        // Compile outputs + the inputs we must NOT cache.
        std::fs::write(src.path().join("prog"), b"BINARY").unwrap();
        std::fs::set_permissions(src.path().join("prog"), std::fs::Permissions::from_mode(0o755))
            .unwrap();
        std::fs::write(src.path().join("main.kt"), b"SOURCE").unwrap();
        std::fs::write(src.path().join(STDIN_FILE), b"7\n").unwrap();
        std::fs::create_dir(src.path().join("bin")).unwrap();
        std::fs::write(src.path().join("bin/app.dll"), b"DLL").unwrap();

        let blob = pack_dir(src.path(), &["main.kt", STDIN_FILE]).unwrap();

        let dst = tempfile::tempdir().unwrap();
        unpack_into(dst.path(), &blob).unwrap();

        // Outputs restored, inputs excluded.
        assert_eq!(std::fs::read(dst.path().join("prog")).unwrap(), b"BINARY");
        assert_eq!(std::fs::read(dst.path().join("bin/app.dll")).unwrap(), b"DLL");
        assert!(!dst.path().join("main.kt").exists());
        assert!(!dst.path().join(STDIN_FILE).exists());
        // Executable bit survived.
        let mode = std::fs::metadata(dst.path().join("prog"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o111, 0o111);
    }

    #[test]
    fn unpack_rejects_non_tar_blob() {
        let dst = tempfile::tempdir().unwrap();
        // A legacy raw-binary entry is not a valid tar → error → caller falls back.
        assert!(unpack_into(dst.path(), b"\x7fELF not a tar").is_err());
    }
}
