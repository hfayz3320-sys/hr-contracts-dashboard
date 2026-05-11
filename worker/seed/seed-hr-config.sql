-- =============================================================================
-- HR Configuration seed — Phase 6A-1.
--
-- Idempotent. Safe to rerun. Code-keyed.
--
-- Strategy:
--   * INSERT OR IGNORE on UNIQUE(code) — running twice never duplicates a row.
--   * Never writes any DELETE/UPDATE — admin edits via API are preserved.
--   * Does NOT write an audit_events row (would duplicate on every re-run; if
--     audit is wanted, run it as a separate one-shot from the operator's
--     workstation, not from this seed file).
--
-- Actor: 'system:seed-6a1' for traceable provenance.
-- =============================================================================


-- ---- hr_contract_types -----------------------------------------------------
INSERT OR IGNORE INTO hr_contract_types
  (id, code, name, name_ar, requires_end_date, requires_source_pdf,
   requires_salary_attach, default_term_months, display_order, created_by, updated_by) VALUES
  ('hct_fixed_term',  'CONTRACT_FIXED_TERM',  'Fixed-term contract', 'عقد محدد المدة', 1, 1, 1, 24, 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hct_indefinite',  'CONTRACT_INDEFINITE',  'Indefinite contract', 'عقد غير محدد المدة', 0, 1, 1, NULL, 2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hct_probation',   'CONTRACT_PROBATION',   'Probation contract',  'عقد تجربة',     1, 1, 0,  3, 3, 'system:seed-6a1', 'system:seed-6a1'),
  ('hct_renewal',     'CONTRACT_RENEWAL',     'Contract renewal',    'تجديد العقد',   1, 1, 0, 24, 4, 'system:seed-6a1', 'system:seed-6a1'),
  ('hct_amendment',   'CONTRACT_AMENDMENT',   'Contract amendment',  'تعديل العقد',   0, 1, 0, NULL, 5, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_document_types -----------------------------------------------------
INSERT OR IGNORE INTO hr_document_types
  (id, code, name, name_ar, requires_doc_number, requires_expires_at,
   requires_source_file, allow_history, warning_before_expiry_days, display_order,
   created_by, updated_by) VALUES
  ('hdt_iqama',          'DOC_IQAMA',          'Iqama (Residency Permit)', 'الإقامة',        1, 1, 0, 1,  60, 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_passport',       'DOC_PASSPORT',       'Passport',                  'جواز السفر',     1, 1, 0, 1, 180, 2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_visa',           'DOC_VISA',           'Visa',                      'تأشيرة',         1, 1, 0, 1,  30, 3, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_work_permit',    'DOC_WORK_PERMIT',    'Work permit',               'رخصة العمل',     1, 1, 0, 1,  30, 4, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_contract_pdf',   'DOC_CONTRACT_PDF',   'Contract PDF',              'نسخة العقد',     0, 0, 1, 1, NULL, 5, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_insurance_card', 'DOC_INSURANCE_CARD', 'Insurance card',            'بطاقة التأمين',  0, 1, 0, 1,  30, 6, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_certificate',    'DOC_CERTIFICATE',    'Certificate',               'شهادة',          1, 0, 1, 1, NULL, 7, 'system:seed-6a1', 'system:seed-6a1'),
  ('hdt_other',          'DOC_OTHER',          'Other document',            'مستند آخر',      0, 0, 0, 1, NULL, 8, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_transaction_types --------------------------------------------------
-- Lifecycle business records — events that happened to/for the employee.
INSERT OR IGNORE INTO hr_transaction_types
  (id, code, name, name_ar, category, payload_schema_version,
   default_review_required, allowed_statuses, default_status, audit_severity,
   display_order, created_by, updated_by) VALUES
  ('htt_flight_ticket',         'TXN_FLIGHT_TICKET',          'Flight ticket',           'تذكرة طيران',         'travel',      1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     1,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_iqama_renewal',         'TXN_IQAMA_RENEWAL',          'Iqama renewal',           'تجديد الإقامة',        'identity',    1, 0, 'requested,in_progress,completed,rejected,cancelled', 'requested', 'warning',  2,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_exit_reentry',          'TXN_EXIT_REENTRY',           'Exit/Re-entry visa',      'تأشيرة خروج وعودة',     'identity',    1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     3,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_vacation',              'TXN_VACATION',               'Vacation / annual leave', 'إجازة',               'time_off',    1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     4,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_salary_adjustment',     'TXN_SALARY_ADJUSTMENT',      'Salary adjustment',       'تعديل الراتب',          'compensation',1, 1, 'requested,approved,rejected,completed,cancelled', 'requested', 'critical', 5,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_allowance_change',      'TXN_ALLOWANCE_CHANGE',       'Allowance change',        'تعديل البدلات',          'compensation',1, 1, 'requested,approved,rejected,completed,cancelled', 'requested', 'warning',  6,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_warning',               'TXN_WARNING',                'Warning letter',          'إنذار',               'disciplinary',1, 1, 'requested,approved,rejected,completed,cancelled', 'requested', 'critical', 7,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_document_request',      'TXN_DOCUMENT_REQUEST',       'Document request',        'طلب مستند',           'admin',       1, 0, 'requested,in_progress,completed,rejected,cancelled', 'requested', 'info',     8,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_contract_renewal',      'TXN_CONTRACT_RENEWAL',       'Contract renewal',        'تجديد العقد',          'contract',    1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'warning',  9,  'system:seed-6a1', 'system:seed-6a1'),
  ('htt_insurance_update',      'TXN_INSURANCE_UPDATE',       'Insurance update',        'تعديل التأمين',          'insurance',   1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     10, 'system:seed-6a1', 'system:seed-6a1'),
  ('htt_social_ins_update',     'TXN_SOCIAL_INSURANCE_UPDATE','Social insurance update', 'تعديل التأمينات الاجتماعية','insurance',   1, 1, 'requested,approved,rejected,completed,cancelled', 'requested', 'warning',  11, 'system:seed-6a1', 'system:seed-6a1'),
  ('htt_training',              'TXN_TRAINING',               'Training / certification','تدريب / شهادة',        'learning',    1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     12, 'system:seed-6a1', 'system:seed-6a1'),
  ('htt_promotion',             'TXN_PROMOTION',              'Promotion',               'ترقية',               'movement',    1, 1, 'requested,approved,rejected,completed,cancelled', 'requested', 'warning',  13, 'system:seed-6a1', 'system:seed-6a1'),
  ('htt_transfer',              'TXN_TRANSFER',               'Transfer',                'نقل',                'movement',    1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     14, 'system:seed-6a1', 'system:seed-6a1'),
  ('htt_termination',           'TXN_TERMINATION',            'Termination',             'إنهاء الخدمة',         'exit',        1, 1, 'requested,approved,rejected,completed,cancelled', 'requested', 'critical', 15, 'system:seed-6a1', 'system:seed-6a1'),
  ('htt_other',                 'TXN_OTHER',                  'Other transaction',       'معاملة أخرى',          'other',       1, 0, 'requested,approved,rejected,completed,cancelled', 'requested', 'info',     16, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_activity_types -----------------------------------------------------
-- Operational/task records — things HR needs to DO (not events that happened).
INSERT OR IGNORE INTO hr_activity_types
  (id, code, name, name_ar, category, default_due_days, requires_assignee,
   default_priority, display_order, created_by, updated_by) VALUES
  ('hat_send_message',          'ACT_SEND_MESSAGE',                'Send message',             'إرسال رسالة',          'communication', NULL, 0, 'normal', 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hat_log_note',              'ACT_LOG_NOTE',                    'Log note',                 'تدوين ملاحظة',         'communication', NULL, 0, 'low',    2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hat_follow_up',             'ACT_FOLLOW_UP',                   'Follow-up',                'متابعة',              'task',           3,   1, 'normal', 3, 'system:seed-6a1', 'system:seed-6a1'),
  ('hat_review_request',        'ACT_REVIEW_REQUEST',              'Review request',           'طلب مراجعة',           'review',         5,   1, 'normal', 4, 'system:seed-6a1', 'system:seed-6a1'),
  ('hat_document_follow_up',    'ACT_DOCUMENT_FOLLOW_UP',          'Document follow-up',       'متابعة مستند',         'task',           7,   1, 'normal', 5, 'system:seed-6a1', 'system:seed-6a1'),
  ('hat_contract_renewal_remind','ACT_CONTRACT_RENEWAL_REMINDER',  'Contract renewal reminder','تذكير تجديد العقد',     'reminder',      30,   1, 'high',   6, 'system:seed-6a1', 'system:seed-6a1'),
  ('hat_insurance_expiry_remind','ACT_INSURANCE_EXPIRY_REMINDER',  'Insurance expiry reminder','تذكير انتهاء التأمين',  'reminder',      30,   1, 'high',   7, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_payroll_components -------------------------------------------------
INSERT OR IGNORE INTO hr_payroll_components
  (id, code, name, name_ar, kind, taxable, included_in_gosi, included_in_eos,
   default_currency, display_order, created_by, updated_by) VALUES
  ('hpc_basic',     'PAY_BASIC',     'Basic salary',              'الراتب الأساسي',    'earning',    0, 1, 1, 'SAR', 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hpc_housing',   'PAY_HOUSING',   'Housing allowance',         'بدل سكن',          'allowance',  0, 1, 1, 'SAR', 2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hpc_transport', 'PAY_TRANSPORT', 'Transportation allowance',  'بدل مواصلات',       'allowance',  0, 0, 0, 'SAR', 3, 'system:seed-6a1', 'system:seed-6a1'),
  ('hpc_food',      'PAY_FOOD',      'Food allowance',            'بدل غذاء',         'allowance',  0, 0, 0, 'SAR', 4, 'system:seed-6a1', 'system:seed-6a1'),
  ('hpc_other',     'PAY_OTHER',     'Other earning',             'بدل آخر',          'earning',    0, 0, 0, 'SAR', 5, 'system:seed-6a1', 'system:seed-6a1'),
  ('hpc_deduction', 'PAY_DEDUCTION', 'Deduction',                 'خصم',              'deduction',  0, 0, 0, 'SAR', 6, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_medical_providers --------------------------------------------------
INSERT OR IGNORE INTO hr_medical_providers
  (id, code, name, name_ar, default_policy_year_months, display_order,
   created_by, updated_by) VALUES
  ('hmp_bupa',     'MED_PROVIDER_BUPA',     'Bupa Arabia',  'بوبا العربية',   12, 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hmp_tawuniya', 'MED_PROVIDER_TAWUNIYA', 'Tawuniya',     'التعاونية',     12, 2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hmp_medgulf',  'MED_PROVIDER_MEDGULF',  'MedGulf',      'ميدغلف',        12, 3, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_medical_policy_classes ---------------------------------------------
INSERT OR IGNORE INTO hr_medical_policy_classes
  (id, code, name, name_ar, tier_level, display_order, created_by, updated_by) VALUES
  ('hmc_vip', 'MED_CLASS_VIP', 'Class VIP', 'كلاس VIP', 0, 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hmc_a',   'MED_CLASS_A',   'Class A',   'كلاس A',  1, 2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hmc_b',   'MED_CLASS_B',   'Class B',   'كلاس B',  2, 3, 'system:seed-6a1', 'system:seed-6a1'),
  ('hmc_c',   'MED_CLASS_C',   'Class C',   'كلاس C',  3, 4, 'system:seed-6a1', 'system:seed-6a1');


-- ---- hr_learning_categories ------------------------------------------------
INSERT OR IGNORE INTO hr_learning_categories
  (id, code, name, name_ar, requires_expiry, requires_issuer, display_order,
   created_by, updated_by) VALUES
  ('hlc_certification', 'LEARNING_CERTIFICATION', 'Certification', 'شهادة',  1, 1, 1, 'system:seed-6a1', 'system:seed-6a1'),
  ('hlc_training',      'LEARNING_TRAINING',      'Training',      'تدريب',  0, 1, 2, 'system:seed-6a1', 'system:seed-6a1'),
  ('hlc_skill',         'LEARNING_SKILL',         'Skill',         'مهارة', 0, 0, 3, 'system:seed-6a1', 'system:seed-6a1'),
  ('hlc_experience',    'LEARNING_EXPERIENCE',    'Experience',    'خبرة',  0, 0, 4, 'system:seed-6a1', 'system:seed-6a1');


-- =============================================================================
-- Intentionally NOT seeded (admin enters via API/UI):
--   * hr_org_units    — needs the legal entity name, departments, sites
--   * hr_job_titles   — needs the company's actual title list
--   * hr_positions    — needs job_title × org_unit combinations
--   * hr_grades       — needs the company's pay bands
--   * hr_trades       — Saudi industrial context; trade list per company
--   * hr_social_insurance_rules — needs current GOSI rate effective dates
-- =============================================================================
