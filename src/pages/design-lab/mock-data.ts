/**
 * Design-lab mock data (DESIGN ONLY, never wire to production).
 *
 * Realistic Saudi/expat HR archetypes the user already lives with: 501
 * employees, 328 contracts, 475 insurance. We hand-roll a small slice
 * (8 employees) rich enough to exercise every layout decision.
 *
 * Today is treated as 2026-05-12 throughout so lifecycle math is stable
 * across the mocks. No imports from `src/lib` to keep this file
 * self-contained and risk-free.
 */

export const LAB_TODAY = '2026-05-12';

export interface LabEmployee {
  id: string;
  identityNumber: string;
  fullName: string;
  fullNameArabic: string;
  department: string;
  jobTitle: string;
  nationality: string;
  hireDate: string;
  status: 'active' | 'inactive';
  employeeNumber: string;
}

export interface LabContract {
  id: string;
  employeeId: string;
  contractType: string;
  startDate: string;
  endDate: string;
  version: number;
  filename: string;
  state: 'current' | 'future' | 'history' | 'review';
  reviewReason?: string;
}

export interface LabInsurance {
  id: string;
  employeeId: string;
  provider: string;
  policyNumber: string;
  memberNumber: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'missing';
}

export interface LabDocument {
  id: string;
  employeeId: string;
  type: 'iqama' | 'passport' | 'visa' | 'work_permit' | 'insurance_card';
  docNumber: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'review_required';
}

export interface LabTransaction {
  id: string;
  employeeId: string;
  type: string;
  title: string;
  effectiveDate: string;
  status: 'completed' | 'approved' | 'requested' | 'rejected';
}

export interface LabTimelineEvent {
  date: string;
  kind: 'hire' | 'contract' | 'insurance' | 'document' | 'transaction' | 'alert';
  title: string;
  detail?: string;
  tone?: 'default' | 'active' | 'expiring' | 'expired' | 'info';
}

export const LAB_EMPLOYEES: LabEmployee[] = [
  {
    id: 'emp_001',
    identityNumber: '2572412712',
    fullName: 'Salim Al-Qahtani',
    fullNameArabic: 'سالم القحطاني',
    department: 'Engineering',
    jobTitle: 'Senior Project Engineer',
    nationality: 'Saudi Arabian',
    hireDate: '2020-06-01',
    status: 'active',
    employeeNumber: '1083',
  },
  {
    id: 'emp_002',
    identityNumber: '1133384402',
    fullName: 'Abdullah Al-Saud',
    fullNameArabic: 'عبدالله السعود',
    department: 'Human Resources',
    jobTitle: 'HR Manager',
    nationality: 'Saudi Arabian',
    hireDate: '2018-03-15',
    status: 'active',
    employeeNumber: '0421',
  },
  {
    id: 'emp_003',
    identityNumber: '2611190725',
    fullName: 'Mariam Al-Hayek',
    fullNameArabic: 'مريم الحايك',
    department: 'Finance',
    jobTitle: 'Senior Accountant',
    nationality: 'Saudi Arabian',
    hireDate: '2021-09-12',
    status: 'active',
    employeeNumber: '1240',
  },
  {
    id: 'emp_004',
    identityNumber: '2600515098',
    fullName: 'Faisal Khan',
    fullNameArabic: 'فيصل خان',
    department: 'Engineering',
    jobTitle: 'Site Engineer',
    nationality: 'Pakistani',
    hireDate: '2022-11-03',
    status: 'active',
    employeeNumber: '1389',
  },
  {
    id: 'emp_005',
    identityNumber: '2358176465',
    fullName: 'Ahmed Hassan',
    fullNameArabic: 'أحمد حسن',
    department: 'Operations',
    jobTitle: 'Operations Supervisor',
    nationality: 'Egyptian',
    hireDate: '2019-04-22',
    status: 'active',
    employeeNumber: '0712',
  },
  {
    id: 'emp_006',
    identityNumber: '1090214883',
    fullName: 'Noura Al-Fayez',
    fullNameArabic: 'نورة الفايز',
    department: 'Information Technology',
    jobTitle: 'Technology Lead',
    nationality: 'Saudi Arabian',
    hireDate: '2017-08-01',
    status: 'active',
    employeeNumber: '0316',
  },
  {
    id: 'emp_007',
    identityNumber: '2572768782',
    fullName: 'Bilal Sharif',
    fullNameArabic: 'بلال شريف',
    department: 'Logistics',
    jobTitle: 'Fleet Coordinator',
    nationality: 'Bangladeshi',
    hireDate: '2020-01-10',
    status: 'active',
    employeeNumber: '1024',
  },
  {
    id: 'emp_008',
    identityNumber: '1145728341',
    fullName: 'Yousef Al-Otaibi',
    fullNameArabic: 'يوسف العتيبي',
    department: 'Sales',
    jobTitle: 'Account Executive',
    nationality: 'Saudi Arabian',
    hireDate: '2026-02-15',
    status: 'active',
    employeeNumber: '1502',
  },
];

