-- =============================================================================
-- Phase 4A — Employee 360 ledger tables.
--
-- Strictly additive: two new tables. NO ALTER on existing tables, NO data
-- migration. Existing 501 employees / 328 contracts / 475 insurance rows are
-- untouched. After apply the two new tables are EMPTY; rows are written by
-- HR-manager / admin actions in subsequent phases.
--
-- File is NOT applied yet. Sits in `worker/migrations/` so that the FE/worker
-- code can refer to the canonical schema while a separate operator step
-- (`wrangler d1 migrations apply hr_contracts_db_v2 --remote`) is gated on
-- explicit review.
--
-- DESIGN NOTES
-- ============
--
-- Identity discipline is preserved: every row in both tables has a FK to
-- employees(id), which itself has `identity_number` (Iqama) as its UNIQUE
-- primary match key.
--
-- Status / is_current / review_required pattern
-- ---------------------------------------------
--   * status   — STORED workflow state of the row, set by HR (or by the
--                import pipeline at commit time). For documents:
--                  'active' | 'expired' | 'archived' | 'review_required'
--                For transactions:
--                  'requested' | 'approved' | 'rejected' | 'in_progress' |
--                  'completed' | 'cancelled'
--
--                IMPORTANT — `employee_documents.status` is NOT the truth
--                read by dashboards or UI badges. The same drift problem
--                that bit insurance in Phase 3C-1 (stored 'active' silently
--                outliving its expiry date) applies here. The worker
--                ALWAYS attaches a `computedStatus` derived at read time
--                from (status, is_current, review_required, expires_at,
--                type-required fields) via
--                `worker/src/lib/employee-document-status.ts`. Consumers
--                MUST use `computedStatus`. The stored column is kept
--                because HR may manually transition a row (archive
--                button, mark review required, etc.) and those manual
--                states are the input to the compute, not the output.
--
--   * is_current INTEGER (0/1) — only on documents. Whether THIS row is the
--                                 employee's current document of its type.
--                                 Historical docs (is_current=0) are unlimited;
--                                 partial UNIQUE INDEX enforces one current
--                                 row per (employee_id, type).
--   * review_required / review_reason — manual-review flag with a free-text
--                                       reason. Independent of `status` so a
--                                       row can be `status=active` AND
--                                       `review_required=1` (e.g. flagged for
--                                       re-verification after parser changes).
--                                       Feeds `computedStatus` for documents
--                                       (review_required forces the computed
--                                       value).
--   * verified_at / verified_by — manual verification audit (HR-manager saw
--                                  the original document).
--
-- Uniqueness with nullable doc_number
-- -----------------------------------
-- A previous draft used `UNIQUE (employee_id, type, doc_number)` but SQLite
-- treats NULL as not-equal to NULL, so two rows like
--   (emp_1, 'passport', NULL), (emp_1, 'passport', NULL)
-- would both insert. We avoid that pitfall by:
--   1. NOT using doc_number in the uniqueness rule at all (it's metadata, not
--      a match key — the employee + type + is_current carries the meaning).
--   2. Enforcing one-current-per-(employee,type) via a PARTIAL UNIQUE INDEX
--      `WHERE is_current = 1`. Historical (superseded) docs are unlimited.
--
-- Transaction idempotency
-- -----------------------
-- `idempotency_key` is OPTIONAL and UNIQUE when non-NULL. SQLite treats
-- multiple NULL values as distinct, so NULL keys never collide. The
-- canonical contract enforced at the API layer (not the DB):
--
--   1. NULL idempotency_key       → every request creates a new row.
--   2. Same key + same canonical  → API returns the existing row with
--      request body                  HTTP 200 (exactly-once retry).
--   3. Same key + different       → API returns HTTP 409 Conflict; the
--      canonical body                stored row is NOT updated.
--
-- "Canonical body" is the request fields that participate in the equality
-- check: type, status, title, effectiveDate, endDate, amount, currency,
-- refNumber, payload, payloadSchemaVersion, sourceFileId, reviewRequired,
-- reviewReason.
--
-- Fields excluded from the check: metadata, createdBy, updatedBy, the
-- idempotency_key itself, timestamps.
--
-- See `shared/api-contract.ts → employeeTransactionIdempotencyEqualityKeys`
-- for the authoritative list. The hash function lives in
-- `worker/src/lib/idempotency.ts` (added in A2).
-- =============================================================================


