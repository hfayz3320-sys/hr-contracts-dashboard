/**
 * HR ERP design lab — extended mock data (DESIGN ONLY, no API).
 *
 * Extends the base `../mock-data.ts` with what the Odoo-inspired views need
 * (payroll components, org chart, learning records, department roll-ups,
 * activity/chatter entries).
 */
import {
  LAB_EMPLOYEES, LAB_CONTRACTS, LAB_INSURANCE, LAB_DOCUMENTS,
  LAB_TRANSACTIONS, LAB_TODAY,
  type LabEmployee, type LabContract, type LabInsurance,
} from '../mock-data';

export {
  LAB_EMPLOYEES, LAB_CONTRACTS, LAB_INSURANCE, LAB_DOCUMENTS,
  LAB_TRANSACTIONS, LAB_TODAY,
};
export type { LabEmployee, LabContract, LabInsurance };

// ---------- payroll / compensation ---------------------------------------
export interface PayrollLine {
  code: string;
  label: string;
  kind: 'earning' | 'allowance' | 'deduction' | 'reimbursement';
  monthly: number;
  yearly: number;
}

export const PAYROLL_BY_EMPLOYEE: Record<string, PayrollLine[]> = {
  emp_001: [
    { code: 'PAY_BASIC',     label: 'Basic salary',        kind: 'earning',       monthly: 12_000, yearly: 144_000 },
    { code: 'PAY_HOUSING',   label: 'Housing allowance',   kind: 'allowance',     monthly:  3_000, yearly:  36_000 },
    { code: 'PAY_TRANSPORT', label: 'Transport allowance', kind: 'allowance',     monthly:  1_000, yearly:  12_000 },
    { code: 'PAY_FOOD',      label: 'Food allowance',      kind: 'allowance',     monthly:    500, yearly:   6_000 },
    { code: 'GOSI',          label: 'GOSI contribution',   kind: 'deduction',     monthly:  -1_080, yearly: -12_960 },
  ],
  emp_002: [
    { code: 'PAY_BASIC',     label: 'Basic salary',        kind: 'earning',       monthly: 18_000, yearly: 216_000 },
    { code: 'PAY_HOUSING',   label: 'Housing allowance',   kind: 'allowance',     monthly:  4_500, yearly:  54_000 },
    { code: 'PAY_TRANSPORT', label: 'Transport allowance', kind: 'allowance',     monthly:  1_200, yearly:  14_400 },
    { code: 'GOSI',          label: 'GOSI contribution',   kind: 'deduction',     monthly:  -1_620, yearly: -19_440 },
  ],
  emp_005: [
    { code: 'PAY_BASIC',     label: 'Basic salary',        kind: 'earning',       monthly:  9_500, yearly: 114_000 },
    { code: 'PAY_HOUSING',   label: 'Housing allowance',   kind: 'allowance',     monthly:  2_375, yearly:  28_500 },
    { code: 'PAY_TRANSPORT', label: 'Transport allowance', kind: 'allowance',     monthly:    800, yearly:   9_600 },
    { code: 'PAY_OTHER',     label: 'Site allowance',      kind: 'allowance',     monthly:    600, yearly:   7_200 },
  ],
};

export function payrollFor(empId: string): PayrollLine[] {
  return PAYROLL_BY_EMPLOYEE[empId] ?? [
    { code: 'PAY_BASIC',     label: 'Basic salary',        kind: 'earning',   monthly: 8_000, yearly: 96_000 },
    { code: 'PAY_HOUSING',   label: 'Housing allowance',   kind: 'allowance', monthly: 2_000, yearly: 24_000 },
    { code: 'PAY_TRANSPORT', label: 'Transport allowance', kind: 'allowance', monthly:   600, yearly:  7_200 },
  ];
}

