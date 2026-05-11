-- =============================================================================
-- Phase 2B — additive schema deltas for the real commit pipeline.
-- Pure ADD COLUMN — never drops or rewrites Phase 1/2A tables.
--
-- Tracks:
--   * when/who committed each import job
--   * which job items were actually executed (for idempotent re-commits)
--   * how each review_queue item was resolved (for audit trail)
-- =============================================================================

ALTER TABLE import_jobs ADD COLUMN committed_at TEXT;
ALTER TABLE import_jobs ADD COLUMN committed_by TEXT;

ALTER TABLE import_job_items ADD COLUMN committed_action TEXT;
ALTER TABLE import_job_items ADD COLUMN committed_at TEXT;
ALTER TABLE import_job_items ADD COLUMN committed_target_id TEXT;
ALTER TABLE import_job_items ADD COLUMN error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_job_items_committed
  ON import_job_items(job_id, committed_at);

ALTER TABLE review_queue ADD COLUMN resolution TEXT;
ALTER TABLE review_queue ADD COLUMN resolved_by TEXT;
ALTER TABLE review_queue ADD COLUMN resolved_at TEXT;
ALTER TABLE review_queue ADD COLUMN linked_target_id TEXT;
