-- =============================================================================
-- Phase 2B safety correction.
--
-- 1. Source traceability — every imported row must reference its source file.
-- 2. Insurance UNIQUE rebuild — `(identity_number, policy_number, member_number,
--    start_date)` so group plans where many employees share a policy_number
--    can coexist (group medical insurance is the common case).
-- 3. source_files gains parser_version, uploaded_by, extraction_confidence,
--    and r2_object_key (the R2 storage key — null until uploaded to R2).
--
-- Phase-1 / 2A migrations are NOT edited.
-- =============================================================================

-- ---- source_files extensions ------------------------------------------------
ALTER TABLE source_files ADD COLUMN parser_version       TEXT NOT NULL DEFAULT '0';
ALTER TABLE source_files ADD COLUMN uploaded_by          TEXT NOT NULL DEFAULT '';
ALTER TABLE source_files ADD COLUMN extraction_confidence REAL;
ALTER TABLE source_files ADD COLUMN r2_object_key        TEXT;
ALTER TABLE source_files ADD COLUMN r2_stored            INTEGER NOT NULL DEFAULT 0; -- 0/1

-- ---- traceability columns on every imported entity --------------------------
ALTER TABLE employees           ADD COLUMN source_file_id TEXT REFERENCES source_files(hash);
ALTER TABLE contracts           ADD COLUMN source_file_id TEXT REFERENCES source_files(hash);
ALTER TABLE insurance_policies  ADD COLUMN source_file_id TEXT REFERENCES source_files(hash);
ALTER TABLE employee_number_history ADD COLUMN source_file_id TEXT REFERENCES source_files(hash);

CREATE INDEX IF NOT EXISTS idx_employees_source ON employees(source_file_id);
CREATE INDEX IF NOT EXISTS idx_contracts_source ON contracts(source_file_id);
CREATE INDEX IF NOT EXISTS idx_insurance_source ON insurance_policies(source_file_id);

-- ---- audit_events extension -------------------------------------------------
-- Make it explicit that an audit row can pin to a source file (sometimes the
-- target itself is the source — we still want a separate column for queries).
ALTER TABLE audit_events ADD COLUMN source_file_id TEXT REFERENCES source_files(hash);
ALTER TABLE audit_events ADD COLUMN job_id         TEXT REFERENCES import_jobs(id);
CREATE INDEX IF NOT EXISTS idx_audit_job    ON audit_events(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_source ON audit_events(source_file_id);

-- ---- insurance_policies UNIQUE rebuild --------------------------------------
-- D1/SQLite cannot DROP a table-level UNIQUE constraint, so we rebuild.
-- New canonical key supports group medical insurance: many employees may share
-- a `policy_number`, but each (identity, policy, member, start_date) is unique.
-- Empty strings stand in for NULLs so SQLite's NULL-distinct semantics don't
-- accidentally allow duplicates.

CREATE TABLE insurance_policies_v2 (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT REFERENCES employees(id) ON DELETE SET NULL,
  identity_number     TEXT,
  policy_number       TEXT NOT NULL,
  member_number       TEXT,
  provider            TEXT NOT NULL,
  start_date          TEXT NOT NULL,
  end_date            TEXT,
  status              TEXT NOT NULL CHECK (status IN ('active', 'expired', 'missing')),
  matched             INTEGER NOT NULL DEFAULT 0,
  unmatched_reason    TEXT,
  source_file_id      TEXT REFERENCES source_files(hash),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO insurance_policies_v2 (
  id, employee_id, identity_number, policy_number, member_number,
  provider, start_date, end_date, status, matched, unmatched_reason,
  source_file_id, created_at
)
SELECT
  id, employee_id, identity_number, policy_number, NULL,
  provider, start_date, end_date, status, matched, unmatched_reason,
  source_file_id, created_at
FROM insurance_policies;

DROP TABLE insurance_policies;
ALTER TABLE insurance_policies_v2 RENAME TO insurance_policies;

CREATE INDEX IF NOT EXISTS idx_insurance_employee ON insurance_policies(employee_id);
CREATE INDEX IF NOT EXISTS idx_insurance_identity ON insurance_policies(identity_number);
CREATE INDEX IF NOT EXISTS idx_insurance_status   ON insurance_policies(status);
CREATE INDEX IF NOT EXISTS idx_insurance_source   ON insurance_policies(source_file_id);

-- Canonical uniqueness: per-person-per-policy-period. SQLite supports
-- expressions inside CREATE UNIQUE INDEX but not inside inline UNIQUE on a
-- table. COALESCE casts NULL → '' so SQLite's NULL-distinct semantics don't
-- accidentally allow duplicates of `(NULL, policy, NULL, date)` rows.
CREATE UNIQUE INDEX idx_insurance_unique_v2
  ON insurance_policies (
    COALESCE(identity_number, ''),
    policy_number,
    COALESCE(member_number, ''),
    start_date
  );

-- ---- review reasons get a stricter enumeration too --------------------------
-- (kept as TEXT to stay compatible; just documenting the canonical set here)
-- 'missing_identity', 'duplicate_identity_in_file', 'conflicting_employee_number',
-- 'unmatched_contract', 'unmatched_insurance', 'low_confidence_extraction',
-- 'group_insurance_member_missing'
