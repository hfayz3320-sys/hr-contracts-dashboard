import type { Env } from '../env';
import type { Contract, ContractStatus } from '@shared/domain';
import { buildEmployeeSummaryMap } from './employee-summary';
import { computeContractDataQualityIssue } from '../lib/contract-quality';

type ContractRow = {
  id: string;
  employee_id: string;
  identity_number: string;
  contract_type: string;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  version: number;
  version_of: string | null;
  file_hash: string;
  filename: string;
  extraction_confidence: number | null;
  notes: string | null;
  created_at: string;
  // Phase 11 — salary breakdown columns added by migration 0009. Optional
  // on the row type so pre-migration databases (where the columns don't
  // exist) still type-check.
  basic_salary?: number | null;
  housing_allowance?: number | null;
  transport_allowance?: number | null;
  other_allowances_json?: string | null;
  total_salary?: number | null;
  currency?: string | null;
};

/**
 * Map a D1 row to the API-facing Contract shape.
 *
 * Phase 3D: every emitted row carries an optional `dataQualityIssue`
 * computed from start/end dates. Surfaces the parser mis-extractions
 * (143 out of 328 production rows: 53 over-3-years + 90 negative-
 * duration) to the FE so an admin sees a "Review required" badge
 * instead of a misleading green "Active" pill.
 *
 * The stored `contracts.status` column is left untouched — it still
 * reflects what the import pipeline computed at commit time and is
 * useful as an audit baseline.
 */
function rowToContract(r: ContractRow): Contract {
  const dataQualityIssue = computeContractDataQualityIssue({
    startDate: r.start_date,
    endDate: r.end_date,
  });
  // Phase 11 — parse the JSON-encoded allowances array if present. Errors
  // are swallowed: an unparseable blob (manual SQL hack, schema drift)
  // just yields `otherAllowances` = []; the source row stays for audit.
  let otherAllowances: { code: string; name: string; amount: number }[] | undefined;
  if (typeof r.other_allowances_json === 'string' && r.other_allowances_json.length > 0) {
    try {
      const parsed = JSON.parse(r.other_allowances_json) as unknown;
      if (Array.isArray(parsed)) {
        otherAllowances = parsed.filter(
          (x): x is { code: string; name: string; amount: number } =>
            typeof x === 'object' && x != null &&
            typeof (x as { code?: unknown }).code === 'string' &&
            typeof (x as { name?: unknown }).name === 'string' &&
            typeof (x as { amount?: unknown }).amount === 'number',
        );
      }
    } catch { /* ignore */ }
  }
  return {
    id: r.id,
    employeeId: r.employee_id,
    identityNumber: r.identity_number,
    contractType: r.contract_type,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    version: r.version,
    ...(r.version_of != null ? { versionOf: r.version_of } : {}),
    fileHash: r.file_hash,
    filename: r.filename,
    ...(r.extraction_confidence != null ? { extractionConfidence: r.extraction_confidence } : {}),
    ...(r.notes != null ? { notes: r.notes } : {}),
    ...(r.basic_salary != null ? { basicSalary: r.basic_salary } : {}),
    ...(r.housing_allowance != null ? { housingAllowance: r.housing_allowance } : {}),
    ...(r.transport_allowance != null ? { transportAllowance: r.transport_allowance } : {}),
    ...(otherAllowances && otherAllowances.length > 0 ? { otherAllowances } : {}),
    ...(r.total_salary != null ? { totalSalary: r.total_salary } : {}),
    ...(r.currency != null ? { currency: r.currency } : {}),
    createdAt: r.created_at,
    ...(dataQualityIssue != null ? { dataQualityIssue } : {}),
  };
}

export async function listContracts(
  env: Env,
  opts: { includeEmployee?: boolean } = {},
): Promise<{ items: Contract[]; total: number }> {
  const rows = await env.DB
    .prepare(`SELECT * FROM contracts ORDER BY end_date DESC`)
    .all<ContractRow>();
  const baseItems = (rows.results ?? []).map(rowToContract);
  if (!opts.includeEmployee) {
    return { items: baseItems, total: baseItems.length };
  }
  // Phase 3B — embed compact employee summary + linkStatus. The front end
  // uses this so contract rows can show an employee name without the page
  // needing a parallel /api/employees fetch (which was the failure point
  // behind Phase 2F's "across 0 employees" symptom).
  const summaryMap = await buildEmployeeSummaryMap(
    env,
    baseItems.map((c) => c.employeeId),
  );
  const items: Contract[] = baseItems.map((c) => {
    const s = summaryMap.get(c.employeeId) ?? null;
    return { ...c, employeeSummary: s, linkStatus: s ? 'linked' : 'unmatched' };
  });
  return { items, total: items.length };
}

