use std::path::PathBuf;
use std::sync::{Arc, LazyLock};

use bytes::Bytes;
use zerocode_core::{LanguageRegistry, LanguageSpec, ResourceLimits, Token};
use zerocode_sandbox::{Sandbox, SandboxJob, SandboxResult, SandboxError};
use zerocode_sandbox::{NativeSandbox, NativeSandboxConfig};

static REGISTRY: LazyLock<LanguageRegistry> = LazyLock::new(|| {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../runners/languages.toml");
    let toml = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
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
