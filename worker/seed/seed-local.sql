-- =============================================================================
-- LOCAL DEV SEED — synthetic data only.
-- Never run this against production.
--
-- Names are anglo placeholders (no overlap with the real workforce).
-- Iqama numbers are prefixed `9` — outside the real Saudi range.
-- Insurance providers are fictional.
-- =============================================================================

-- 5 sample employees, 5 contracts, 4 insurance, 2 import jobs, 3 review items, 6 audit events.

INSERT OR IGNORE INTO employees (id, identity_number, full_name, department, job_title, nationality, hire_date, status) VALUES
  ('emp-0001', '9900000007', 'Alex Rivers',  'Operations',  'Technician',   'Demoland',   '2023-08-12', 'active'),
  ('emp-0002', '9900000048', 'Jordan Reed',  'Maintenance', 'Foreman',      'Sampleland', '2022-11-03', 'active'),
  ('emp-0003', '9900000089', 'Casey Hale',   'Logistics',   'Driver',       'Testonia',   '2024-02-19', 'active'),
  ('emp-0004', '9900000130', 'Sam Vega',     'Engineering', 'Engineer',     'Mockovia',   '2021-06-30', 'inactive'),
  ('emp-0005', '9900000171', 'Morgan Brooks','Quality',     'Supervisor',   'Fictia',     '2023-01-15', 'active');

INSERT OR IGNORE INTO employee_number_history (id, employee_id, number, from_date, to_date) VALUES
  ('enh-0001', 'emp-0001', 'DEMO-01000', '2023-08-12', NULL),
  ('enh-0002', 'emp-0002', 'DEMO-01001', '2022-11-03', NULL),
  ('enh-0003', 'emp-0003', 'DEMO-01002', '2024-02-19', NULL),
  ('enh-0004', 'emp-0004', 'DEMO-01003', '2021-06-30', NULL),
  ('enh-0005', 'emp-0005', 'DEMO-01004', '2023-01-15', NULL);

INSERT OR IGNORE INTO contracts (id, employee_id, identity_number, contract_type, start_date, end_date, status, version, file_hash, filename) VALUES
  ('ctr-0001', 'emp-0001', '9900000007', 'Fixed-term',    '2024-01-01', '2026-12-31', 'active',   1, 'sha256-000017', 'DEMO-CONTRACT-0001.pdf'),
  ('ctr-0002', 'emp-0002', '9900000048', 'Permanent',     '2022-11-03', '2026-06-30', 'active',   1, 'sha256-000043', 'DEMO-CONTRACT-0002.pdf'),
  ('ctr-0003', 'emp-0003', '9900000089', 'Renewable',     '2024-02-19', '2026-05-31', 'expiring', 1, 'sha256-000069', 'DEMO-CONTRACT-0003.pdf'),
  ('ctr-0004', 'emp-0004', '9900000130', 'Project-based', '2021-06-30', '2025-12-31', 'expired',  1, 'sha256-000095', 'DEMO-CONTRACT-0004.pdf'),
  ('ctr-0005', 'emp-0005', '9900000171', 'Fixed-term',    '2023-01-15', '2027-01-14', 'active',   1, 'sha256-000121', 'DEMO-CONTRACT-0005.pdf');

INSERT OR IGNORE INTO insurance_policies (id, employee_id, identity_number, policy_number, provider, start_date, end_date, status, matched) VALUES
  ('ins-0001', 'emp-0001', '9900000007', 'DEMO-POL-050007', 'DemoCare',          '2024-01-01', '2026-12-31', 'active',  1),
  ('ins-0002', 'emp-0002', '9900000048', 'DEMO-POL-050014', 'SampleHealth',      '2023-06-01', '2025-09-30', 'active',  1),
  ('ins-0003', 'emp-0003', '9900000089', 'DEMO-POL-050021', 'MockMed Plus',      '2024-02-19', '2025-11-15', 'expired', 1),
  ('ins-9001',  NULL,       NULL,         'DEMO-POL-099001', 'DemoCare',          '2024-09-01', '2026-09-01', 'active',  0);

UPDATE insurance_policies SET unmatched_reason = 'no_identity_match' WHERE id = 'ins-9001';

INSERT OR IGNORE INTO import_jobs (id, type, filename, status, triggered_by, counts_created, counts_updated, counts_skipped, counts_review, counts_error, started_at, finished_at) VALUES
  ('job-0001', 'employees', 'demo-employees-batch-01.xlsx', 'committed', 'admin@mid.local', 18, 32, 4, 2, 0, datetime('now', '-30 days'), datetime('now', '-30 days', '+1 hour')),
  ('job-0002', 'insurance', 'demo-insurance-batch-01.xlsx', 'committed', 'admin@mid.local', 28, 8,  2, 2, 0, datetime('now', '-13 days'), datetime('now', '-13 days', '+1 hour'));

INSERT OR IGNORE INTO review_queue (id, reason, entity, description, details, status, import_job_id) VALUES
  ('rev-0001', 'missing_identity',          'employee',  'Imported row has no IdentityNumber',                'Row 47 of demo-correction.xlsx — synthetic record "Sample Worker A" has no Iqama.', 'open',     NULL),
  ('rev-0002', 'duplicate_identity',        'employee',  'Two rows with the same IdentityNumber, different names', 'IdentityNumber 9900000287 → "Alex Rivers" and "A. Rivers".',                       'open',     'job-0001'),
  ('rev-0003', 'unmatched_insurance',       'insurance', 'Insurance row has no matching person',              'DEMO-POL-099001 matched by name only — no IdentityNumber overlap.',                'open',     'job-0002');

INSERT OR IGNORE INTO audit_events (id, actor, action, target, status, details, at) VALUES
  ('aud-0001', 'admin@mid.local', 'import.commit', 'job-0001', 'ok',      NULL,                                      datetime('now', '-30 days')),
  ('aud-0002', 'admin@mid.local', 'import.commit', 'job-0002', 'ok',      NULL,                                      datetime('now', '-13 days')),
  ('aud-0003', 'system',          'expiry.scan',   'contracts','warning', '1 contract expiring within 60 days',      datetime('now', '-1 day')),
  ('aud-0004', 'admin@mid.local', 'employee.view', 'emp-0001', 'ok',      NULL,                                      datetime('now', '-2 hours')),
  ('aud-0005', 'system',          'review.created','rev-0003', 'warning', NULL,                                      datetime('now', '-13 days')),
  ('aud-0006', 'admin@mid.local', 'contract.view', 'ctr-0001', 'ok',      NULL,                                      datetime('now', '-30 minutes'));

INSERT OR IGNORE INTO users (id, email, display_name, role) VALUES
  ('usr-admin',  'admin@mid.local',  'Demo Admin',  'admin'),
  ('usr-viewer', 'viewer@mid.local', 'Demo Viewer', 'viewer');
