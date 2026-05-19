-- migrations/0003_import_field_expansion.sql
--
-- Persist full contract PDF extraction + employee contact fields + insurance
-- plan metadata from Excel imports. All additive.
--
-- These fields come from the enhanced parsers (parserNewQiwaUnified,
-- parserOldBilingual, etc.) and Excel importers.

-- ─────────────────────────────────────────────────────────────────────────────
-- contracts — extended extraction / contact / bank (11 new fields)
-- Note: email, mobile, iban, contract_number already exist from 0001-0002
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE contracts ADD COLUMN passport_number TEXT;
ALTER TABLE contracts ADD COLUMN execution_date TEXT;
ALTER TABLE contracts ADD COLUMN gender TEXT;
ALTER TABLE contracts ADD COLUMN marital_status TEXT;
ALTER TABLE contracts ADD COLUMN birth_date TEXT;
ALTER TABLE contracts ADD COLUMN occupation TEXT;
ALTER TABLE contracts ADD COLUMN work_location TEXT;
ALTER TABLE contracts ADD COLUMN bank_name TEXT;
ALTER TABLE contracts ADD COLUMN education_level TEXT;
ALTER TABLE contracts ADD COLUMN speciality TEXT;
ALTER TABLE contracts ADD COLUMN extraction_warnings_json TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- persons — contact and ID from contract import or manual create (1 new field)
-- Note: email already exists from 0001
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE persons ADD COLUMN passport_number TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- insurance_records — Bupa plan / member metadata (3 new fields)
-- Note: member_name already exists from 0001
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE insurance_records ADD COLUMN plan_class TEXT;
ALTER TABLE insurance_records ADD COLUMN nationality TEXT;
ALTER TABLE insurance_records ADD COLUMN review_flags_json TEXT;
