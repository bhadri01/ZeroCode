-- Add enable_network flag to submissions.
-- Defaults to FALSE (sandbox blocks all network by default).
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS enable_network BOOLEAN NOT NULL DEFAULT FALSE;
