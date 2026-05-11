-- =============================================================================
-- Phase 2A — initial D1 schema for HR Contracts Dashboard V2
--
-- Hard rules enforced by the schema:
--   * identity_number (Iqama) is the PRIMARY match key on employees (UNIQUE).
--   * EmployeeNumber lives in employee_number_history only — never on employees.
--   * Contracts UNIQUE (identity_number, contract_type, start_date, end_date,
--     file_hash) so re-importing the same data is a no-op (idempotent).
--   * Insurance UNIQUE (policy_number, start_date).
--   * source_files PK is the SHA-256 content hash → idempotent uploads.
--   * import_jobs.idempotency_key UNIQUE → safe retries.
--   * audit_events is append-only (no UPDATE/DELETE in app code).
-- =============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id                  TEXT PRIMARY KEY,
  identity_number     TEXT NOT NULL UNIQUE,
  full_name           TEXT NOT NULL,
  full_name_arabic    TEXT,
  department          TEXT,
  job_title           TEXT,
  nationality         TEXT,
  date_of_birth       TEXT,
  hire_date           TEXT,
  status              TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employees_identity ON employees(identity_number);
CREATE INDEX IF NOT EXISTS idx_employees_status   ON employees(status);

CREATE TABLE IF NOT EXISTS employee_number_history (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  number       TEXT NOT NULL,
  from_date    TEXT NOT NULL,
  to_date      TEXT,
  UNIQUE(employee_id, number, from_date)
);
CREATE INDEX IF NOT EXISTS idx_emp_num_employee ON employee_number_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_num_number   ON employee_number_history(number);

CREATE TABLE IF NOT EXISTS contracts (
  id                       TEXT PRIMARY KEY,
  employee_id              TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  identity_number          TEXT NOT NULL,
  contract_type            TEXT NOT NULL,
  start_date               TEXT NOT NULL,
  end_date                 TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('active', 'expiring', 'expired')),
  version                  INTEGER NOT NULL DEFAULT 1,
  version_of               TEXT REFERENCES contracts(id),
  file_hash                TEXT NOT NULL,
  filename                 TEXT NOT NULL,
  extraction_confidence    REAL,
  notes                    TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(identity_number, contract_type, start_date, end_date, file_hash)
);
CREATE INDEX IF NOT EXISTS idx_contracts_employee ON contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_identity ON contracts(identity_number);
CREATE INDEX IF NOT EXISTS idx_contracts_status   ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end      ON contracts(end_date);

CREATE TABLE IF NOT EXISTS contract_versions (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  file_hash    TEXT NOT NULL,
  filename     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contract_id, version)
);

CREATE TABLE IF NOT EXISTS insurance_policies (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT REFERENCES employees(id) ON DELETE SET NULL,
  identity_number     TEXT,
  policy_number       TEXT NOT NULL,
  provider            TEXT NOT NULL,
  start_date          TEXT NOT NULL,
  end_date            TEXT,
  status              TEXT NOT NULL CHECK (status IN ('active', 'expired', 'missing')),
  matched             INTEGER NOT NULL DEFAULT 0,
  unmatched_reason    TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(policy_number, start_date)
);
CREATE INDEX IF NOT EXISTS idx_insurance_employee ON insurance_policies(employee_id);
CREATE INDEX IF NOT EXISTS idx_insurance_identity ON insurance_policies(identity_number);
CREATE INDEX IF NOT EXISTS idx_insurance_status   ON insurance_policies(status);

CREATE TABLE IF NOT EXISTS import_jobs (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('employees', 'insurance', 'contracts')),
  filename          TEXT NOT NULL,
  source_hash       TEXT,
  status            TEXT NOT NULL CHECK (status IN ('queued', 'running', 'review', 'committed', 'failed')),
  idempotency_key   TEXT UNIQUE,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at       TEXT,
  triggered_by      TEXT NOT NULL,
  counts_created    INTEGER NOT NULL DEFAULT 0,
  counts_updated    INTEGER NOT NULL DEFAULT 0,
  counts_skipped    INTEGER NOT NULL DEFAULT 0,
  counts_review     INTEGER NOT NULL DEFAULT 0,
  counts_error      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON import_jobs(status);

CREATE TABLE IF NOT EXISTS source_files (
  hash             TEXT PRIMARY KEY,
  filename         TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('xlsx', 'pdf')),
  size             INTEGER NOT NULL,
  uploaded_at      TEXT NOT NULL DEFAULT (datetime('now')),
  import_job_id    TEXT REFERENCES import_jobs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_job_items (
  id                TEXT PRIMARY KEY,
  job_id            TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_index         INTEGER,
  identity_number   TEXT,
  raw_payload       TEXT NOT NULL,
  resolved_action   TEXT CHECK (resolved_action IN ('create', 'update', 'skip', 'review', 'error')),
  target_id         TEXT,
  diff              TEXT,
  reason            TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_items_job ON import_job_items(job_id);

CREATE TABLE IF NOT EXISTS review_queue (
  id                TEXT PRIMARY KEY,
  reason            TEXT NOT NULL,
  entity            TEXT NOT NULL CHECK (entity IN ('employee', 'contract', 'insurance')),
  description       TEXT NOT NULL,
  details           TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  import_job_id     TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
  payload           TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_status ON review_queue(status);

CREATE TABLE IF NOT EXISTS audit_events (
  id        TEXT PRIMARY KEY,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  target    TEXT NOT NULL,
  status    TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
  details   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
