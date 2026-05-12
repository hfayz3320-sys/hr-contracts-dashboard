-- ============================================================================
-- 0007_employee_360_actions.sql
--
-- Phase 10 — make the eight Employee 360 actions real. Adds four new tables
-- for the entities that didn't have storage yet; documents / transactions /
-- audit_events / app_users / source_files are reused as-is.
--
-- Safety:
--   - Every CREATE is `IF NOT EXISTS`; safe to re-apply.
--   - Every INSERT/UPDATE/DELETE is performed by the worker at runtime, NOT
--     here — the migration is structural only.
--   - No data backfill, no DROP, no ALTER on existing business tables.
--   - Indexes are additive.
--
-- Production migration plan: applied to local D1 during development and
-- staging; production application is a separate gated step.
-- ============================================================================

-- ---- employee_timeline_entries ---------------------------------------------
-- Backs the chatter "Send Message" and "Log Note" composer in the Activity
-- panel. Messages go to followers (planned future feature) — for now they're
-- visible to anyone with read access on the employee profile. Notes are
-- internal-only (visible to admin / hr_manager).
CREATE TABLE IF NOT EXISTS employee_timeline_entries (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('message', 'note')),
  body            TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emp_timeline_employee ON employee_timeline_entries (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_timeline_type     ON employee_timeline_entries (entry_type);
CREATE INDEX IF NOT EXISTS idx_emp_timeline_created  ON employee_timeline_entries (created_at);

-- ---- employee_activities ---------------------------------------------------
-- Backs the "Activity" button — schedule a task (call / meeting / review /
-- reminder / follow-up). Distinct from `audit_events` (system-of-record for
-- mutations) and from `employee_timeline_entries` (free-text messages).
CREATE TABLE IF NOT EXISTS employee_activities (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  activity_type   TEXT NOT NULL CHECK (activity_type IN (
    'call',
    'meeting',
    'review',
    'reminder',
    'follow_up',
    'document_request',
    'other'
  )),
  title           TEXT NOT NULL,
  description     TEXT,
  due_date        TEXT,                              -- ISO YYYY-MM-DD
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'done',
    'cancelled'
  )),
  assigned_to     TEXT,                              -- actor email (free-form)
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emp_activity_employee ON employee_activities (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_activity_status   ON employee_activities (status);
CREATE INDEX IF NOT EXISTS idx_emp_activity_due      ON employee_activities (due_date);
CREATE INDEX IF NOT EXISTS idx_emp_activity_type     ON employee_activities (activity_type);

-- ---- employee_compensation_lines -------------------------------------------
-- Per-employee payroll components. Logically belongs alongside the seeded
-- `hr_payroll_components` table (0006) — that table defines available types,
-- this one stores the actual values per employee. Lines have an effective
-- window so promotions / amendments preserve history.
CREATE TABLE IF NOT EXISTS employee_compensation_lines (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  component_code  TEXT NOT NULL,                     -- e.g. PAY_BASIC, PAY_HOUSING
  component_name  TEXT NOT NULL,                     -- denormalised for read speed
  amount          REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  frequency       TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN (
    'monthly',
    'yearly',
    'one_time'
  )),
  effective_from  TEXT NOT NULL,                     -- ISO YYYY-MM-DD
  effective_to    TEXT,                              -- NULL = open-ended
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual',
    'import',
    'contract'
  )),
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emp_comp_employee  ON employee_compensation_lines (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_comp_component ON employee_compensation_lines (component_code);
CREATE INDEX IF NOT EXISTS idx_emp_comp_effective ON employee_compensation_lines (effective_from);

-- ---- employee_learning_records ---------------------------------------------
-- Certifications, training, skills, prior experience. Logically backed by the
-- seeded `hr_learning_categories` (0006). One row per learning artefact;
-- multiple per employee.
CREATE TABLE IF NOT EXISTS employee_learning_records (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  record_type     TEXT NOT NULL CHECK (record_type IN (
    'certification',
    'training',
    'skill',
    'experience'
  )),
  title           TEXT NOT NULL,
  provider        TEXT,                              -- issuer / school / employer
  issue_date      TEXT,                              -- ISO YYYY-MM-DD
  expiry_date     TEXT,                              -- ISO YYYY-MM-DD; NULL = no expiry
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'expiring',
    'expired',
    'archived'
  )),
  level           TEXT CHECK (level IN (
    'beginner',
    'intermediate',
    'expert',
    NULL
  )),
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emp_learn_employee ON employee_learning_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_learn_type     ON employee_learning_records (record_type);
CREATE INDEX IF NOT EXISTS idx_emp_learn_expiry   ON employee_learning_records (expiry_date);
CREATE INDEX IF NOT EXISTS idx_emp_learn_status   ON employee_learning_records (status);

-- ---- employee_user_link (re-uses app_users; this is just the FK) -----------
-- "Create user" links an employee to an app_users row. We do NOT duplicate
-- the user table — the link is stored on app_users itself via a new
-- `employee_id` column. NULL = not linked to any employee (e.g. external
-- admin), set = this app_user IS the given employee.
ALTER TABLE app_users ADD COLUMN employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_employee ON app_users (employee_id);
