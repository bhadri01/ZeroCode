use chrono::{DateTime, Utc};
use sqlx::PgPool;
use sqlx::Row;
use thiserror::Error;

use crate::key::CacheKey;

#[derive(Debug, Error)]
pub enum CompileCacheError {
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

/// A previously compiled binary keyed on (language_id, source, compile_options).
/// Stored as a `BYTEA` in Postgres; small enough at the language scale we
/// support to fit in TOAST without external storage.
#[derive(Debug, Clone)]
pub struct CompileArtifact {
    pub key: CacheKey,
    pub language_id: u32,
    pub binary: Vec<u8>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct CompileCache {
    pool: PgPool,
}

impl CompileCache {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, key: &CacheKey) -> Result<Option<CompileArtifact>, CompileCacheError> {
        // Runtime-checked query — avoids requiring a live DB at `cargo check` time.
        // We'll switch to the `query_as!` macro once CI provisions a Postgres
        // for compile-time validation.
        let row = sqlx::query(
            "SELECT language_id, binary, created_at \
             FROM compile_artifacts \
             WHERE key = $1",
        )
        .bind(key.as_bytes().as_slice())
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| CompileArtifact {
            key: *key,
            language_id: r.get::<i32, _>("language_id") as u32,
            binary: r.get::<Vec<u8>, _>("binary"),
            created_at: r.get::<DateTime<Utc>, _>("created_at"),
        }))
    }

    pub async fn insert(
        &self,
        key: CacheKey,
        language_id: u32,
        binary: Vec<u8>,
    ) -> Result<(), CompileCacheError> {
        sqlx::query(
            "INSERT INTO compile_artifacts (key, language_id, binary, created_at) \
             VALUES ($1, $2, $3, NOW()) \
             ON CONFLICT (key) DO NOTHING",
        )
        .bind(key.as_bytes().as_slice())
        .bind(language_id as i32)
        .bind(binary)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Evict rows older than `cutoff`. Called periodically by the retention job.
    pub async fn purge_before(
        &self,
        cutoff: DateTime<Utc>,
    ) -> Result<u64, CompileCacheError> {
        let res = sqlx::query("DELETE FROM compile_artifacts WHERE created_at < $1")
            .bind(cutoff)
            .execute(&self.pool)
            .await?;
        Ok(res.rows_affected())
    }
}
