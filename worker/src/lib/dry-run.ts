/**
 * Dry-run UPSERT resolver for Phase 2A.
 *
 * Given a batch of already-parsed rows (no real PDF/XLSX parsing yet) and
 * the import type, decide what each row WOULD do — create, update, skip,
 * review, or error — without mutating any target table.
 *
 * Hard rules embedded here:
 *  - identity_number is the primary match key on employees
 *  - employee_number is secondary/history only — never used as a match key
 *  - No row matched by multiple existing employees (data quality gate)
 *  - Same-content rows that hit no diff are `skip`, not `update`
 */
import type { Env } from '../env';
import type { ImportPreviewItem, ImportJobType } from '@shared/domain';
import { findEmployeeByIdentity } from '../db/repo-employees';
import { findContractByMatchKey } from '../db/repo-contracts';
import { findInsuranceByExtendedMatchKey } from '../db/repo-insurance';

export type DryRunResult = {
  items: ImportPreviewItem[];
  counts: { created: number; updated: number; skipped: number; review: number; error: number };
};

export async function resolveDryRunItem(
  env: Env,
  type: ImportJobType,
  row: Record<string, unknown>,
  rowIndex = 0,
): Promise<ImportPreviewItem> {
  if (type === 'employees') return resolveEmployeeRow(env, rowIndex, row);
  if (type === 'contracts') return resolveContractRow(env, rowIndex, row);
  return resolveInsuranceRow(env, rowIndex, row);
}

export async function resolveDryRun(
  env: Env,
  type: ImportJobType,
  rows: Array<Record<string, unknown>>,
): Promise<DryRunResult> {
  const items: ImportPreviewItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    if (type === 'employees') {
      items.push(await resolveDryRunItem(env, 'employees', row, i));
    } else if (type === 'contracts') {
      items.push(await resolveDryRunItem(env, 'contracts', row, i));
    } else {
      items.push(await resolveDryRunItem(env, 'insurance', row, i));
    }
  }

  const counts = tally(items);
  return { items, counts };
}

function tally(items: ImportPreviewItem[]) {
  const c = { created: 0, updated: 0, skipped: 0, review: 0, error: 0 };
  for (const it of items) {
    if (it.resolvedAction === 'create') c.created++;
    else if (it.resolvedAction === 'update') c.updated++;
    else if (it.resolvedAction === 'skip') c.skipped++;
    else if (it.resolvedAction === 'review') c.review++;
    else c.error++;
  }
  return c;
}

// ---------- per-type resolvers ---------------------------------------------

async function resolveEmployeeRow(
  env: Env,
  rowIndex: number,
  row: Record<string, unknown>,
): Promise<ImportPreviewItem> {
  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number');
  if (!identity) {
    return {
      rowIndex,
      identityNumber: null,
      resolvedAction: 'review',
      reason: 'missing_identity',
    };
  }

  const fullName = strField(row, 'fullName') ?? strField(row, 'full_name');
  if (!fullName) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'error',
      reason: 'missing_full_name',
    };
  }

  const existing = await findEmployeeByIdentity(env, identity);
  if (!existing) {
    return { rowIndex, identityNumber: identity, resolvedAction: 'create' };
  }

  const incoming: Partial<{
    fullName: string;
    department: string;
    jobTitle: string;
    nationality: string;
    status: 'active' | 'inactive';
  }> = {
    fullName,
    ...optStr(row, ['department', 'department']),
    ...optStr(row, ['jobTitle', 'job_title']),
    ...optStr(row, ['nationality', 'nationality']),
    ...optStatus(row),
  };

  const diff = computeDiff(
    {
      fullName: existing.fullName,
      department: existing.department,
      jobTitle: existing.jobTitle,
      nationality: existing.nationality,
      status: existing.status,
    },
    incoming,
  );

  if (Object.keys(diff).length === 0) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'skip',
      targetId: existing.id,
      reason: 'no_changes',
    };
  }
  return {
    rowIndex,
    identityNumber: identity,
    resolvedAction: 'update',
    targetId: existing.id,
    diff,
  };
}