export async function listContractsForEmployee(env: Env, employeeId: string): Promise<Contract[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM contracts WHERE employee_id = ? ORDER BY version DESC, end_date DESC`)
    .bind(employeeId)
    .all<ContractRow>();
  return (rows.results ?? []).map(rowToContract);
}

export type ContractMatchKey = {
  identityNumber: string;
  contractType: string;
  startDate: string;
  endDate: string;
  fileHash: string;
};

export async function findContractByMatchKey(
  env: Env,
  key: ContractMatchKey,
): Promise<Contract | null> {
  const r = await env.DB
    .prepare(
      `SELECT * FROM contracts
       WHERE identity_number = ? AND contract_type = ?
         AND start_date = ? AND end_date = ? AND file_hash = ?`,
    )
    .bind(key.identityNumber, key.contractType, key.startDate, key.endDate, key.fileHash)
    .first<ContractRow>();
  return r ? rowToContract(r) : null;
}

// ===========================================================================
// UPSERT helpers used by the commit pipeline (Phase 2B)
// ===========================================================================

export type ContractUpsertInput = {
  employeeId: string;
  identityNumber: string;
  contractType: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  fileHash: string;
  filename: string;
  extractionConfidence?: number | null;
  notes?: string | null;
  /** Source-traceability — every contract row must point to a source_files entry. */
  sourceFileId: string;
  // Phase 11 — salary breakdown from the source PDF.
  basicSalary?: number | null;
  housingAllowance?: number | null;
  transportAllowance?: number | null;
  otherAllowances?: { code: string; name: string; amount: number }[] | null;
  totalSalary?: number | null;
  currency?: string | null;
};

export async function insertContract(
  env: Env,
  id: string,
  input: ContractUpsertInput,
): Promise<string> {
  const prev = await env.DB
    .prepare(
      `SELECT id, version FROM contracts
       WHERE employee_id = ? AND contract_type = ?
       ORDER BY version DESC LIMIT 1`,
    )
    .bind(input.employeeId, input.contractType)
    .first<{ id: string; version: number }>();
  const nextVersion = (prev?.version ?? 0) + 1;
  const versionOf = prev?.id ?? null;

  // Phase 11 — try the wide INSERT (with salary columns from migration
  // 0009) first; fall back to the legacy column set if the columns
  // aren't on this database yet. Same "no such column" pattern as
  // insertEmployee above.
  const otherAllowancesJson = input.otherAllowances && input.otherAllowances.length > 0
    ? JSON.stringify(input.otherAllowances)
    : null;
  try {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO contracts
         (id, employee_id, identity_number, contract_type, start_date, end_date,
          status, version, version_of, file_hash, filename, extraction_confidence,
          notes, source_file_id,
          basic_salary, housing_allowance, transport_allowance,
          other_allowances_json, total_salary, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.employeeId,
        input.identityNumber,
        input.contractType,
        input.startDate,
        input.endDate,
        input.status,
        nextVersion,
        versionOf,
        input.fileHash,
        input.filename,
        input.extractionConfidence ?? null,
        input.notes ?? null,
        input.sourceFileId,
        input.basicSalary ?? null,
        input.housingAllowance ?? null,
        input.transportAllowance ?? null,
        otherAllowancesJson,
        input.totalSalary ?? null,
        input.currency ?? 'SAR',
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such column/i.test(msg)) throw err;
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO contracts
         (id, employee_id, identity_number, contract_type, start_date, end_date,
          status, version, version_of, file_hash, filename, extraction_confidence,
          notes, source_file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.employeeId,
        input.identityNumber,
        input.contractType,
        input.startDate,
        input.endDate,
        input.status,
        nextVersion,
        versionOf,
        input.fileHash,
        input.filename,
        input.extractionConfidence ?? null,
        input.notes ?? null,
        input.sourceFileId,
      )
      .run();
  }

  await env.DB
    .prepare(
      `INSERT OR IGNORE INTO contract_versions
       (id, contract_id, version, start_date, end_date, file_hash, filename)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      id,
      nextVersion,
      input.startDate,
      input.endDate,
      input.fileHash,
      input.filename,
    )
    .run();

  const final = await findContractByMatchKey(env, {
    identityNumber: input.identityNumber,
    contractType: input.contractType,
    startDate: input.startDate,
    endDate: input.endDate,
    fileHash: input.fileHash,
  });
  return final?.id ?? id;
}

/**
 * Apply a partial update to a contract. Used by the admin "Fix contract"
 * action on the Contracts page + the Review Queue resolver. Only fields
 * supplied in `patch` are touched.
 */
export async function updateContractFields(
  env: Env,
  id: string,
  patch: Partial<{
    contractType: string;
    startDate: string;
    endDate: string;
    status: ContractStatus;
    employeeId: string;
    identityNumber: string;
    notes: string | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.contractType !== undefined)   { sets.push('contract_type = ?');   binds.push(patch.contractType); }
  if (patch.startDate !== undefined)      { sets.push('start_date = ?');      binds.push(patch.startDate); }
  if (patch.endDate !== undefined)        { sets.push('end_date = ?');        binds.push(patch.endDate); }
  if (patch.status !== undefined)         { sets.push('status = ?');          binds.push(patch.status); }
  if (patch.employeeId !== undefined)     { sets.push('employee_id = ?');     binds.push(patch.employeeId); }
  if (patch.identityNumber !== undefined) { sets.push('identity_number = ?'); binds.push(patch.identityNumber); }
  if (patch.notes !== undefined)          { sets.push('notes = ?');           binds.push(patch.notes); }
  if (sets.length === 0) return;
  binds.push(id);
  await env.DB
    .prepare(`UPDATE contracts SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

export async function getContractById(env: Env, id: string): Promise<Contract | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM contracts WHERE id = ?`)
    .bind(id)
    .first<ContractRow>();
  return r ? rowToContract(r) : null;
}