export function payrollTotals(lines: PayrollLine[]) {
  const earnings   = lines.filter((l) => l.kind !== 'deduction').reduce((s, l) => s + l.monthly, 0);
  const deductions = lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + Math.abs(l.monthly), 0);
  const gross      = lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.monthly, 0);
  const net        = earnings - deductions;
  return { gross, allowances: earnings - gross, deductions, net, monthlyCost: earnings, yearlyCost: (earnings) * 12 };
}

// ---------- learning / experience ----------------------------------------
export interface LearningRecord {
  id: string;
  employeeId: string;
  category: 'certification' | 'training' | 'skill' | 'experience';
  title: string;
  issuer?: string;
  acquiredOn?: string;
  expiresOn?: string;
  status: 'active' | 'expiring' | 'expired' | 'in_progress';
  level?: 'beginner' | 'intermediate' | 'expert';
}

export const LEARNING: LearningRecord[] = [
  { id: 'lrn_001', employeeId: 'emp_001', category: 'certification', title: 'PMP — Project Management Professional', issuer: 'PMI',          acquiredOn: '2022-04-15', expiresOn: '2026-04-14', status: 'expiring' },
  { id: 'lrn_002', employeeId: 'emp_001', category: 'certification', title: 'OSHA Construction 30',                  issuer: 'OSHA',         acquiredOn: '2023-09-01', expiresOn: '2026-09-01', status: 'active'   },
  { id: 'lrn_003', employeeId: 'emp_001', category: 'training',      title: 'Advanced primavera P6',                 issuer: 'Internal',     acquiredOn: '2024-02-10',                          status: 'active'   },
  { id: 'lrn_004', employeeId: 'emp_001', category: 'skill',         title: 'Procurement negotiation',                                    level: 'expert',         status: 'active'   },
  { id: 'lrn_005', employeeId: 'emp_001', category: 'skill',         title: 'Civil engineering — structures',                              level: 'expert',         status: 'active'   },
  { id: 'lrn_006', employeeId: 'emp_001', category: 'skill',         title: 'Arabic — native',                                              level: 'expert',         status: 'active'   },
  { id: 'lrn_007', employeeId: 'emp_001', category: 'skill',         title: 'English — professional',                                       level: 'expert',         status: 'active'   },
  { id: 'lrn_008', employeeId: 'emp_001', category: 'experience',    title: 'Senior Project Engineer · MID Arabia',  issuer: 'MID Arabia',   acquiredOn: '2020-06-01',                          status: 'active'   },
  { id: 'lrn_009', employeeId: 'emp_001', category: 'experience',    title: 'Project Engineer · Saudi Bin Ladin',    issuer: 'SBL',          acquiredOn: '2016-03-01',                          status: 'active'   },
  { id: 'lrn_010', employeeId: 'emp_005', category: 'training',      title: 'Site safety certification',             issuer: 'MID Arabia',   acquiredOn: '2026-02-20',                          status: 'active'   },
  { id: 'lrn_011', employeeId: 'emp_005', category: 'skill',         title: 'Operations planning',                                          level: 'intermediate',   status: 'active'   },
  { id: 'lrn_012', employeeId: 'emp_006', category: 'certification', title: 'AWS Solutions Architect — Associate',   issuer: 'AWS',          acquiredOn: '2025-05-12', expiresOn: '2028-05-12', status: 'active'   },
];

// ---------- org chart ----------------------------------------------------
export interface OrgUnit {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  headcount: number;
}

