-- Initial ZeroCode schema. Phase 0.
--
-- Three tables:
--   languages          — registry of LanguageSpec entries (mirrored from runners/languages.toml on boot)
--   submissions        — the public-facing row created on POST /v1/submissions
--   compile_artifacts  — content-addressed binary cache (Phase 4.6)

CREATE TABLE IF NOT EXISTS languages (
    id           INT PRIMARY KEY,
    name         TEXT NOT NULL,
    version      TEXT NOT NULL,
    source_file  TEXT NOT NULL,
    compile_cmd  TEXT[],
    run_cmd      TEXT[] NOT NULL,
    env          JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
    id              BIGSERIAL PRIMARY KEY,
    token           TEXT NOT NULL UNIQUE,
    language_id     INT NOT NULL REFERENCES languages(id),

    -- inputs
    source_code     BYTEA NOT NULL,
    stdin           BYTEA,

    -- limits applied (resolved at submission time, not re-read)
    cpu_time_limit  REAL NOT NULL,
    wall_time_limit REAL NOT NULL,
    memory_limit_mb INT  NOT NULL,
    max_pids        INT  NOT NULL DEFAULT 64,

    -- lifecycle
    status          TEXT NOT NULL,
    status_detail   JSONB,

    -- outcomes
    stdout          BYTEA,
    stderr          BYTEA,
    compile_output  BYTEA,
    exit_code       INT,
    signal          INT,
    cpu_time        REAL,
    wall_time       REAL,
    memory_kb       INT,

    -- callback + idempotency
    callback_url        TEXT,
    callback_status     TEXT,
    idempotency_key     TEXT,
    idempotency_hash    BYTEA,

    -- claim management (worker crash recovery)
    claimed_at      TIMESTAMPTZ,
    worker_id       TEXT,

    -- timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS submissions_token_idx
    ON submissions (token);
CREATE INDEX IF NOT EXISTS submissions_idem_idx
    ON submissions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS submissions_inflight_idx
    ON submissions (status, claimed_at)
    WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS submissions_created_idx
    ON submissions (created_at);

CREATE TABLE IF NOT EXISTS compile_artifacts (
    key         BYTEA PRIMARY KEY,    -- blake3 cache key from CacheKey::compile
    language_id INT NOT NULL REFERENCES languages(id),
    binary      BYTEA NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compile_artifacts_created_idx
    ON compile_artifacts (created_at);