export const LAB_CONTRACTS: LabContract[] = [
  // Salim — current contract + 2-history
  { id: 'ctr_001', employeeId: 'emp_001', contractType: 'Fixed-term', startDate: '2025-06-01', endDate: '2027-05-31', version: 3, filename: 'salim_v3.pdf', state: 'current' },
  { id: 'ctr_002', employeeId: 'emp_001', contractType: 'Fixed-term', startDate: '2022-06-01', endDate: '2025-05-31', version: 2, filename: 'salim_v2.pdf', state: 'history' },
  { id: 'ctr_003', employeeId: 'emp_001', contractType: 'Fixed-term', startDate: '2020-06-01', endDate: '2022-05-31', version: 1, filename: 'salim_v1.pdf', state: 'history' },

  // Abdullah — current only
  { id: 'ctr_004', employeeId: 'emp_002', contractType: 'Fixed-term', startDate: '2024-03-01', endDate: '2027-02-28', version: 2, filename: 'abdullah_v2.pdf', state: 'current' },

  // Mariam — no contract (insurance only)

  // Faisal — REVIEW (negative duration parser bug)
  { id: 'ctr_005', employeeId: 'emp_004', contractType: 'Fixed-term', startDate: '2024-11-15', endDate: '2024-10-30', version: 1, filename: 'faisal_v1.pdf', state: 'review', reviewReason: 'End date is before start date' },

  // Ahmed — current + future renewal + 2-history
  { id: 'ctr_006', employeeId: 'emp_005', contractType: 'Fixed-term', startDate: '2024-04-22', endDate: '2026-08-15', version: 3, filename: 'ahmed_v3.pdf', state: 'current' },
  { id: 'ctr_007', employeeId: 'emp_005', contractType: 'Fixed-term', startDate: '2026-08-16', endDate: '2028-08-15', version: 4, filename: 'ahmed_v4_renewal.pdf', state: 'future' },
  { id: 'ctr_008', employeeId: 'emp_005', contractType: 'Fixed-term', startDate: '2022-04-22', endDate: '2024-04-21', version: 2, filename: 'ahmed_v2.pdf', state: 'history' },
  { id: 'ctr_009', employeeId: 'emp_005', contractType: 'Fixed-term', startDate: '2019-04-22', endDate: '2022-04-21', version: 1, filename: 'ahmed_v1.pdf', state: 'history' },

  // Noura — long-tenure, current contract
  { id: 'ctr_010', employeeId: 'emp_006', contractType: 'Fixed-term', startDate: '2023-08-01', endDate: '2026-07-31', version: 4, filename: 'noura_v4.pdf', state: 'current' },
  { id: 'ctr_011', employeeId: 'emp_006', contractType: 'Fixed-term', startDate: '2020-08-01', endDate: '2023-07-31', version: 3, filename: 'noura_v3.pdf', state: 'history' },

  // Bilal — current expiring within 30 days
  { id: 'ctr_012', employeeId: 'emp_007', contractType: 'Fixed-term', startDate: '2023-01-10', endDate: '2026-06-09', version: 2, filename: 'bilal_v2.pdf', state: 'current' },

  // Yousef — new hire, fresh contract
  { id: 'ctr_013', employeeId: 'emp_008', contractType: 'Fixed-term', startDate: '2026-02-15', endDate: '2028-02-14', version: 1, filename: 'yousef_v1.pdf', state: 'current' },
];

