use serde::{Deserialize, Serialize};

use crate::limits::ResourceLimits;

/// Stable language identifier used across the API + DB.
/// IDs ≤ 99 are reserved for the Core 6 v1 languages; v1.5 batches start at 100.
pub type LanguageId = u32;

/// Which sandbox backend handles this language's submissions.
///
/// Default `Native` covers every existing v1/v1.5 language — they run as
/// real processes inside cgroups + namespaces + landlock + seccomp.
/// `Wasm` opts a language into the wasmtime-backed `WasmSandbox`; the
/// language's source code is interpreted as a pre-compiled `.wasm` blob
/// (id 200 = `raw-wasm`). Future v2 work adds WASI-targeted compile
/// pipelines for Rust/Go/C/C++ that emit `.wasm` from source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SandboxTier {
    #[default]
    Native,
    Wasm,
}

/// Declarative description of how to compile + run code in one language.
/// Loaded from `runners/languages.toml` at API/worker boot.
///
/// Wraps a small bash command-line, not a structured AST: command authors get
/// access to a fresh `/box/` scratch directory and may shell out as needed.
/// The shell is invoked with `bash -c` inside the sandbox, never on the host.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LanguageSpec {
    pub id: LanguageId,
    pub name: String,
    pub version: String,
    /// e.g. "main.py", "main.rs" — written to `/box/<source_file>` before compile/run.
    pub source_file: String,
    /// Compile step. `None` means interpreted; only `run_cmd` is used.
    pub compile_cmd: Option<Vec<String>>,
    /// Run step. Always required.
    pub run_cmd: Vec<String>,
    /// Optional extra env vars applied on top of the sandbox base env.
    #[serde(default)]
    pub env: Vec<(String, String)>,
    /// Per-language limit overrides. `None` falls back to API defaults.
    #[serde(default)]
    pub default_limits: Option<ResourceLimits>,
    /// Per-language compile-phase limit overrides.
    #[serde(default)]
    pub compile_limits: Option<ResourceLimits>,
    /// True once a newer version supersedes this entry.
    #[serde(default)]
    pub is_archived: bool,
    /// Which sandbox backend handles this language. Defaults to `Native`,
    /// so every existing language keeps its current isolation semantics
    /// without touching the registry.
    #[serde(default)]
    pub tier: SandboxTier,
}

impl LanguageSpec {
    pub fn is_compiled(&self) -> bool {
        self.compile_cmd.as_ref().is_some_and(|c| !c.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpreted_python_spec_roundtrips() {
        let s = LanguageSpec {
            id: 71,
            name: "Python".into(),
            version: "3.13".into(),
            source_file: "main.py".into(),
            compile_cmd: None,
            run_cmd: vec!["/usr/local/bin/python3".into(), "main.py".into()],
            env: vec![("PYTHONUNBUFFERED".into(), "1".into())],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier: SandboxTier::Native,
        };
        assert!(!s.is_compiled());
        let j = serde_json::to_string(&s).unwrap();
        let back: LanguageSpec = serde_json::from_str(&j).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn compiled_rust_spec() {
        let s = LanguageSpec {
            id: 73,
            name: "Rust".into(),
            version: "1.84".into(),
            source_file: "main.rs".into(),
            compile_cmd: Some(vec![
                "/usr/local/bin/rustc".into(),
                "--edition=2024".into(),
                "-O".into(),
                "main.rs".into(),
                "-o".into(),
                "prog".into(),
            ]),
            run_cmd: vec!["./prog".into()],
            env: vec![],
            default_limits: None,
            compile_limits: None,
            is_archived: false,
            tier: SandboxTier::Native,
        };
        assert!(s.is_compiled());
    }
}
