-- =============================================================================
-- Phase 6A-0 / 6A-1 — HR Configuration Foundation
--
-- 14 new config/master-data tables. STRICTLY ADDITIVE:
--   * CREATE TABLE IF NOT EXISTS only
--   * CREATE INDEX IF NOT EXISTS only
--   * No ALTER on any existing table.
--   * No DROP, no DELETE, no UPDATE.
--   * No mutation of production business rows
--     (employees, contracts, insurance_policies, employee_documents,
--      employee_transactions, audit_events, review_queue, source_files).
--
-- ID vs CODE policy (audited in `tests/migrations/hr-config-schema.test.ts`):
--   * `id`   TEXT PK — internal random identifier (matches existing tables).
--   * `code` TEXT UNIQUE NOT NULL — stable business key in UPPER_SNAKE.
--                                   Used by seed (idempotency), API responses,
--                                   and future cross-environment linkage.
--   * Config-to-config FKs use `id` (relational integrity).
--   * Business-row → config linkage (NOT in this migration) will use `code`
--     so seed re-runs across environments stay safe.
--
-- Audit columns convention (every table in this migration):
--   created_at TEXT NOT NULL DEFAULT (datetime('now'))
--   created_by TEXT NOT NULL
--   updated_at TEXT NOT NULL DEFAULT (datetime('now'))
--   updated_by TEXT NOT NULL
--
-- Active/history convention:
--   active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
--   Rows are NEVER deleted by the API. Retire via PATCH {active:false}.
--
-- Naming conventions (auditable):
--   `name`    TEXT NOT NULL          English display label
--   `name_ar` TEXT                   Arabic display label (nullable)
--   `display_order` INTEGER NOT NULL DEFAULT 0
--
-- Business rules carried in this schema (NOT IN CODE):
--   * Old/expired contracts are HISTORY, not defects (no is_obsolete flag on
--     hr_contract_types — retirement is per-row via active).
--   * Insurance status is COMPUTED at read time (no status table). The
--     hr_medical_providers row carries `default_policy_year_months` as a
--     documented fallback rule, never as a stored status.
--   * No payroll calculation engine (hr_payroll_components is component
--     master only).
--   * No GOSI calculation engine (hr_social_insurance_rules holds rates
--     and effective windows; a future business table will reference
--     them).
-- =============================================================================


-- ---- hr_grades --------------------------------------------------------------
-- Pay-grade master. Used by hr_positions.grade_id.
CREATE TABLE IF NOT EXISTS hr_grades (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  level           INTEGER NOT NULL,
  salary_band_min REAL,
  salary_band_max REAL,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT NOT NULL,
  UNIQUE (level)
);
CREATE INDEX IF NOT EXISTS idx_hr_grades_active ON hr_grades(active);


