-- ============================================================================
-- 0010_import_field_expansion.sql
--
-- Persist full contract PDF extraction + employee contact fields + insurance
-- plan metadata from Excel imports. All additive.
-- ============================================================================

-- contracts — extended extraction / contact / bank
ALTER TABLE contracts ADD COLUMN contract_number TEXT;
ALTER TABLE contracts ADD COLUMN execution_date TEXT;
ALTER TABLE contracts ADD COLUMN passport_number TEXT;
ALTER TABLE contracts ADD COLUMN gender TEXT;
ALTER TABLE contracts ADD COLUMN marital_status TEXT;
ALTER TABLE contracts ADD COLUMN birth_date TEXT;
ALTER TABLE contracts ADD COLUMN occupation TEXT;
ALTER TABLE contracts ADD COLUMN work_location TEXT;
ALTER TABLE contracts ADD COLUMN mobile TEXT;
ALTER TABLE contracts ADD COLUMN email TEXT;
ALTER TABLE contracts ADD COLUMN bank_name TEXT;
ALTER TABLE contracts ADD COLUMN iban TEXT;
ALTER TABLE contracts ADD COLUMN education_level TEXT;
ALTER TABLE contracts ADD COLUMN speciality TEXT;
ALTER TABLE contracts ADD COLUMN extraction_warnings_json TEXT;

-- employees — contact from contract import or manual create
ALTER TABLE employees ADD COLUMN email TEXT;
ALTER TABLE employees ADD COLUMN passport_number TEXT;

-- insurance — Bupa plan / member metadata
ALTER TABLE insurance_policies ADD COLUMN plan_class TEXT;
ALTER TABLE insurance_policies ADD COLUMN nationality TEXT;
ALTER TABLE insurance_policies ADD COLUMN member_name TEXT;
ALTER TABLE insurance_policies ADD COLUMN review_flags_json TEXT;