export const LAB_INSURANCE: LabInsurance[] = [
  { id: 'ins_001', employeeId: 'emp_001', provider: 'Bupa Arabia',  policyNumber: '577104001', memberNumber: '20594931', startDate: '2025-06-01', endDate: '2026-05-31', status: 'active' },
  { id: 'ins_002', employeeId: 'emp_002', provider: 'Tawuniya',     policyNumber: '342118500', memberNumber: '11003217', startDate: '2024-03-01', endDate: '2026-02-28', status: 'active' },
  { id: 'ins_003', employeeId: 'emp_003', provider: 'Bupa Arabia',  policyNumber: '577104001', memberNumber: '20594945', startDate: '2025-01-01', endDate: '2025-12-31', status: 'expired' },
  { id: 'ins_004', employeeId: 'emp_005', provider: 'Bupa Arabia',  policyNumber: '577104001', memberNumber: '20594955', startDate: '2024-04-22', endDate: '2026-04-21', status: 'expired' },
  { id: 'ins_005', employeeId: 'emp_006', provider: 'MedGulf',      policyNumber: '880221340', memberNumber: '55102287', startDate: '2025-08-01', endDate: '2026-07-31', status: 'active' },
  { id: 'ins_006', employeeId: 'emp_007', provider: 'Bupa Arabia',  policyNumber: '577104001', memberNumber: '20594967', startDate: '2025-01-10', endDate: '2026-01-09', status: 'expired' },
  // Yousef: no insurance yet (new hire — alert)
];

export const LAB_DOCUMENTS: LabDocument[] = [
  { id: 'doc_001', employeeId: 'emp_001', type: 'iqama',       docNumber: '2572412712', expiresAt: '2027-09-15', status: 'active' },
  { id: 'doc_002', employeeId: 'emp_001', type: 'passport',    docNumber: 'A09182332',  expiresAt: '2028-04-12', status: 'active' },
  { id: 'doc_003', employeeId: 'emp_004', type: 'iqama',       docNumber: '2600515098', expiresAt: '2026-06-30', status: 'active' },
  { id: 'doc_004', employeeId: 'emp_004', type: 'passport',    docNumber: 'AB1239847',  expiresAt: '2026-08-01', status: 'active' },
  { id: 'doc_005', employeeId: 'emp_005', type: 'iqama',       docNumber: '2358176465', expiresAt: '2026-05-30', status: 'active' },
  { id: 'doc_006', employeeId: 'emp_007', type: 'iqama',       docNumber: '2572768782', expiresAt: '2026-05-15', status: 'active' },
  { id: 'doc_007', employeeId: 'emp_007', type: 'work_permit', docNumber: 'WP-3344211', expiresAt: '2026-05-20', status: 'review_required' },
];

export const LAB_TRANSACTIONS: LabTransaction[] = [
  { id: 'txn_001', employeeId: 'emp_001', type: 'vacation',          title: 'Annual leave · 8 days',           effectiveDate: '2026-03-10', status: 'completed' },
  { id: 'txn_002', employeeId: 'emp_001', type: 'salary_adjustment', title: 'Annual raise · +6%',              effectiveDate: '2026-01-01', status: 'approved' },
  { id: 'txn_003', employeeId: 'emp_005', type: 'flight_ticket',     title: 'CAI → RUH · annual return',       effectiveDate: '2026-06-15', status: 'approved' },
  { id: 'txn_004', employeeId: 'emp_005', type: 'training',          title: 'Site safety certification',       effectiveDate: '2026-02-20', status: 'completed' },
  { id: 'txn_005', employeeId: 'emp_006', type: 'document_request',  title: 'Salary certificate (English)',    effectiveDate: '2026-04-30', status: 'requested' },
];

// Salim's full life timeline — used by Concept B.
export const LAB_TIMELINE_SALIM: LabTimelineEvent[] = [
  { date: '2020-06-01', kind: 'hire',        title: 'Joined MID Arabia',                    detail: 'Senior Project Engineer · Engineering', tone: 'active' },
  { date: '2020-06-01', kind: 'contract',    title: 'Contract v1 signed',                   detail: '2020-06 → 2022-05',                     tone: 'info' },
  { date: '2020-06-15', kind: 'document',    title: 'Iqama uploaded',                       detail: '#2572412712',                            tone: 'default' },
  { date: '2020-07-01', kind: 'insurance',   title: 'Enrolled in Bupa Arabia',              detail: 'Policy 577104001',                       tone: 'default' },
  { date: '2022-05-31', kind: 'contract',    title: 'Contract v1 ended',                    detail: 'Renewed without gap',                    tone: 'default' },
  { date: '2022-06-01', kind: 'contract',    title: 'Contract v2 signed',                   detail: '2022-06 → 2025-05',                     tone: 'info' },
  { date: '2023-04-12', kind: 'transaction', title: 'Annual leave · 12 days',               detail: 'Approved by Abdullah Al-Saud',           tone: 'default' },
  { date: '2024-09-08', kind: 'transaction', title: 'Flight ticket reimbursement · 2,400 SAR', detail: 'JED → RUH return',                    tone: 'default' },
  { date: '2025-05-31', kind: 'contract',    title: 'Contract v2 ended',                    detail: 'Auto-flagged for renewal',               tone: 'default' },
  { date: '2025-06-01', kind: 'contract',    title: 'Contract v3 signed — CURRENT',         detail: '2025-06 → 2027-05',                     tone: 'active' },
  { date: '2026-01-01', kind: 'transaction', title: 'Annual raise · +6%',                   detail: 'Approved by HR',                         tone: 'active' },
  { date: '2026-03-10', kind: 'transaction', title: 'Annual leave · 8 days',                detail: 'Completed',                              tone: 'default' },
  { date: '2026-05-08', kind: 'alert',       title: 'Iqama expires in 16 months',           detail: 'No action needed yet',                   tone: 'info' },
];