-- ---- employee_documents ----------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_documents (
  id                     TEXT PRIMARY KEY,
  employee_id            TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Strict enum: types are stable and rare to add. New types require a
  -- migration that extends this CHECK, by intent.
  type                   TEXT NOT NULL CHECK (type IN (
    'iqama',
    'passport',
    'visa',
    'work_permit',
    'contract_pdf',
    'insurance_card',
    'medical_certificate',
    'driving_license',
    'other'
  )),

  -- Identifier visible on the document (Iqama number, passport number, visa
  -- number, …). May be NULL when the operator only has the file but the
  -- number hasn't been transcribed yet. NOT part of any uniqueness rule.
  doc_number             TEXT,

  -- Lifecycle dates.
  issued_at              TEXT,                       -- ISO YYYY-MM-DD
  expires_at             TEXT,                       -- ISO YYYY-MM-DD; drives
                                                     -- dashboard expiry KPIs

  -- Workflow state. `review_required` is the "manual triage" gate; `status`
  -- is the official lifecycle.
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'expired', 'archived', 'review_required'
  )),
  is_current             INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),

  -- Manual verification. NULL until an HR-manager confirms the document.
  verified_at            TEXT,                       -- ISO datetime
  verified_by            TEXT,                       -- actor email

  -- Manual review flag (independent of `status`).
  review_required        INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0, 1)),
  review_reason          TEXT,                       -- free-text

  -- Extraction confidence when the row was created from a parser
  -- (contract PDF parser today; Iqama OCR in the future). NULL for
  -- hand-entered rows.
  extraction_confidence  REAL,                       -- 0.0–1.0

  -- Optional file in R2 (same hash space as `source_files.hash`). NULL
  -- when the document is tracked but the file has not yet been uploaded.
  source_file_id         TEXT REFERENCES source_files(hash),

  -- Type-specific structured extras (issuing country, visa class, etc.).
  -- JSON-stringified; schema enforced per-type at the API boundary.
  metadata               TEXT,

  notes                  TEXT,                       -- free-form

  -- Audit columns — every mutation must set updated_at/by.
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  created_by             TEXT NOT NULL,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by             TEXT NOT NULL
);

-- Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_emp_doc_employee  ON employee_documents (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_doc_type      ON employee_documents (type);
CREATE INDEX IF NOT EXISTS idx_emp_doc_expires   ON employee_documents (expires_at);
CREATE INDEX IF NOT EXISTS idx_emp_doc_status    ON employee_documents (status);
CREATE INDEX IF NOT EXISTS idx_emp_doc_review    ON employee_documents (review_required);
CREATE INDEX IF NOT EXISTS idx_emp_doc_source    ON employee_documents (source_file_id);

-- Partial UNIQUE — at most one current doc per employee+type. Historical
-- rows (is_current = 0) are unlimited. NULL doc_number does NOT participate
-- in the uniqueness rule (it isn't in the index columns).
CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_doc_one_current
  ON employee_documents (employee_id, type)
  WHERE is_current = 1;


-- ---- employee_transactions -------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_transactions (
  id                     TEXT PRIMARY KEY,
  employee_id            TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Free-form TEXT by design (no CHECK enum). The canonical list lives in
  -- TypeScript (`EmployeeTransactionType`) and is enforced at the API
  -- boundary via zod. This keeps adding a new transaction type a code
  -- change (one PR) without needing a D1 migration. Tests cover the full
  -- canonical list so a typo in app code still fails CI.
  type                   TEXT NOT NULL,

  status                 TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'approved', 'rejected',
    'in_progress', 'completed', 'cancelled'
  )),

  -- Short label visible in lists ("Annual leave 12 Aug → 19 Aug").
  title                  TEXT NOT NULL,

  -- Workflow dates. Most transactions have a single effective date; window-ed
  -- ones (vacation, exit-re-entry) also set end_date.
  effective_date         TEXT,                       -- ISO YYYY-MM-DD
  end_date               TEXT,                       -- ISO YYYY-MM-DD

  -- Money columns are optional; filled only when the transaction has
  -- financial impact (ticket cost, allowance change, salary adjustment).
  amount                 REAL,
  currency               TEXT,                       -- 'SAR' / 'USD' / …

  -- External / human reference (PNR, claim number, request ticket ID).
  ref_number             TEXT,

  -- Structured per-type body. JSON-stringified; per-type zod schemas live in
  -- shared/api-contract.ts (flight_ticket → {from,to,pnr,…}, vacation →
  -- {days,balance_before,balance_after}, salary_adjustment →
  -- {oldBasic,newBasic,reason}, …).
  payload                TEXT,
  -- Bumped when the payload contract for the row's `type` changes
  -- incompatibly. Defaults to 1 for everything written today. The API
  -- parser tries the latest schema; if it fails AND the row has an older
  -- version, it falls back to the legacy schema. Lets us evolve without
  -- a forced rewrite of historical rows.
  payload_schema_version INTEGER NOT NULL DEFAULT 1,

  -- Free-form additional admin metadata that doesn't belong in the
  -- structured payload (operator tags, internal ticket links, etc.).
  metadata               TEXT,

  -- Optional anchor to an uploaded file (ticket scan, signed approval).
  source_file_id         TEXT REFERENCES source_files(hash),

  -- Manual review flag — independent of `status`.
  review_required        INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0, 1)),
  review_reason          TEXT,

  -- Idempotency for batch / re-submitted writes. NULL is allowed (one-off
  -- manual entry); when set it must be globally unique. Producers that
  -- want exactly-once semantics compute a stable key per logical row.
  idempotency_key        TEXT UNIQUE,

  -- Audit columns.
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  created_by             TEXT NOT NULL,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by             TEXT NOT NULL
);

-- Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_emp_txn_employee  ON employee_transactions (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_txn_type      ON employee_transactions (type);
CREATE INDEX IF NOT EXISTS idx_emp_txn_status    ON employee_transactions (status);
CREATE INDEX IF NOT EXISTS idx_emp_txn_effective ON employee_transactions (effective_date);
CREATE INDEX IF NOT EXISTS idx_emp_txn_review    ON employee_transactions (review_required);
CREATE INDEX IF NOT EXISTS idx_emp_txn_source    ON employee_transactions (source_file_id);
-- idempotency_key already has an implicit UNIQUE index from the column constraint.
