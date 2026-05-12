-- ============================================================================
-- 0009_contract_compensation_and_corrections.sql
--
-- Three coordinated additions for the manual-create + contract-review feature:
--
-- 1. `import_job_items.corrected_payload` (JSON, nullable)
--    Lets a user edit extracted fields BEFORE commit. The commit pipeline
--    merges `corrected_payload` over `raw_payload` so the committed entity
--    reflects the user's edits, not the raw parser output. Null = use
--    raw_payload as-is.
--
-- 2. `contracts.basic_salary / housing_allowance / transport_allowance /
--    other_allowances_json / total_salary / currency`
--    The parser already extracts these; previously they were dropped on
--    commit. Now they live on the contract row for audit trail and
--    population of `employee_compensation_lines` (Phase 10 table) at
--    commit time. `other_allowances_json` is a free-form JSON array
--    `[{ code, name, amount }, ...]` for extensions the parser hasn't
--    learned yet (e.g. food allowance, role allowance).
--
-- 3. `employees.mobile` + `employees.notes`
--    Manual employee create form needs these fields; the existing schema
--    has no place for them. Both nullable.
--
-- Safety: every change is additive (ALTER TABLE ADD COLUMN with a default
-- or nullability). No data backfill. Idempotency: SQLite ignores
-- `ADD COLUMN` if the column already exists? No, it errors. So this
-- migration must run exactly once — which is what the wrangler migration
-- tracker enforces.
-- ============================================================================

-- ---- 1. import_job_items.corrected_payload ---------------------------------
ALTER TABLE import_job_items ADD COLUMN corrected_payload TEXT;

-- ---- 2. contracts: salary breakdown ----------------------------------------
ALTER TABLE contracts ADD COLUMN basic_salary           REAL;
ALTER TABLE contracts ADD COLUMN housing_allowance      REAL;
ALTER TABLE contracts ADD COLUMN transport_allowance    REAL;
ALTER TABLE contracts ADD COLUMN other_allowances_json  TEXT;
ALTER TABLE contracts ADD COLUMN total_salary           REAL;
ALTER TABLE contracts ADD COLUMN currency               TEXT NOT NULL DEFAULT 'SAR';

-- ---- 3. employees: mobile + notes ------------------------------------------
ALTER TABLE employees ADD COLUMN mobile TEXT;
ALTER TABLE employees ADD COLUMN notes  TEXT;

-- ---- Link compensation lines back to their source contract -----------------
-- Optional column; allows the profile "current salary" view to point at the
-- exact contract that produced each compensation line. Existing rows have
-- source IN ('manual','import','contract') but no FK to the contract row.
ALTER TABLE employee_compensation_lines ADD COLUMN source_contract_id TEXT
  REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emp_comp_source_contract
  ON employee_compensation_lines (source_contract_id);
