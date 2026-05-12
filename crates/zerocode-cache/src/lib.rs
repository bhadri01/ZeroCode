//! Two caches keep the hot path off the worker:
//!
//! - [`ResultCache`] — in-process LRU of completed `Submission` rows, keyed on
//!   the content hash of `(language_id, source, stdin, limits)`. A submission
//!   that has been seen recently bypasses the queue entirely.
//! - [`CompileCache`] — Postgres-backed cache of compiled binaries, keyed on
//!   `(language_id, source)`. Compiled languages (Rust, Go, C/C++, Java) skip
//!   the compile sandbox phase when a row exists.
//!
//! Both caches are *optional optimisations* — the worker remains correct if
//! both are turned off (e.g. for benchmarking the uncached path).

pub mod compile;
pub mod key;
pub mod result;

pub use compile::{CompileArtifact, CompileCache};
pub use key::CacheKey;
pub use result::{CachedOutcome, ResultCache};