-- ---- hr_job_titles ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_job_titles (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_ar       TEXT,
  category      TEXT,
  description   TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_job_titles_active ON hr_job_titles(active);


-- ---- hr_trades --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_trades (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_ar       TEXT,
  category      TEXT,
  description   TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_trades_active ON hr_trades(active);


-- ---- hr_org_units (hierarchy) -----------------------------------------------
-- Single flexible tree: legal entity → department → section → unit → site →
-- project. Self-FK with ON DELETE RESTRICT so a parent cannot be removed
-- while children exist (and we don't DELETE anyway — retire with active=0).
CREATE TABLE IF NOT EXISTS hr_org_units (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  name_ar             TEXT,
  type                TEXT NOT NULL CHECK (type IN (
                        'legal_entity','department','section','unit','site','project'
                      )),
  parent_id           TEXT REFERENCES hr_org_units(id) ON DELETE RESTRICT,
  level               INTEGER NOT NULL DEFAULT 0,
  manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  site_code           TEXT,
  project_code        TEXT,
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT NOT NULL,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_parent   ON hr_org_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_type     ON hr_org_units(type);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_manager  ON hr_org_units(manager_employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_active   ON hr_org_units(active);


-- ---- hr_positions ----------------------------------------------------------
-- A concrete "slot" = job title × org unit × grade.
CREATE TABLE IF NOT EXISTS hr_positions (
  id                      TEXT PRIMARY KEY,
  code                    TEXT NOT NULL UNIQUE,
  job_title_id            TEXT NOT NULL REFERENCES hr_job_titles(id) ON DELETE RESTRICT,
  org_unit_id             TEXT NOT NULL REFERENCES hr_org_units(id)  ON DELETE RESTRICT,
  grade_id                TEXT REFERENCES hr_grades(id)              ON DELETE SET NULL,
  reports_to_position_id  TEXT REFERENCES hr_positions(id)           ON DELETE SET NULL,
  headcount_allowed       INTEGER NOT NULL DEFAULT 1,
  active                  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order           INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  created_by              TEXT NOT NULL,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_positions_job        ON hr_positions(job_title_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_org        ON hr_positions(org_unit_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_grade      ON hr_positions(grade_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_reports    ON hr_positions(reports_to_position_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_active     ON hr_positions(active);


-- ---- hr_contract_types -----------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_contract_types (
  id                       TEXT PRIMARY KEY,
  code                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  name_ar                  TEXT,
  template_code            TEXT,
  requires_end_date        INTEGER NOT NULL DEFAULT 1 CHECK (requires_end_date IN (0,1)),
  requires_source_pdf      INTEGER NOT NULL DEFAULT 1 CHECK (requires_source_pdf IN (0,1)),
  requires_salary_attach   INTEGER NOT NULL DEFAULT 0 CHECK (requires_salary_attach IN (0,1)),
  max_renewals             INTEGER,
  default_term_months      INTEGER,
  active                   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order            INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  created_by               TEXT NOT NULL,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_contract_types_active ON hr_contract_types(active);


-- ---- hr_payroll_components -------------------------------------------------
-- Component master only. NO calculation engine.
CREATE TABLE IF NOT EXISTS hr_payroll_components (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  name_ar             TEXT,
  kind                TEXT NOT NULL CHECK (kind IN (
                        'earning','deduction','reimbursement','allowance'
                      )),
  taxable             INTEGER NOT NULL DEFAULT 0 CHECK (taxable IN (0,1)),
  included_in_gosi    INTEGER NOT NULL DEFAULT 0 CHECK (included_in_gosi IN (0,1)),
  included_in_eos     INTEGER NOT NULL DEFAULT 0 CHECK (included_in_eos IN (0,1)),
  default_currency    TEXT NOT NULL DEFAULT 'SAR',
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT NOT NULL,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_components_kind   ON hr_payroll_components(kind);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_components_active ON hr_payroll_components(active);


-- ---- hr_medical_providers --------------------------------------------------
-- `default_policy_year_months` documents the per-provider expiry fallback
-- used by read-time status math (Phase 3C-2). Insurance status is computed,
-- never stored.
CREATE TABLE IF NOT EXISTS hr_medical_providers (
  id                          TEXT PRIMARY KEY,
  code                        TEXT NOT NULL UNIQUE,
  name                        TEXT NOT NULL,
  name_ar                     TEXT,
  default_policy_year_months  INTEGER DEFAULT 12,
  contact_phone               TEXT,
  contact_email               TEXT,
  notes                       TEXT,
  active                      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order               INTEGER NOT NULL DEFAULT 0,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_medical_providers_active ON hr_medical_providers(active);


-- ---- hr_medical_policy_classes ---------------------------------------------
CREATE TABLE IF NOT EXISTS hr_medical_policy_classes (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_ar       TEXT,
  tier_level    INTEGER NOT NULL,
  description   TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_medical_policy_classes_active ON hr_medical_policy_classes(active);


-- ---- hr_document_types -----------------------------------------------------
-- Future migration will switch employee_documents.type's CHECK enum to FK
-- to this table. For now, the existing CHECK stays; this config table
-- carries labels + per-type config (expiry required, history allowed, etc.).
CREATE TABLE IF NOT EXISTS hr_document_types (
  id                          TEXT PRIMARY KEY,
  code                        TEXT NOT NULL UNIQUE,
  name                        TEXT NOT NULL,
  name_ar                     TEXT,
  requires_doc_number         INTEGER NOT NULL DEFAULT 1 CHECK (requires_doc_number IN (0,1)),
  requires_expires_at         INTEGER NOT NULL DEFAULT 1 CHECK (requires_expires_at IN (0,1)),
  requires_source_file        INTEGER NOT NULL DEFAULT 0 CHECK (requires_source_file IN (0,1)),
  allow_history               INTEGER NOT NULL DEFAULT 1 CHECK (allow_history IN (0,1)),
  default_review_required     INTEGER NOT NULL DEFAULT 0 CHECK (default_review_required IN (0,1)),
  warning_before_expiry_days  INTEGER,
  description                 TEXT,
  active                      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order               INTEGER NOT NULL DEFAULT 0,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_document_types_active ON hr_document_types(active);


-- ---- hr_transaction_types --------------------------------------------------
-- Lifecycle business records: flight ticket, iqama renewal, vacation,
-- salary adjustment, warning, contract renewal, insurance update,
-- termination, etc.
--
-- Distinct from hr_activity_types (operational/chatter records).
CREATE TABLE IF NOT EXISTS hr_transaction_types (
  id                       TEXT PRIMARY KEY,
  code                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  name_ar                  TEXT,
  category                 TEXT NOT NULL CHECK (category IN (
                              'travel','identity','time_off','compensation','disciplinary',
                              'admin','contract','insurance','learning','movement','exit','other'
                           )),
  payload_schema_version   INTEGER NOT NULL DEFAULT 1,
  requires_doc_type_id     TEXT REFERENCES hr_document_types(id) ON DELETE SET NULL,
  default_review_required  INTEGER NOT NULL DEFAULT 0 CHECK (default_review_required IN (0,1)),
  allowed_statuses         TEXT NOT NULL,
  default_status           TEXT NOT NULL DEFAULT 'requested',
  audit_severity           TEXT NOT NULL DEFAULT 'info' CHECK (audit_severity IN (
                              'info','warning','critical'
                           )),
  active                   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order            INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  created_by               TEXT NOT NULL,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_transaction_types_active   ON hr_transaction_types(active);
CREATE INDEX IF NOT EXISTS idx_hr_transaction_types_category ON hr_transaction_types(category);


-- ---- hr_activity_types -----------------------------------------------------
-- Operational chatter / task records: send message, log note, follow-up,
-- review request, contract renewal reminder, insurance expiry reminder.
--
-- Distinct from hr_transaction_types (lifecycle business records). The
-- separation matters because an "activity" is a TASK someone is supposed
-- to act on (with due date, assignee, priority), whereas a "transaction"
-- is a LIFECYCLE EVENT that already happened.
CREATE TABLE IF NOT EXISTS hr_activity_types (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  name_ar             TEXT,
  category            TEXT NOT NULL CHECK (category IN (
                         'communication','task','reminder','review','other'
                      )),
  default_due_days    INTEGER,
  requires_assignee   INTEGER NOT NULL DEFAULT 0 CHECK (requires_assignee IN (0,1)),
  default_priority    TEXT NOT NULL DEFAULT 'normal' CHECK (default_priority IN (
                         'low','normal','high','urgent'
                      )),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order       INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT NOT NULL,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_activity_types_active   ON hr_activity_types(active);
CREATE INDEX IF NOT EXISTS idx_hr_activity_types_category ON hr_activity_types(category);


-- ---- hr_learning_categories ------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_learning_categories (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  name_ar           TEXT,
  requires_expiry   INTEGER NOT NULL DEFAULT 0 CHECK (requires_expiry IN (0,1)),
  requires_issuer   INTEGER NOT NULL DEFAULT 0 CHECK (requires_issuer IN (0,1)),
  description       TEXT,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_learning_categories_active ON hr_learning_categories(active);


-- ---- hr_social_insurance_rules ---------------------------------------------
-- GOSI placeholder. NO calculator. Rate history is supported via
-- UNIQUE (code, effective_from). A future business table will reference
-- the rule by code.
CREATE TABLE IF NOT EXISTS hr_social_insurance_rules (
  id                       TEXT PRIMARY KEY,
  code                     TEXT NOT NULL,
  name                     TEXT NOT NULL,
  name_ar                  TEXT,
  applies_to               TEXT NOT NULL CHECK (applies_to IN ('saudi','non_saudi','any')),
  employer_rate_pct        REAL,
  employee_rate_pct        REAL,
  contribution_cap_sar     REAL,
  effective_from           TEXT NOT NULL,
  effective_to             TEXT,
  requires_source_doc      INTEGER NOT NULL DEFAULT 1 CHECK (requires_source_doc IN (0,1)),
  notes                    TEXT,
  active                   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  display_order            INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  created_by               TEXT NOT NULL,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by               TEXT NOT NULL,
  UNIQUE (code, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_hr_social_insurance_rules_active     ON hr_social_insurance_rules(active);
CREATE INDEX IF NOT EXISTS idx_hr_social_insurance_rules_effective  ON hr_social_insurance_rules(effective_from);
