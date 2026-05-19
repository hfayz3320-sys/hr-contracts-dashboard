/**
 * Commit executor — Phase 2B safety-corrected.
 *
 * Source traceability (NEW):
 *  - Every job carries `source_hash` from /upload. The commit refuses if the
 *    underlying source_files row is missing OR (in production) is not
 *    `r2_stored=1`. Each created/updated row gets `source_file_id = source_hash`.
 *
 * Idempotency:
 *  - Each `import_job_item` is processed only when `committed_action IS NULL`.
 *  - Successful execution writes `committed_action/at/target_id` so a re-commit
 *    is a no-op.
 *  - The job-level `import_jobs.status='committed'` short-circuits the route.
 *
 * UPSERT discipline:
 *  - identity_number is the only matching key for employees.
 *  - employeeNumber appends to employee_number_history (closing the open row if
 *    changed); never written onto employees.
 *  - Contracts UNIQUE on (identity, type, start, end, file_hash).
 *  - Insurance UNIQUE on (identity, policy, member, start) — group plans
 *    sharing a policy_number are now legal.
 *  - Rows resolved as `review` or `error` at dry-run time are NOT executed.
 */
import type { Env } from '../env';
import { isProduction } from '../env';
import type { ImportCounts } from '@shared/domain';
import { newId } from './id';
import { writeAudit } from './audit';
import {
  getImportJob,
  listImportJobItems,
  markJobItemCommitted,
  markJobItemError,
  updateJobStatusAndCounts,
  type ImportJobItemRecord,
} from '../db/repo-imports';
import {
  insertEmployee,
  updateEmployeeFields,
  setCurrentEmployeeNumber,
  findEmployeeByIdentity,
  type EmployeeUpsertInput,
} from '../db/repo-employees';
import {
  insertContract,
  type ContractUpsertInput,
} from '../db/repo-contracts';
import { replaceCompensationLinesForContract } from '../db/repo-employee-360-actions';
import {
  insertInsurance,
  updateInsuranceFields,
  findInsuranceByExtendedMatchKey,
  type InsuranceUpsertInput,
} from '../db/repo-insurance';
import { insertReviewItem } from '../db/repo-review';
import { findSourceFile } from '../db/repo-source-files';
import { computeInsuranceStatus, effectiveEndDate } from './insurance-status';

export type CommitResult = {
  jobId: string;
  status: 'committed' | 'failed';
  counts: ImportCounts;
  alreadyCommitted: boolean;
};

export class CommitTraceabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitTraceabilityError';
  }
}