async function resolveContractRow(
  env: Env,
  rowIndex: number,
  row: Record<string, unknown>,
): Promise<ImportPreviewItem> {
  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number');
  const contractType = strField(row, 'contractType') ?? strField(row, 'contract_type');
  const startDate = strField(row, 'startDate') ?? strField(row, 'start_date');
  const endDate = strField(row, 'endDate') ?? strField(row, 'end_date');
  const fileHash = strField(row, 'fileHash') ?? strField(row, 'file_hash');
  const templateType = strField(row, 'templateType') ?? strField(row, 'template_type');
  const confidence = numField(row, 'extractionConfidence') ?? numField(row, 'extraction_confidence');
  const warnings = warningsField(row);
  const basicSalary = numField(row, 'basicSalary') ?? numField(row, 'basic_salary');
  const totalSalary = numField(row, 'totalSalary') ?? numField(row, 'total_salary');

  if (!identity) {
    return { rowIndex, identityNumber: null, resolvedAction: 'review', reason: 'missing_identity' };
  }
  // Phase 2C: missing dates / contract fields go to REVIEW QUEUE, not error.
  // The raw payload (preserved verbatim on the import_job_items row) carries
  // filename, templateType, extractionConfidence, missingFields and the
  // redacted rawTextSnippet so a human reviewer can act on it instead of
  // the whole batch failing.
  if (!contractType || !startDate || !endDate || !fileHash) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'missing_contract_fields',
    };
  }

  // Phase 8 — enforce the lifecycle review rule at IMPORT time, not just at
  // read time. A contract whose end_date is before its start_date is a
  // genuine defect; a contract whose template the parser couldn't recognise
  // needs human eyes before it lands in the table; a low-confidence
  // extraction should be triaged.
  if (endDate < startDate) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'duration_negative',
    };
  }
  if (templateType === 'unknown') {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'unknown_template',
    };
  }
  if (confidence !== undefined && confidence < 0.6) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'low_confidence_extraction',
    };
  }
  if (
    templateType === 'old_contract' &&
    ((typeof totalSalary === 'number' && totalSalary > 0 && totalSalary < 500) ||
      (typeof basicSalary === 'number' && basicSalary > 0 && basicSalary < 500))
  ) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'low_confidence_extraction',
    };
  }
  if (
    warnings.some((w) =>
      /salary values appear unusually low|name may include adjacent label text|nationality may include adjacent label text|job title may include adjacent label text/i.test(
        w,
      ),
    )
  ) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'low_confidence_extraction',
    };
  }

  const employee = await findEmployeeByIdentity(env, identity);
  if (!employee) {
    return {
      rowIndex,
      identityNumber: identity,
      resolvedAction: 'review',
      reason: 'unmatched_contract',
    };
  }

  const existing = await findContractByMatchKey(env, {
    identityNumber: identity,
    contractType,
    startDate,
    endDate,
    fileHash,
  });
  if (!existing) {
    return { rowIndex, identityNumber: identity, resolvedAction: 'create', targetId: employee.id };
  }
  return {
    rowIndex,
    identityNumber: identity,
    resolvedAction: 'skip',
    targetId: existing.id,
    reason: 'no_changes',
  };
}

async function resolveInsuranceRow(
  env: Env,
  rowIndex: number,
  row: Record<string, unknown>,
): Promise<ImportPreviewItem> {
  const policyNumber = strField(row, 'policyNumber') ?? strField(row, 'policy_number');
  const startDate = strField(row, 'startDate') ?? strField(row, 'start_date');
  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number');
  const memberNumber =
    strField(row, 'memberNumber') ??
    strField(row, 'member_number') ??
    strField(row, 'cardNumber') ??
    strField(row, 'card_number') ??
    null;

  if (!policyNumber || !startDate) {
    return {
      rowIndex,
      identityNumber: identity ?? null,
      resolvedAction: 'error',
      reason: 'missing_insurance_fields',
    };
  }

  const employee = identity ? await findEmployeeByIdentity(env, identity) : null;
  const matched = !!employee;

  // Extended match key — IMPORTANT: group medical insurance shares a single
  // policy_number across many employees. Using policy+start alone would
  // false-match unrelated members and report `skip` for what should be a
  // `create`. The unique key is (identity, policy, member, start_date).
  const existing = await findInsuranceByExtendedMatchKey(
    env,
    identity ?? null,
    policyNumber,
    memberNumber,
    startDate,
  );
  if (!existing) {
    return {
      rowIndex,
      identityNumber: identity ?? null,
      resolvedAction: matched ? 'create' : 'review',
      ...(matched && employee ? { targetId: employee.id } : {}),
      reason: matched ? undefined : 'unmatched_insurance',
    };
  }
  return {
    rowIndex,
    identityNumber: identity ?? null,
    resolvedAction: 'skip',
    targetId: existing.id,
    reason: 'no_changes',
  };
}

// ---------- helpers --------------------------------------------------------

function strField(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function numField(row: Record<string, unknown>, key: string): number | undefined {
  const v = row[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function warningsField(row: Record<string, unknown>): string[] {
  const v = row.warnings ?? row.extractionWarnings;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function optStr<K extends string>(row: Record<string, unknown>, [outKey, inKey]: [K, string]) {
  const v = strField(row, inKey);
  return v ? ({ [outKey]: v } as Record<K, string>) : ({} as Record<K, never>);
}

function optStatus(row: Record<string, unknown>): { status?: 'active' | 'inactive' } {
  const v = strField(row, 'status');
  if (v === 'active' || v === 'inactive') return { status: v };
  return {};
}

function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (after[k] !== undefined && after[k] !== before[k]) {
      diff[k] = { from: before[k] ?? null, to: after[k] };
    }
  }
  return diff;
}
