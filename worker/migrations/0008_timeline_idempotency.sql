-- ============================================================================
-- 0008_timeline_idempotency.sql
--
-- Hotfix follow-up to Phase 10. Adds a nullable UNIQUE `idempotency_key`
-- column to `employee_timeline_entries` so the worker can reject duplicate
-- POST /api/employees/:id/messages and POST /api/employees/:id/notes that
-- would otherwise produce duplicate rows on:
--   - double-click in the modal Send button
--   - React Query / fetch retry on transient network error
--   - React 18 strict-mode double effect dispatch in dev
--
-- Idempotency contract (per /api/employees/:id/messages and /notes):
--   - `Idempotency-Key` header omitted/null → every request creates a new row
--   - same header twice in a row                → second request is a no-op;
--     the original row is returned with HTTP 200
--   - different header                          → fresh row
--
-- Safety:
--   - CREATE/ALTER are IF NOT EXISTS / idempotent for re-application.
--   - SQLite treats multiple NULLs as distinct under a UNIQUE constraint,
--     so existing rows (key=NULL) are not affected.
--   - No data backfill.
-- ============================================================================

ALTER TABLE employee_timeline_entries ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_timeline_idempotency
  ON employee_timeline_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