export async function commitImportJob(
  env: Env,
  jobId: string,
  actor: string,
): Promise<CommitResult> {
  const job = await getImportJob(env, jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  if (job.status === 'committed') {
    return { jobId, status: 'committed', counts: job.counts, alreadyCommitted: true };
  }
  if (job.status === 'failed') {
    return { jobId, status: 'failed', counts: job.counts, alreadyCommitted: true };
  }

  // ---- Source traceability gate ------------------------------------------
  if (!job.sourceHash) {
    throw new CommitTraceabilityError(
      'Job has no source_hash; commit refused. Re-upload the source file via /api/imports/upload.',
    );
  }
  const source = await findSourceFile(env, job.sourceHash);
  if (!source) {
    throw new CommitTraceabilityError(
      `source_files row for hash ${job.sourceHash} is missing; commit refused.`,
    );
  }
  if (isProduction(env) && !source.r2Stored) {
    throw new CommitTraceabilityError(
      'Production commit refused: raw file is not stored in R2. ' +
        'Upload the raw bytes via /api/imports/upload-raw before committing.',
    );
  }
  const sourceFileId = source.hash;

  // ---- Apply each item ----------------------------------------------------
  const items = await listImportJobItems(env, jobId);
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0, review: 0, error: 0 };

  for (const item of items) {
    if (item.committedAction != null) {
      // Idempotent re-tally
      if (item.committedAction === 'create') counts.created++;
      else if (item.committedAction === 'update') counts.updated++;
      else if (item.committedAction === 'skip') counts.skipped++;
      else if (item.committedAction === 'review') counts.review++;
      else if (item.committedAction === 'error') counts.error++;
      continue;
    }

    try {
      if (item.resolvedAction === 'review') {
        await ensureReviewQueueRow(env, item, jobId);
        counts.review++;
        await markJobItemCommitted(env, item.id, 'review', null);
        continue;
      }
      if (item.resolvedAction === 'error' || item.resolvedAction == null) {
        counts.error++;
        await markJobItemError(env, item.id, item.reason ?? 'unresolved item');
        continue;
      }
      if (item.resolvedAction === 'skip') {
        counts.skipped++;
        await markJobItemCommitted(env, item.id, 'skip', item.targetId);
        continue;
      }

      const targetId = await applyRow(env, job.type, item, sourceFileId, actor);

      if (item.resolvedAction === 'create') {
        counts.created++;
        await markJobItemCommitted(env, item.id, 'create', targetId);
      } else {
        counts.updated++;
        await markJobItemCommitted(env, item.id, 'update', targetId);
      }
    } catch (err) {
      counts.error++;
      await markJobItemError(env, item.id, err instanceof Error ? err.message : String(err));
    }
  }

  const finalStatus: 'committed' | 'failed' =
    counts.error > 0 && counts.created === 0 && counts.updated === 0 ? 'failed' : 'committed';

  await updateJobStatusAndCounts(env, jobId, finalStatus, counts, actor);
  await writeAudit(env, {
    actor,
    action: finalStatus === 'committed' ? 'import.commit' : 'import.fail',
    target: jobId,
    status: finalStatus === 'committed' ? 'ok' : 'error',
    details: `${counts.created} created · ${counts.updated} updated · ${counts.skipped} skipped · ${counts.review} review · ${counts.error} error`,
    jobId,
    sourceFileId,
  });

  return { jobId, status: finalStatus, counts, alreadyCommitted: false };
}

// ---- per-type appliers ---------------------------------------------------

async function applyRow(
  env: Env,
  jobType: 'employees' | 'contracts' | 'insurance',
  item: ImportJobItemRecord,
  sourceFileId: string,
  actor: string,
): Promise<string> {
  // Phase 11 — if the user edited extracted fields in the review screen,
  // those edits live on `import_job_items.corrected_payload`. Merge them
  // OVER the raw parser payload so the committed entity reflects the
  // user's corrections. Raw payload stays for audit / debug.
  const row = mergeCorrections(item.rawPayload, item.correctedPayload);
  if (jobType === 'employees') return await applyEmployee(env, row, item, sourceFileId);
  if (jobType === 'contracts') return await applyContract(env, row, sourceFileId, actor);
  return await applyInsurance(env, row, sourceFileId);
}

