-- migrations/0001_init.sql
-- Initial schema for HR Contracts Dashboard production database (Cloudflare D1).
--
-- Identity-centric data model:
--   * IdentityNumber (Iqama / National ID) is the ONLY primary person key.
--   * EmployeeNumber is history/secondary.
--   * Name is never a match key.
--
-- All UPSERT logic lives in functions/lib/hrUpsert.js. Schema enforces
-- only the structural invariants (PRIMARY KEYs, UNIQUE constraints, NOT NULLs).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. import_jobs — one row per Commit Import operation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_jobs (
  id                            TEXT PRIMARY KEY,
  source                        TEXT,                     -- 'admin-import' | 'api' | etc.
  status                        TEXT,                     -- 'pending' | 'committed' | 'rolled_back'
  imported_at                   TEXT,                     -- when files were uploaded/parsed
  committed_at                  TEXT,                     -- when commit succeeded
  employee_rows                 INTEGER DEFAULT 0,
  insurance_rows                INTEGER DEFAULT 0,
  pdf_files                     INTEGER DEFAULT 0,
  contracts_extracted           INTEGER DEFAULT 0,
  matched_contracts             INTEGER DEFAULT 0,
  contract_only                 INTEGER DEFAULT 0,
  review_queue_count            INTEGER DEFAULT 0,
  created_persons               INTEGER DEFAULT 0,
  updated_persons               INTEGER DEFAULT 0,
  unchanged_persons             INTEGER DEFAULT 0,
  new_contracts                 INTEGER DEFAULT 0,
  updated_contracts             INTEGER DEFAULT 0,
  skipped_duplicate_contracts   INTEGER DEFAULT 0,
  employee_number_changed       INTEGER DEFAULT 0,
  created_insurance             INTEGER DEFAULT 0,
  updated_insurance             INTEGER DEFAULT 0,
  blocked_rows                  INTEGER DEFAULT 0,
  created_by                    TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status_committed_at
  ON import_jobs(status, committed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. persons — primary identity record
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persons (
  id                       TEXT PRIMARY KEY,
  identity_number          TEXT UNIQUE NOT NULL,
  name_en                  TEXT,
  name_ar                  TEXT,
  nationality              TEXT,
  date_of_birth            TEXT,
  mobile                   TEXT,
  email                    TEXT,
  iban                     TEXT,
  latest_employee_number   TEXT,
  source                   TEXT,
  created_at               TEXT,
  updated_at               TEXT
);
CREATE INDEX IF NOT EXISTS idx_persons_latest_emp_no ON persons(latest_employee_number);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. employee_snapshots — current/historical employment record per import
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_snapshots (
  id                   TEXT PRIMARY KEY,
  person_id            TEXT NOT NULL,
  identity_number      TEXT NOT NULL,
  employee_number      TEXT,
  job_title            TEXT,
  department           TEXT,
  project              TEXT,
  status               TEXT,
  snapshot_job_id      TEXT,
  created_at           TEXT,
  FOREIGN KEY (person_id)       REFERENCES persons(id)            ON DELETE CASCADE,
  FOREIGN KEY (snapshot_job_id) REFERENCES import_jobs(id)        ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_emp_snap_person      ON employee_snapshots(person_id);
CREATE INDEX IF NOT EXISTS idx_emp_snap_identity    ON employee_snapshots(identity_number);
CREATE INDEX IF NOT EXISTS idx_emp_snap_job         ON employee_snapshots(snapshot_job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. employee_number_history — every (identity, empNo) pair seen across imports
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_number_history (
  id                  TEXT PRIMARY KEY,
  person_id           TEXT NOT NULL,
  identity_number     TEXT NOT NULL,
  employee_number     TEXT NOT NULL,
  first_seen_job_id   TEXT,
  last_seen_job_id    TEXT,
  first_seen_at       TEXT,
  last_seen_at        TEXT,
  UNIQUE (identity_number, employee_number),
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_emp_no_history_person ON employee_number_history(person_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. contracts — extracted from PDFs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                   TEXT PRIMARY KEY,
  person_id            TEXT,
  identity_number      TEXT NOT NULL,
  employee_number      TEXT,
  contract_number      TEXT,
  contract_type        TEXT,
  start_date           TEXT,
  end_date             TEXT,
  contract_end_type    TEXT,                  -- 'FIXED' | 'OPEN_ENDED' | NULL
  joining_date         TEXT,
  duration_years       TEXT,
  salary_basic         REAL,
  salary_total         REAL,
  iban                 TEXT,
  mobile               TEXT,
  email                TEXT,
  parser_type          TEXT,                  -- 'old-aafaq' | 'old-arabic-only' | 'new-qiwa' | etc.
  confidence_score     REAL,
  source_file_name     TEXT,
  source_file_hash     TEXT,
  contract_key         TEXT UNIQUE,           -- hash(identity + contractNo + start + end/openEnded)
  import_job_id        TEXT,
  created_at           TEXT,
  updated_at           TEXT,
  FOREIGN KEY (person_id)      REFERENCES persons(id)     ON DELETE SET NULL,
  FOREIGN KEY (import_job_id)  REFERENCES import_jobs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_identity      ON contracts(identity_number);
CREATE INDEX IF NOT EXISTS idx_contracts_person        ON contracts(person_id);
CREATE INDEX IF NOT EXISTS idx_contracts_import_job    ON contracts(import_job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. insurance_records — Bupa medical roster
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_records (
  id                  TEXT PRIMARY KEY,
  person_id           TEXT,
  identity_number     TEXT,
  main_member_id      TEXT,
  staff_number        TEXT,
  member_name         TEXT,
  policy_no           TEXT,
  class_name          TEXT,
  effective_date      TEXT,
  expiry_date         TEXT,
  import_job_id       TEXT,
  created_at          TEXT,
  updated_at          TEXT,
  FOREIGN KEY (person_id)     REFERENCES persons(id)     ON DELETE SET NULL,
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_insurance_identity    ON insurance_records(identity_number);
CREATE INDEX IF NOT EXISTS idx_insurance_main_member ON insurance_records(main_member_id);
CREATE INDEX IF NOT EXISTS idx_insurance_staff       ON insurance_records(staff_number);
CREATE INDEX IF NOT EXISTS idx_insurance_import_job  ON insurance_records(import_job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. review_queue — rows that require manual reconciliation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_queue (
  id                  TEXT PRIMARY KEY,
  import_job_id       TEXT,
  entity_type         TEXT,                  -- 'employee' | 'contract' | 'insurance'
  severity            TEXT,                  -- 'critical' | 'warning' | 'info'
  reason              TEXT,
  identity_number     TEXT,
  employee_number     TEXT,
  source_file_name    TEXT,
  payload_json        TEXT,                  -- JSON-encoded full payload for review UI
  status              TEXT DEFAULT 'open',   -- 'open' | 'resolved' | 'dismissed'
  created_at          TEXT,
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_review_status_severity ON review_queue(status, severity);
CREATE INDEX IF NOT EXISTS idx_review_import_job      ON review_queue(import_job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. import_audit_log — every create/update/skip with old+new value snapshots
--    (powers POST /api/hr/import/rollback/:importJobId)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_audit_log (
  id                  TEXT PRIMARY KEY,
  import_job_id       TEXT,
  entity_type         TEXT,                  -- 'person' | 'employee_snapshot' | 'contract' | 'insurance' | 'employee_number_history'
  entity_id           TEXT,
  action              TEXT,                  -- 'create' | 'update' | 'skip-duplicate' | 'review-queue' | 'block'
  match_key           TEXT,
  old_value_json      TEXT,
  new_value_json      TEXT,
  reason              TEXT,
  created_at          TEXT,
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_import_job ON import_audit_log(import_job_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON import_audit_log(entity_type, entity_id);