export const ORG_UNITS: OrgUnit[] = [
  { id: 'org_root', code: 'MID',         name: 'MID Arabia',            parentId: null,      managerId: null,      headcount: 501 },
  { id: 'org_ops',  code: 'OPS',         name: 'Operations',            parentId: 'org_root',managerId: 'emp_005', headcount: 184 },
  { id: 'org_eng',  code: 'ENG',         name: 'Engineering',           parentId: 'org_root',managerId: 'emp_001', headcount: 142 },
  { id: 'org_hr',   code: 'HR',          name: 'Human Resources',       parentId: 'org_root',managerId: 'emp_002', headcount:  17 },
  { id: 'org_fin',  code: 'FIN',         name: 'Finance',               parentId: 'org_root',managerId: 'emp_003', headcount:  24 },
  { id: 'org_it',   code: 'IT',          name: 'Information Technology',parentId: 'org_root',managerId: 'emp_006', headcount:  12 },
  { id: 'org_log',  code: 'LOG',         name: 'Logistics',             parentId: 'org_root',managerId: 'emp_007', headcount:  48 },
  { id: 'org_sales',code: 'SALES',       name: 'Sales',                 parentId: 'org_root',managerId: 'emp_008', headcount:  31 },
  { id: 'org_eng_civ', code: 'ENG_CIV',  name: 'Civil',                 parentId: 'org_eng', managerId: 'emp_001', headcount:  72 },
  { id: 'org_eng_mep', code: 'ENG_MEP',  name: 'MEP',                   parentId: 'org_eng', managerId: null,      headcount:  44 },
  { id: 'org_eng_arc', code: 'ENG_ARC',  name: 'Architecture',          parentId: 'org_eng', managerId: null,      headcount:  26 },
  { id: 'org_ops_site',code: 'OPS_SITE', name: 'Site execution',        parentId: 'org_ops', managerId: 'emp_005', headcount: 122 },
  { id: 'org_ops_qaqc',code: 'OPS_QAQC', name: 'QA / QC',               parentId: 'org_ops', managerId: null,      headcount:  35 },
  { id: 'org_ops_safe',code: 'OPS_SAFE', name: 'Safety',                parentId: 'org_ops', managerId: null,      headcount:  27 },
];

// ---------- chatter / activity feed --------------------------------------
export interface ChatEntry {
  id: string;
  kind: 'message' | 'note' | 'activity' | 'log';
  author: string;
  authorRole: string;
  authorInitials: string;
  at: string;
  body: string;
  badges?: { label: string; tone: 'info' | 'active' | 'expiring' | 'expired' }[];
}

export const CHATTER_SALIM: ChatEntry[] = [
  {
    id: 'ch_001', kind: 'activity', author: 'System', authorRole: 'bot', authorInitials: 'SY',
    at: '2026-05-12 09:30',
    body: 'PMP certification expires in 30 days. Reminder scheduled to Abdullah Al-Saud.',
    badges: [{ label: 'Reminder', tone: 'expiring' }],
  },
  {
    id: 'ch_002', kind: 'log', author: 'Hamza Fayez', authorRole: 'Admin', authorInitials: 'HF',
    at: '2026-05-10 16:42',
    body: 'Annual review completed. Promoted from "Project Engineer" → "Senior Project Engineer". Salary band adjusted accordingly.',
    badges: [{ label: 'Promotion', tone: 'active' }],
  },
  {
    id: 'ch_003', kind: 'message', author: 'Abdullah Al-Saud', authorRole: 'HR Manager', authorInitials: 'AA',
    at: '2026-05-09 11:08',
    body: 'Salim — please share your travel preferences for Q3. Need to lock the ticket window by end of week.',
  },
  {
    id: 'ch_004', kind: 'log', author: 'System', authorRole: 'bot', authorInitials: 'SY',
    at: '2026-05-01 00:00',
    body: 'Monthly payroll run completed. Net pay: SAR 15,420.',
    badges: [{ label: 'Payroll', tone: 'info' }],
  },
  {
    id: 'ch_005', kind: 'note', author: 'Hamza Fayez', authorRole: 'Admin', authorInitials: 'HF',
    at: '2026-03-10 09:15',
    body: 'Approved annual leave (8 days). Coverage assigned to Faisal Khan.',
    badges: [{ label: 'Leave', tone: 'info' }],
  },
  {
    id: 'ch_006', kind: 'log', author: 'System', authorRole: 'bot', authorInitials: 'SY',
    at: '2026-01-01 00:00',
    body: 'Contract amendment v3 signed (raise +6%). New effective basic salary SAR 12,000.',
    badges: [{ label: 'Contract', tone: 'active' }],
  },
];

