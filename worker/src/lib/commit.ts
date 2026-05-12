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

      const targetId = await applyRow(env, job.type, item, sourceFileId);

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
): Promise<string> {
  const row = item.rawPayload;
  if (jobType === 'employees') return await applyEmployee(env, row, item, sourceFileId);
  if (jobType === 'contracts') return await applyContract(env, row, sourceFileId);
  return await applyInsurance(env, row, sourceFileId);
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
): Promise<string> {
  const identity = strField(row, 'identityNumber') ?? strField(row, 'identity_number');
  if (!identity) throw new Error('missing identityNumber');
  const employee = await findEmployeeByIdentity(env, identity);
  if (!employee) throw new Error('employee not found for identity ' + identity);

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
  };
  if (!input.startDate || !input.endDate || !input.fileHash) {
    throw new Error('missing required contract fields');
  }
  return await insertContract(env, newId('ctr'), input);
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
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