function mergeCorrections(
  raw: Record<string, unknown>,
  corrected: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!corrected || typeof corrected !== 'object') return raw;
  // Shallow merge — values from `corrected` win, but `undefined` (i.e.
  // "field not edited") falls through to the raw value. We intentionally
  // do NOT recursively merge: nested arrays like `otherAllowances` are
  // replaced wholesale when the user touches them so a deleted line
  // really disappears.
  const out: Record<string, unknown> = { ...raw };
  for (const k of Object.keys(corrected)) {
    const v = corrected[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function applyEmployee(
  env: Env,
  row: Record<string, unknown>,
  item: ImportJobItemRecord,
  sourceFileId: string,
): Promise<string> {
  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number');
  if (!identity) throw new Error('missing identityNumber');

  const input: EmployeeUpsertInput = {
    identityNumber: identity,
    fullName: strField(row, 'fullName') ?? strField(row, 'full_name') ?? '',
    fullNameArabic:
      strField(row, 'fullNameArabic') ?? strField(row, 'full_name_arabic') ?? null,
    department: strField(row, 'department') ?? null,
    jobTitle: strField(row, 'jobTitle') ?? strField(row, 'job_title') ?? null,
    nationality: strField(row, 'nationality') ?? null,
    dateOfBirth: strField(row, 'dateOfBirth') ?? strField(row, 'date_of_birth') ?? null,
    hireDate: strField(row, 'hireDate') ?? strField(row, 'hire_date') ?? null,
    status: (strField(row, 'status') as 'active' | 'inactive' | undefined) ?? 'active',
    sourceFileId,
  };

  let employeeId: string;
  if (item.resolvedAction === 'create') {
    employeeId = await insertEmployee(env, newId('emp'), input);
  } else {
    const existing = await findEmployeeByIdentity(env, identity);
    employeeId = existing
      ? (await updateEmployeeFields(env, existing.id, input), existing.id)
      : await insertEmployee(env, newId('emp'), input);
  }

  const employeeNumber = strField(row, 'employeeNumber') ?? strField(row, 'employee_number');
  if (employeeNumber) {
    const fromDate = input.hireDate ?? new Date().toISOString().slice(0, 10);
    await setCurrentEmployeeNumber(env, employeeId, employeeNumber, fromDate, sourceFileId);
  }

  return employeeId;
}

async function applyContract(
  env: Env,
  row: Record<string, unknown>,
  sourceFileId: string,
  actor: string,
): Promise<string> {
  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number');
  if (!identity) throw new Error('missing identityNumber');
  const employee = await findEmployeeByIdentity(env, identity);
  if (!employee) throw new Error('employee not found for identity ' + identity);

  let basicSalary       = numField(row, 'basicSalary')       ?? numField(row, 'basic_salary')       ?? null;
  let housingAllowance  = numField(row, 'housingAllowance')  ?? numField(row, 'housing_allowance')  ?? null;
  let transportAllowance= numField(row, 'transportAllowance')?? numField(row, 'transport_allowance')?? null;
  const otherCash         = numField(row, 'otherCashAllowances') ?? numField(row, 'other_cash_allowances') ?? null;
  let totalSalary       = numField(row, 'totalSalary')       ?? numField(row, 'total_salary')       ?? null;
  const currency          = strField(row, 'currency') ?? 'SAR';
  let otherAllowances   = arrayField(row, 'otherAllowances') ?? arrayField(row, 'other_allowances') ?? null;
  if ((!otherAllowances || otherAllowances.length === 0) && otherCash != null && otherCash > 0) {
    otherAllowances = [{ code: 'PAY_OTHER', name: 'Other cash allowances', amount: otherCash }];
  }
  const extractionWarnings = warningsField(row);
  const suspiciousSalary = isSuspiciousSalary({
    templateType: strField(row, 'templateType') ?? strField(row, 'template_type') ?? null,
    warnings: extractionWarnings,
    basicSalary,
    totalSalary,
  });
  if (suspiciousSalary) {
    basicSalary = null;
    housingAllowance = null;
    transportAllowance = null;
    totalSalary = null;
    otherAllowances = null;
  }

  const input: ContractUpsertInput = {
    employeeId: employee.id,
    identityNumber: identity,
    contractType: strField(row, 'contractType') ?? strField(row, 'contract_type') ?? 'Fixed-term',
    startDate: strField(row, 'startDate') ?? strField(row, 'start_date') ?? '',
    endDate: strField(row, 'endDate') ?? strField(row, 'end_date') ?? '',
    status: (strField(row, 'status') as 'active' | 'expiring' | 'expired') ?? 'active',
    fileHash: strField(row, 'fileHash') ?? strField(row, 'file_hash') ?? '',
    filename: strField(row, 'filename') ?? '',
    extractionConfidence:
      numField(row, 'extractionConfidence') ?? numField(row, 'extraction_confidence') ?? null,
    notes: strField(row, 'notes') ?? null,
    sourceFileId,
    basicSalary,
    housingAllowance,
    transportAllowance,
    otherAllowances: otherAllowances && otherAllowances.length > 0 ? otherAllowances : null,
    totalSalary,
    currency,
    contractNumber: strField(row, 'contractNumber') ?? strField(row, 'contract_number') ?? null,
    executionDate: strField(row, 'executionDate') ?? strField(row, 'execution_date') ?? null,
    passportNumber: strField(row, 'passportNumber') ?? strField(row, 'passport_number') ?? null,
    gender: strField(row, 'gender') ?? null,
    maritalStatus: strField(row, 'maritalStatus') ?? strField(row, 'marital_status') ?? null,
    birthDate: strField(row, 'birthDate') ?? strField(row, 'birth_date') ?? null,
    occupation: strField(row, 'occupation') ?? null,
    workLocation: strField(row, 'workLocation') ?? strField(row, 'work_location') ?? null,
    mobile: strField(row, 'mobile') ?? null,
    email: strField(row, 'email') ?? null,
    bankName: strField(row, 'bankName') ?? strField(row, 'bank_name') ?? null,
    iban: strField(row, 'iban') ?? null,
    educationLevel: strField(row, 'educationLevel') ?? strField(row, 'education_level') ?? null,
    speciality: strField(row, 'speciality') ?? strField(row, 'specialty') ?? null,
    extractionWarnings,
  };
  if (!input.startDate || !input.endDate || !input.fileHash) {
    throw new Error('missing required contract fields');
  }
  const contractId = await insertContract(env, newId('ctr'), input);

  // Enrich employee master with contact fields from the contract when present.
  await updateEmployeeFields(env, employee.id, {
    ...(input.mobile ? { mobile: input.mobile } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.passportNumber ? { passportNumber: input.passportNumber } : {}),
    ...(suspiciousSalary ? {} : (strField(row, 'nationality') ? { nationality: strField(row, 'nationality') } : {})),
    ...(input.birthDate ? { dateOfBirth: input.birthDate } : {}),
    ...(suspiciousSalary ? {} : (input.occupation || strField(row, 'jobTitle')
      ? { jobTitle: input.occupation ?? strField(row, 'jobTitle') ?? undefined }
      : {})),
  });

  // Phase 11 — populate employee_compensation_lines so the Profile's
  // Compensation tab shows the contract's salary breakdown. The lines
  // are linked back to this contract via source_contract_id so a re-
  // commit replaces them rather than doubling. Effective window mirrors
  // the contract's start/end dates.
  const components: { code: string; name: string; amount: number }[] = [];
  if (basicSalary && basicSalary > 0) {
    components.push({ code: 'PAY_BASIC', name: 'Basic salary', amount: basicSalary });
  }
  if (housingAllowance && housingAllowance > 0) {
    components.push({ code: 'PAY_HOUSING', name: 'Housing allowance', amount: housingAllowance });
  }
  if (transportAllowance && transportAllowance > 0) {
    components.push({ code: 'PAY_TRANSPORT', name: 'Transportation allowance', amount: transportAllowance });
  }
  if (otherAllowances) {
    for (const a of otherAllowances) {
      if (Number.isFinite(a.amount) && a.amount > 0) {
        components.push({ code: a.code, name: a.name, amount: a.amount });
      }
    }
  }
  if (components.length > 0) {
    await replaceCompensationLinesForContract(env, {
      employeeId: employee.id,
      contractId,
      effectiveFrom: input.startDate,
      effectiveTo: input.endDate,
      currency,
      actor,
      components,
    });
    await writeAudit(env, {
      actor,
      action: 'employee.compensation_updated',
      target: employee.id,
      status: 'ok',
      details:
        `Derived ${components.length} compensation line(s) from contract ${contractId}` +
        ` (total=${totalSalary ?? components.reduce((s, c) => s + c.amount, 0)} ${currency})`,
    });
  }
  return contractId;
}

async function applyInsurance(
  env: Env,
  row: Record<string, unknown>,
  sourceFileId: string,
): Promise<string> {
  const policyNumber = strField(row, 'policyNumber') ?? strField(row, 'policy_number');
  const startDate = strField(row, 'startDate') ?? strField(row, 'start_date');
  if (!policyNumber || !startDate) throw new Error('missing insurance match key');

  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number') ?? null;
  const memberNumber =
    strField(row, 'memberNumber') ??
    strField(row, 'member_number') ??
    strField(row, 'cardNumber') ??
    strField(row, 'card_number') ??
    null;
  const employee = identity ? await findEmployeeByIdentity(env, identity) : null;

  // Phase 3C — compute endDate + status server-side. The adapter's
  // text-derived `status` field is no longer authoritative (its previous
  // "anything I don't recognise becomes missing" behaviour landed 519
  // active policies in the dashboard's "missing" KPI). Instead we derive
  // status from the policy's date window — startDate + computed endDate
  // (year+1 default) — and the presence of critical fields. The
  // adapter-provided status remains in the import row payload for audit.
  const rawEnd = strField(row, 'endDate') ?? strField(row, 'end_date') ?? null;
  const effectiveEnd = effectiveEndDate(startDate, rawEnd);
  const computedStatus = computeInsuranceStatus({
    identityNumber: identity,
    policyNumber,
    startDate,
    endDate: rawEnd,
  });

  const input: InsuranceUpsertInput = {
    employeeId: employee?.id ?? null,
    identityNumber: identity,
    policyNumber,
    memberNumber,
    provider: strField(row, 'provider') ?? '',
    planClass: strField(row, 'planClass') ?? strField(row, 'plan_class') ?? null,
    nationality: strField(row, 'nationality') ?? null,
    memberName:
      strField(row, 'memberName') ??
      strField(row, 'member_name') ??
      strField(row, 'fullName') ??
      strField(row, 'full_name') ??
      null,
    reviewFlags: warningsField(row),
    startDate,
    endDate: effectiveEnd,
    status: computedStatus,
    matched: !!employee,
    unmatchedReason: employee
      ? undefined
      : ((strField(row, 'unmatchedReason') as InsuranceUpsertInput['unmatchedReason']) ??
        'no_identity_match'),
    sourceFileId,
  };

  const existing = await findInsuranceByExtendedMatchKey(
    env,
    identity,
    policyNumber,
    memberNumber,
    startDate,
  );
  if (existing) {
    await updateInsuranceFields(env, existing.id, input);
    return existing.id;
  }
  return await insertInsurance(env, newId('ins'), input);
}

async function ensureReviewQueueRow(
  env: Env,
  item: ImportJobItemRecord,
  jobId: string,
): Promise<void> {
  const reason = item.reason ?? 'unspecified_review';
  const reviewReason = mapItemReasonToReviewReason(reason);
  const description = `Import row ${item.rowIndex + 1} flagged as ${reason}`;
  const details = `identityNumber=${item.identityNumber ?? '(missing)'} · row=${item.rowIndex} · job=${jobId}`;
  await insertReviewItem(env, {
    id: newId('rev'),
    reason: reviewReason,
    entity: 'employee',
    description,
    details,
    importJobId: jobId,
    payload: item.rawPayload,
  });
}

function mapItemReasonToReviewReason(reason: string): string {
  switch (reason) {
    case 'missing_identity':
    case 'duplicate_identity':
    case 'duplicate_identity_in_file':
    case 'conflicting_employee_number':
    case 'unmatched_contract':
    case 'unmatched_insurance':
    case 'low_confidence_extraction':
    case 'group_insurance_member_missing':
    case 'missing_contract_fields':
    // Phase 8 — contract-pipeline reasons (mirrors reviewReasonSchema).
    case 'duration_negative':
    case 'unknown_template':
    case 'missing_full_name':
      return reason;
    default:
      return 'missing_identity';
  }
}

// ---- helpers --------------------------------------------------------------

function strField(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
function numField(row: Record<string, unknown>, key: string): number | undefined {
  const v = row[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function warningsField(row: Record<string, unknown>): string[] | null {
  const v = row.warnings;
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length > 0 ? out : null;
}

function arrayField(
  row: Record<string, unknown>,
  key: string,
): { code: string; name: string; amount: number }[] | undefined {
  const v = row[key];
  if (!Array.isArray(v)) return undefined;
  const out: { code: string; name: string; amount: number }[] = [];
  for (const e of v) {
    if (typeof e !== 'object' || e == null) continue;
    const code = (e as { code?: unknown }).code;
    const name = (e as { name?: unknown }).name;
    const amount = (e as { amount?: unknown }).amount;
    if (typeof code === 'string' && typeof name === 'string' && typeof amount === 'number') {
      out.push({ code, name, amount });
    }
  }
  return out;
}

function isSuspiciousSalary(args: {
  templateType: string | null;
  warnings: string[] | null;
  basicSalary: number | null;
  totalSalary: number | null;
}): boolean {
  const hasWarning =
    (args.warnings ?? []).some((w) =>
      /salary values appear unusually low|adjacent label text/i.test(w),
    );
  const lowOldTemplate =
    args.templateType === 'old_contract' &&
    ((typeof args.totalSalary === 'number' && args.totalSalary > 0 && args.totalSalary < 500) ||
      (typeof args.basicSalary === 'number' && args.basicSalary > 0 && args.basicSalary < 500));
  return hasWarning || lowOldTemplate;
}