// ---------- reporting / pivot --------------------------------------------
export interface PivotRow {
  group: 'department' | 'jobTitle' | 'employee';
  label: string;
  departmentId?: string;
  monthlyCost: number;
  yearlyCost: number;
  headcount: number;
  contractsActive: number;
  insuranceActive: number;
  reviewItems: number;
  expandable?: boolean;
}

export const PIVOT_DATA: PivotRow[] = [
  { group: 'department', label: 'Engineering',             monthlyCost: 2_134_000, yearlyCost: 25_608_000, headcount: 142, contractsActive: 138, insuranceActive: 140, reviewItems: 22, expandable: true },
  { group: 'jobTitle',   label: '  Senior Project Engineer', monthlyCost:   420_000, yearlyCost:  5_040_000, headcount:  28, contractsActive:  28, insuranceActive:  28, reviewItems:  3, expandable: true },
  { group: 'employee',   label: '    Salim Al-Qahtani',     monthlyCost:    15_420, yearlyCost:    185_040, headcount:   1, contractsActive:   1, insuranceActive:   1, reviewItems:  0 },
  { group: 'employee',   label: '    + 27 others',           monthlyCost:   404_580, yearlyCost:  4_854_960, headcount:  27, contractsActive:  27, insuranceActive:  27, reviewItems:  3 },
  { group: 'jobTitle',   label: '  Site Engineer',           monthlyCost:   546_000, yearlyCost:  6_552_000, headcount:  42, contractsActive:  40, insuranceActive:  42, reviewItems:  4 },
  { group: 'jobTitle',   label: '  Project Engineer',        monthlyCost:   720_000, yearlyCost:  8_640_000, headcount:  48, contractsActive:  46, insuranceActive:  48, reviewItems:  6 },
  { group: 'jobTitle',   label: '  Junior Engineer',         monthlyCost:   448_000, yearlyCost:  5_376_000, headcount:  24, contractsActive:  24, insuranceActive:  22, reviewItems:  9 },
  { group: 'department', label: 'Operations',               monthlyCost: 2_576_000, yearlyCost: 30_912_000, headcount: 184, contractsActive: 178, insuranceActive: 182, reviewItems: 41, expandable: true },
  { group: 'department', label: 'Logistics',                monthlyCost:   528_000, yearlyCost:  6_336_000, headcount:  48, contractsActive:  44, insuranceActive:  46, reviewItems: 14 },
  { group: 'department', label: 'Sales',                    monthlyCost:   434_000, yearlyCost:  5_208_000, headcount:  31, contractsActive:  29, insuranceActive:  31, reviewItems:  3 },
  { group: 'department', label: 'Finance',                  monthlyCost:   384_000, yearlyCost:  4_608_000, headcount:  24, contractsActive:  24, insuranceActive:  24, reviewItems:  2 },
  { group: 'department', label: 'Human Resources',          monthlyCost:   272_000, yearlyCost:  3_264_000, headcount:  17, contractsActive:  17, insuranceActive:  17, reviewItems:  1 },
  { group: 'department', label: 'Information Technology',   monthlyCost:   228_000, yearlyCost:  2_736_000, headcount:  12, contractsActive:  12, insuranceActive:  12, reviewItems:  0 },
];

export const REPORT_TOTAL = {
  monthlyCost: 6_556_000,
  yearlyCost: 78_672_000,
  headcount: 458,
  contractsActive: 442,
  insuranceActive: 450,
  reviewItems:  83,
};

// ---------- helpers ------------------------------------------------------
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')).toUpperCase();
}

export function sar(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + 'SAR ' + Math.abs(n).toLocaleString('en-US');
}
