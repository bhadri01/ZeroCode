use std::path::PathBuf;
use std::sync::{Arc, LazyLock};

use bytes::Bytes;
use zerocode_core::{LanguageRegistry, LanguageSpec, ResourceLimits, Token};
use zerocode_sandbox::{NativeSandbox, NativeSandboxConfig};
use zerocode_sandbox::{Sandbox, SandboxError, SandboxJob, SandboxResult};

static REGISTRY: LazyLock<LanguageRegistry> = LazyLock::new(|| {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../runners/languages.toml");
    let toml =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    LanguageRegistry::from_toml(&toml).expect("parse languages.toml")
});

static SANDBOX: LazyLock<Arc<NativeSandbox>> = LazyLock::new(|| {
    let config = NativeSandboxConfig::from_env();
    Arc::new(NativeSandbox::new(config).expect("create NativeSandbox"))
});

pub fn spec(language_id: u32) -> LanguageSpec {
    REGISTRY
        .require(language_id)
        .unwrap_or_else(|e| panic!("language id {language_id}: {e}"))
        .clone()
}

pub fn default_limits() -> ResourceLimits {
    ResourceLimits {
        cpu_time: 5.0,
        wall_time: 10.0,
        memory_mb: 256,
        max_pids: 64,
        max_stdout: 64 * 1024,
        max_stderr: 64 * 1024,
        enable_network: false,
    }
}

pub fn tight_limits() -> ResourceLimits {
    ResourceLimits {
        cpu_time: 2.0,
        wall_time: 3.0,
        memory_mb: 64,
        max_pids: 32,
        max_stdout: 64 * 1024,
        max_stderr: 64 * 1024,
        enable_network: false,
    }
}

pub fn job(language_id: u32, source: &str) -> SandboxJob {
    job_with_limits(language_id, source, "", default_limits())
}

pub fn job_with_stdin(language_id: u32, source: &str, stdin: &str) -> SandboxJob {
    job_with_limits(language_id, source, stdin, default_limits())
}

pub fn job_tight(language_id: u32, source: &str) -> SandboxJob {
    job_with_limits(language_id, source, "", tight_limits())
}

pub fn job_with_limits(
    language_id: u32,
    source: &str,
    stdin: &str,
    limits: ResourceLimits,
) -> SandboxJob {
    SandboxJob {
        token: Token::new(),
        language: spec(language_id),
        source_code: Bytes::from(source.to_owned()),
        stdin: Bytes::from(stdin.to_owned()),
        limits,
        cached_binary: None,
    }
}

pub async fn run(job: SandboxJob) -> SandboxResult {
    SANDBOX
        .execute(job)
        .await
        .expect("sandbox execute should not return SandboxError in edge-case tests")
}

#[allow(dead_code)]
pub async fn run_fallible(job: SandboxJob) -> Result<SandboxResult, SandboxError> {
    SANDBOX.execute(job).await
}

// Language IDs — kept here so tests don't hardcode magic numbers.
pub const PYTHON: u32 = 71;
pub const NODE: u32 = 63;
pub const C: u32 = 48;
pub const CPP: u32 = 52;
pub const GO: u32 = 60;
pub const RUST: u32 = 73;
pub const JAVA: u32 = 62;

// v1.5 Batch A — scripting languages
pub const BASH: u32 = 100;
pub const LUA: u32 = 101;
pub const PERL: u32 = 102;
pub const RUBY: u32 = 103;
pub const R: u32 = 104;
pub const PHP: u32 = 105;
pub const TYPESCRIPT: u32 = 106;

// v1.5 Batch B — compiled systems languages
pub const FORTRAN: u32 = 110;
pub const PASCAL: u32 = 111;
pub const D_LANG: u32 = 112;
pub const OBJECTIVE_C: u32 = 113;
pub const ASSEMBLY: u32 = 114;
pub const ADA: u32 = 115;

// v1.5 Batch C — JVM languages
pub const KOTLIN: u32 = 120;
pub const SCALA: u32 = 121;
pub const GROOVY: u32 = 122;
pub const CLOJURE: u32 = 123;

// v1.5 Batch D — functional / academic languages
pub const HASKELL: u32 = 130;
pub const OCAML: u32 = 131;
pub const ERLANG: u32 = 132;
pub const ELIXIR: u32 = 133;
pub const COMMON_LISP: u32 = 134;

// v1.5 Batch E — .NET languages
pub const CSHARP: u32 = 140;
pub const FSHARP: u32 = 141;

// v1.5 Batch F — legacy / niche
pub const COBOL: u32 = 150;
pub const PROLOG: u32 = 151;
pub const SWIFT: u32 = 152;
pub const OCTAVE: u32 = 153;
pub const SQL: u32 = 154;

// v1.5 Batch G — modern compiled
// Zig (160) removed — compiler can't run in the sandbox (tmpfs rename EXDEV).
pub const NIM: u32 = 161;
pub const CRYSTAL: u32 = 162;
pub const DART: u32 = 163;
pub const JULIA: u32 = 164;
