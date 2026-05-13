-- v2: test-case batching.
--
-- A `batch` is a logical group of submissions sharing one `batch_id` ULID.
-- Each test case is still its own submission row: the worker semantics, the
-- result cache, the sweeper, and the retention enforcer all keep working
-- without any change. The aggregation endpoint joins on `batch_id`.

ALTER TABLE submissions
    ADD COLUMN batch_id TEXT;

-- Partial index: only batched rows are indexed. NULL is the common case
-- (single-shot submissions); the index footprint stays small.
CREATE INDEX IF NOT EXISTS submissions_batch_idx
    ON submissions (batch_id)
    WHERE batch_id IS NOT NULL;
