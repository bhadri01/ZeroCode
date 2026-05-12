use blake3::Hasher;
use zerocode_core::{LanguageId, ResourceLimits};

/// 32-byte content hash used as both the cache key and the row identifier in
/// the Postgres compile-artifact table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CacheKey([u8; 32]);

impl CacheKey {
    /// Full key — for `ResultCache`. Includes resource limits because two
    /// otherwise-identical submissions with different limits should not share
    /// a cached outcome (a TLE row should not be served to a request with a
    /// generous time budget).
    pub fn result(
        language_id: LanguageId,
        source: &[u8],
        stdin: &[u8],
        limits: &ResourceLimits,
    ) -> Self {
        let mut h = Hasher::new();
        h.update(b"zerocode/result/v1\0");
        h.update(&language_id.to_le_bytes());
        h.update(&(source.len() as u64).to_le_bytes());
        h.update(source);
        h.update(&(stdin.len() as u64).to_le_bytes());
        h.update(stdin);
        // canonical limits encoding: order matters and matches the struct field order
        h.update(&limits.cpu_time.to_le_bytes());
        h.update(&limits.wall_time.to_le_bytes());
        h.update(&limits.memory_mb.to_le_bytes());
        h.update(&limits.max_pids.to_le_bytes());
        h.update(&limits.max_stdout.to_le_bytes());
        h.update(&limits.max_stderr.to_le_bytes());
        h.update(&[u8::from(limits.enable_network)]);
        Self(*h.finalize().as_bytes())
    }

    /// Compile key — for `CompileCache`. Excludes stdin and runtime limits;
    /// includes a compile_options hint so different compile flags produce
    /// different cache entries.
    pub fn compile(language_id: LanguageId, source: &[u8], compile_options: &[u8]) -> Self {
        let mut h = Hasher::new();
        h.update(b"zerocode/compile/v1\0");
        h.update(&language_id.to_le_bytes());
        h.update(&(source.len() as u64).to_le_bytes());
        h.update(source);
        h.update(&(compile_options.len() as u64).to_le_bytes());
        h.update(compile_options);
        Self(*h.finalize().as_bytes())
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn result_key_is_deterministic() {
        let lim = ResourceLimits::default();
        let a = CacheKey::result(71, b"print(1)", b"", &lim);
        let b = CacheKey::result(71, b"print(1)", b"", &lim);
        assert_eq!(a, b);
    }

    #[test]
    fn result_key_changes_with_limits() {
        let lim1 = ResourceLimits::default();
        let mut lim2 = lim1;
        lim2.memory_mb += 1;
        assert_ne!(
            CacheKey::result(71, b"print(1)", b"", &lim1),
            CacheKey::result(71, b"print(1)", b"", &lim2),
        );
    }

    #[test]
    fn compile_key_independent_of_stdin_and_limits() {
        let a = CacheKey::compile(73, b"fn main() {}", b"");
        let b = CacheKey::compile(73, b"fn main() {}", b"");
        assert_eq!(a, b);
    }
}