export const LAB_AGGREGATE = {
  employees: 501,
  contracts: 328,
  insurance: 475,
  activeContracts: 312,
  expiringIn7Days: 4,
  expiringIn30Days: 18,
  expiringIn60Days: 42,
  reviewQueueOpen: 162,
  unmatchedContracts: 72,
  unmatchedInsurance: 134,
  employeesMissingIdentity: 8,
  contractsMissingIdentity: 38,
  documentsExpiring30: 6,
  documentsExpired: 0,
  newHiresThisQuarter: 3,
  pendingApprovals: 11,
};

export const LAB_ACTION_REQUIRED = [
  { id: 'a1', icon: 'alert',  title: 'Bilal Sharif · Iqama expires in 3 days',          owner: 'HR',       severity: 'critical' as const, due: 'In 3 days',  link: 'emp_007' },
  { id: 'a2', icon: 'alert',  title: 'Bilal Sharif · Contract expires in 28 days',      owner: 'HR',       severity: 'warning'  as const, due: 'In 28 days', link: 'emp_007' },
  { id: 'a3', icon: 'review', title: 'Faisal Khan · Negative-duration contract',        owner: 'Admin',    severity: 'critical' as const, due: 'Today',      link: 'emp_004' },
  { id: 'a4', icon: 'review', title: 'Ahmed Hassan · Insurance expired',                owner: 'HR',       severity: 'warning'  as const, due: 'Overdue',    link: 'emp_005' },
  { id: 'a5', icon: 'alert',  title: 'Mariam Al-Hayek · No active contract on file',    owner: 'HR',       severity: 'warning'  as const, due: 'This week',  link: 'emp_003' },
  { id: 'a6', icon: 'review', title: 'Yousef Al-Otaibi · Insurance not enrolled',       owner: 'HR',       severity: 'info'     as const, due: 'This month', link: 'emp_008' },
  { id: 'a7', icon: 'review', title: '8 employee records missing identity number',     owner: 'Admin',    severity: 'warning'  as const, due: 'This week',  link: 'review' },
  { id: 'a8', icon: 'alert',  title: '72 contracts unmatched to an employee',           owner: 'Admin',    severity: 'warning'  as const, due: 'Backlog',    link: 'review' },
];

export const LAB_RECENT_ACTIVITY = [
  { id: 'r1', at: '2026-05-12 08:42', actor: 'admin@mid', action: 'Approved Annual leave for Salim Al-Qahtani' },
  { id: 'r2', at: '2026-05-11 17:21', actor: 'hr@mid',    action: 'Uploaded Iqama copy for Bilal Sharif' },
  { id: 'r3', at: '2026-05-11 14:08', actor: 'system',    action: 'Computed 18 contract expiries within 30 days' },
  { id: 'r4', at: '2026-05-10 11:55', actor: 'admin@mid', action: 'Flagged contract ctr_005 for review (negative duration)' },
  { id: 'r5', at: '2026-05-10 09:30', actor: 'hr@mid',    action: 'Onboarded Yousef Al-Otaibi · Sales · Account Executive' },
];

export const LAB_SAVED_VIEWS = [
  { id: 'v1', label: 'Active employees',              count: 487 },
  { id: 'v2', label: 'Expiring in 30 days',           count: 18  },
  { id: 'v3', label: 'Missing insurance',             count: 14  },
  { id: 'v4', label: 'Saudi nationals · Engineering', count: 64  },
  { id: 'v5', label: 'New hires this quarter',        count: 3   },
];
