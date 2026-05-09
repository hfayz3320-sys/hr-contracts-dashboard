-- migrations/0002_private_file_storage.sql
--
-- Adds bookkeeping for raw source files stored privately in R2.
--   * Each contract row remembers the R2 object key for its source PDF
--     (and a SHA-256 hash so re-uploads can be detected).
--   * Each import_jobs row remembers the bucket and key for the master
--     Excel + insurance Excel that drove the import.
--
-- These columns are nullable / default 0 so existing rows from
-- migration 0001 keep working unchanged.

-- ─── contracts: per-row file pointer ─────────────────────────────────────────
-- (source_file_name + source_file_hash already exist from 0001; only add R2 cols.)
ALTER TABLE contracts ADD COLUMN r2_object_key       TEXT;
ALTER TABLE contracts ADD COLUMN has_private_file    INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_contracts_r2_key ON contracts(r2_object_key);

-- ─── import_jobs: per-job file pointers ──────────────────────────────────────
ALTER TABLE import_jobs ADD COLUMN employee_file_r2_key  TEXT;
ALTER TABLE import_jobs ADD COLUMN insurance_file_r2_key TEXT;
ALTER TABLE import_jobs ADD COLUMN raw_files_bucket      TEXT;
ALTER TABLE import_jobs ADD COLUMN raw_files_count       INTEGER NOT NULL DEFAULT 0;
