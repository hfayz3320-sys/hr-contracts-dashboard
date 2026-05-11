/**
 * Phase 4A A2 — read-time Employee data-quality report.
 *
 * Pure computation over the materials we already fetched for the 360
 * view. The route handler does NOT hit D1 a second time to build this;
 * it composes from `employee`, `contracts`, `insurance`, `documents`.
 *
 * Coverage of `EmployeeDataQualityIssue` (kept aligned with the enum in
 * shared/api-contract.ts):
 *
 *   missing_date_of_birth        — employee.dateOfBirth is empty
 *   missing_nationality          — employee.nationality is empty
 *   missing_hire_date            — employee.hireDate is empty
 *   no_current_employee_number   — no employeeNumberHistory entry with
 *                                  `to == null` (a currently-open assignment)
 *   iqama_expiring_soon_30d      — current iqama doc, expires within 30 days
 *   iqama_expired                — current iqama doc, already past expiry
 *   passport_expiring_soon_180d  — current passport doc, expires within 180d
 *   passport_expired             — current passport doc, already past expiry
 *   no_active_contract           — no contract whose stored status='active'
 *                                  AND that has no dataQualityIssue
 *   no_active_insurance          — no insurance whose COMPUTED status is
 *                                  'active' (insurance.status comes from
 *                                  rowToInsurance, which Phase 3C-2 made
 *                                  read-time)
 *   contract_with_quality_flag   — any contract has dataQualityIssue set
 *
 * Today comparisons use ISO YYYY-MM-DD string comparison (lexicographic)
 * which is correct as long as dates are well-formed. Malformed dates
 * are skipped (no false positives).
 *
 * `reviewItemIds` is left empty here. Linking to the review_queue rows
 * that drove a given issue is a follow-up (A3) — the field is on the
 * schema so the API contract is forward-compatible.
 */
import type {
  Contract,
  Employee,
  EmployeeDataQualityIssue,
  EmployeeDataQualityReport,
  EmployeeDocument,
  Insurance,
} from '@shared/domain';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isWellFormedDate(s: string | null | undefined): s is string {
  return typeof s === 'string' && ISO_DATE_RE.test(s);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isPresent(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

function findCurrentDoc(
  documents: EmployeeDocument[],
  type: EmployeeDocument['type'],
): EmployeeDocument | undefined {
  return documents.find((d) => d.type === type && d.isCurrent);
}

export interface EmployeeDataQualityInput {
  employee: Employee;
  contracts: Contract[];
  insurance: Insurance[];
  documents: EmployeeDocument[];
}

export function computeEmployeeDataQuality(
  input: EmployeeDataQualityInput,
): EmployeeDataQualityReport {
  const today = todayISO();
  const issues: EmployeeDataQualityIssue[] = [];

  // ---- core employee fields --------------------------------------------
  if (!isPresent(input.employee.dateOfBirth)) issues.push('missing_date_of_birth');
  if (!isPresent(input.employee.nationality)) issues.push('missing_nationality');
  if (!isPresent(input.employee.hireDate)) issues.push('missing_hire_date');

  const hasOpenEmpNo = input.employee.employeeNumberHistory.some(
    (h) => h.to == null,
  );
  if (!hasOpenEmpNo) issues.push('no_current_employee_number');

  // ---- iqama / passport expiry ----------------------------------------
  const iqama = findCurrentDoc(input.documents, 'iqama');
  if (iqama && isWellFormedDate(iqama.expiresAt)) {
    if (iqama.expiresAt < today) {
      issues.push('iqama_expired');
    } else if (iqama.expiresAt <= addDaysISO(today, 30)) {
      issues.push('iqama_expiring_soon_30d');
    }
  }

  const passport = findCurrentDoc(input.documents, 'passport');
  if (passport && isWellFormedDate(passport.expiresAt)) {
    if (passport.expiresAt < today) {
      issues.push('passport_expired');
    } else if (passport.expiresAt <= addDaysISO(today, 180)) {
      issues.push('passport_expiring_soon_180d');
    }
  }

  // ---- contracts -------------------------------------------------------
  const cleanActiveContract = input.contracts.some(
    (c) => c.status === 'active' && c.dataQualityIssue == null,
  );
  if (!cleanActiveContract) issues.push('no_active_contract');

  if (input.contracts.some((c) => c.dataQualityIssue != null)) {
    issues.push('contract_with_quality_flag');
  }

  // ---- insurance -------------------------------------------------------
  // insurance.status here is the COMPUTED value (rowToInsurance returns
  // it through `status`, not a separate field).
  const activeIns = input.insurance.some((i) => i.status === 'active');
  if (!activeIns) issues.push('no_active_insurance');

  return { issues, reviewItemIds: [] };
}
