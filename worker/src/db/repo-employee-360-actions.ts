/**
 * Phase 10 — repo for the four new Employee 360 action entities.
 *
 * Bundled into one file because they share the same shape (per-employee,
 * created_by/updated_by audit columns, ISO datetime defaults) and one
 * file keeps the surface easy to grep. If any entity grows substantially
 * its own helpers can split out later.
 *
 * Every write returns the freshly-read row so the route can JSON it back
 * to the client without a second round-trip.
 */
import type { Env } from '../env';
import type {
  EmployeeTimelineEntry,
  EmployeeActivity,
  EmployeeCompensationLine,
  EmployeeLearningRecord,
} from '@shared/api-contract';

// ===========================================================================
// employee_timeline_entries  (Send Message / Log Note)
// ===========================================================================

interface TimelineRow {
  id: string;
  employee_id: string;
  entry_type: 'message' | 'note';
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  // Migration 0008 added this column. Pre-0008 environments simply omit it;
  // we coalesce to undefined in the route layer.
  idempotency_key?: string | null;
}

function rowToTimeline(r: TimelineRow): EmployeeTimelineEntry {
  return {
    id: r.id,
    employeeId: r.employee_id,
    entryType: r.entry_type,
    body: r.body,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function listTimelineForEmployee(env: Env, employeeId: string): Promise<EmployeeTimelineEntry[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM employee_timeline_entries WHERE employee_id = ? ORDER BY created_at DESC LIMIT 200`)
    .bind(employeeId)
    .all<TimelineRow>();
  return (rows.results ?? []).map(rowToTimeline);
}

/**
 * Idempotency lookup. Returns the existing entry if a previous request with
 * the same `Idempotency-Key` already created one. Migration 0008 added the
 * column + a UNIQUE-WHERE-NOT-NULL index; on pre-migration databases the
 * query throws `no such column`, which the route layer catches and treats
 * as "no idempotency support, fall through to insert".
 */
export async function findTimelineEntryByIdempotencyKey(
  env: Env,
  employeeId: string,
  idempotencyKey: string,
): Promise<EmployeeTimelineEntry | null> {
  const r = await env.DB
    .prepare(
      `SELECT * FROM employee_timeline_entries
       WHERE employee_id = ? AND idempotency_key = ?
       LIMIT 1`,
    )
    .bind(employeeId, idempotencyKey)
    .first<TimelineRow>();
  return r ? rowToTimeline(r) : null;
}

export async function insertTimelineEntry(
  env: Env,
  id: string,
  input: {
    employeeId: string;
    entryType: 'message' | 'note';
    body: string;
    actor: string;
    idempotencyKey?: string | null;
  },
): Promise<EmployeeTimelineEntry> {
  await env.DB
    .prepare(
      `INSERT INTO employee_timeline_entries
         (id, employee_id, entry_type, body, created_by, created_at, updated_at, updated_by, idempotency_key)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)`,
    )
    .bind(
      id,
      input.employeeId,
      input.entryType,
      input.body,
      input.actor,
      input.actor,
      input.idempotencyKey ?? null,
    )
    .run();
  const r = await env.DB
    .prepare(`SELECT * FROM employee_timeline_entries WHERE id = ?`)
    .bind(id)
    .first<TimelineRow>();
  if (!r) throw new Error(`Inserted timeline entry ${id} not found`);
  return rowToTimeline(r);
}

// ===========================================================================
// employee_activities  (Activity)
// ===========================================================================

interface ActivityRow {
  id: string;
  employee_id: string;
  activity_type: EmployeeActivity['activityType'];
  title: string;
  description: string | null;
  due_date: string | null;
  status: EmployeeActivity['status'];
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  updated_by: string;
}

function rowToActivity(r: ActivityRow): EmployeeActivity {
  return {
    id: r.id,
    employeeId: r.employee_id,
    activityType: r.activity_type,
    title: r.title,
    ...(r.description != null ? { description: r.description } : {}),
    ...(r.due_date != null ? { dueDate: r.due_date } : {}),
    status: r.status,
    ...(r.assigned_to != null ? { assignedTo: r.assigned_to } : {}),
    createdBy: r.created_by,
    createdAt: r.created_at,
    ...(r.completed_at != null ? { completedAt: r.completed_at } : {}),
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function listActivitiesForEmployee(env: Env, employeeId: string): Promise<EmployeeActivity[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM employee_activities WHERE employee_id = ? ORDER BY created_at DESC LIMIT 200`)
    .bind(employeeId)
    .all<ActivityRow>();
  return (rows.results ?? []).map(rowToActivity);
}

export async function getActivity(env: Env, id: string): Promise<EmployeeActivity | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM employee_activities WHERE id = ?`)
    .bind(id)
    .first<ActivityRow>();
  return r ? rowToActivity(r) : null;
}

export async function insertActivity(
  env: Env,
  id: string,
  input: {
    employeeId: string;
    activityType: EmployeeActivity['activityType'];
    title: string;
    description?: string | null;
    dueDate?: string | null;
    assignedTo?: string | null;
    actor: string;
  },
): Promise<EmployeeActivity> {
  await env.DB
    .prepare(
      `INSERT INTO employee_activities
         (id, employee_id, activity_type, title, description, due_date, status, assigned_to,
          created_by, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, datetime('now'), datetime('now'), ?)`,
    )
    .bind(
      id, input.employeeId, input.activityType, input.title,
      input.description ?? null, input.dueDate ?? null,
      input.assignedTo ?? null, input.actor, input.actor,
    )
    .run();
  const r = await getActivity(env, id);
  if (!r) throw new Error(`Inserted activity ${id} not found`);
  return r;
}

export async function updateActivity(
  env: Env,
  id: string,
  input: {
    status?: EmployeeActivity['status'];
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    assignedTo?: string | null;
    actor: string;
  },
): Promise<EmployeeActivity | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (input.status !== undefined) {
    sets.push('status = ?');
    binds.push(input.status);
    if (input.status === 'done') {
      sets.push("completed_at = datetime('now')");
    }
  }
  if (input.title !== undefined)       { sets.push('title = ?');        binds.push(input.title); }
  if (input.description !== undefined) { sets.push('description = ?');  binds.push(input.description ?? null); }
  if (input.dueDate !== undefined)     { sets.push('due_date = ?');     binds.push(input.dueDate ?? null); }
  if (input.assignedTo !== undefined)  { sets.push('assigned_to = ?');  binds.push(input.assignedTo ?? null); }
  if (sets.length === 0) return getActivity(env, id);
  sets.push("updated_at = datetime('now')");
  sets.push('updated_by = ?');
  binds.push(input.actor);
  binds.push(id);
  await env.DB
    .prepare(`UPDATE employee_activities SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return getActivity(env, id);
}

// ===========================================================================
// employee_compensation_lines  (Payroll / Compensation)
// ===========================================================================

interface CompensationRow {
  id: string;
  employee_id: string;
  component_code: string;
  component_name: string;
  amount: number;
  currency: string;
  frequency: EmployeeCompensationLine['frequency'];
  effective_from: string;
  effective_to: string | null;
  // Phase 11 — added by migration 0009. Optional in the row type so
  // pre-migration databases still type-check.
  source_contract_id?: string | null;
  source: EmployeeCompensationLine['source'];
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

function rowToCompensation(r: CompensationRow): EmployeeCompensationLine {
  return {
    id: r.id,
    employeeId: r.employee_id,
    componentCode: r.component_code,
    componentName: r.component_name,
    amount: r.amount,
    currency: r.currency,
    frequency: r.frequency,
    effectiveFrom: r.effective_from,
    ...(r.effective_to != null ? { effectiveTo: r.effective_to } : {}),
    source: r.source,
    ...(r.source_contract_id != null ? { sourceContractId: r.source_contract_id } : {}),
    ...(r.notes != null ? { notes: r.notes } : {}),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function listCompensationForEmployee(env: Env, employeeId: string): Promise<EmployeeCompensationLine[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM employee_compensation_lines WHERE employee_id = ? ORDER BY effective_from DESC LIMIT 200`)
    .bind(employeeId)
    .all<CompensationRow>();
  return (rows.results ?? []).map(rowToCompensation);
}

export async function insertCompensationLine(
  env: Env,
  id: string,
  input: {
    employeeId: string;
    componentCode: string;
    componentName: string;
    amount: number;
    currency: string;
    frequency: EmployeeCompensationLine['frequency'];
    effectiveFrom: string;
    effectiveTo?: string | null;
    notes?: string | null;
    actor: string;
    // Phase 11 — when the line is derived from a committed contract,
    // record the contract id + flip the `source` column to 'contract'
    // so the profile UI can show "from contract v3 (id ctr-…)".
    source?: EmployeeCompensationLine['source'];
    sourceContractId?: string | null;
  },
): Promise<EmployeeCompensationLine> {
  const source = input.source ?? 'manual';
  // Migration 0009 adds `source_contract_id`. Wide INSERT first; fall
  // back to the pre-0009 column set if needed.
  try {
    await env.DB
      .prepare(
        `INSERT INTO employee_compensation_lines
           (id, employee_id, component_code, component_name, amount, currency,
            frequency, effective_from, effective_to, source, notes,
            created_by, created_at, updated_at, updated_by, source_contract_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)`,
      )
      .bind(
        id, input.employeeId, input.componentCode, input.componentName,
        input.amount, input.currency, input.frequency, input.effectiveFrom,
        input.effectiveTo ?? null, source, input.notes ?? null, input.actor, input.actor,
        input.sourceContractId ?? null,
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such column/i.test(msg)) throw err;
    await env.DB
      .prepare(
        `INSERT INTO employee_compensation_lines
           (id, employee_id, component_code, component_name, amount, currency,
            frequency, effective_from, effective_to, source, notes,
            created_by, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
      )
      .bind(
        id, input.employeeId, input.componentCode, input.componentName,
        input.amount, input.currency, input.frequency, input.effectiveFrom,
        input.effectiveTo ?? null, source, input.notes ?? null, input.actor, input.actor,
      )
      .run();
  }
  const r = await env.DB
    .prepare(`SELECT * FROM employee_compensation_lines WHERE id = ?`)
    .bind(id)
    .first<CompensationRow>();
  if (!r) throw new Error(`Inserted compensation ${id} not found`);
  return rowToCompensation(r);
}

/**
 * Phase 11 — write the basic/housing/transport/other compensation lines
 * derived from a committed contract. Called from the import commit pipeline
 * (`applyContract`). Idempotent at the line level via the unique
 * `(employee_id, component_code, source_contract_id)` combination — a
 * re-commit of the same contract overwrites the prior lines instead of
 * doubling them.
 */
export async function replaceCompensationLinesForContract(
  env: Env,
  args: {
    employeeId: string;
    contractId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    currency: string;
    actor: string;
    components: { code: string; name: string; amount: number }[];
  },
): Promise<void> {
  if (args.components.length === 0) return;
  // Delete any prior lines for this contract first so a re-commit (with
  // edited values) replaces, not duplicates.
  try {
    await env.DB
      .prepare(`DELETE FROM employee_compensation_lines WHERE source_contract_id = ?`)
      .bind(args.contractId)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Pre-0009 databases don't have the column. Skip the delete — the
    // worst case is that the user will see duplicated lines until they
    // re-apply the migration; correctness is preserved.
    if (!/no such column/i.test(msg)) throw err;
  }
  for (const c of args.components) {
    if (!Number.isFinite(c.amount) || c.amount <= 0) continue;
    const lineId = `cmp-${args.contractId}-${c.code}`;
    await insertCompensationLine(env, lineId, {
      employeeId: args.employeeId,
      componentCode: c.code,
      componentName: c.name,
      amount: c.amount,
      currency: args.currency,
      frequency: 'monthly',
      effectiveFrom: args.effectiveFrom,
      effectiveTo: args.effectiveTo,
      notes: null,
      actor: args.actor,
      source: 'contract',
      sourceContractId: args.contractId,
    });
  }
}

// ===========================================================================
// employee_learning_records  (Learning / Experience)
// ===========================================================================

interface LearningRow {
  id: string;
  employee_id: string;
  record_type: EmployeeLearningRecord['recordType'];
  title: string;
  provider: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: EmployeeLearningRecord['status'];
  level: 'beginner' | 'intermediate' | 'expert' | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

function rowToLearning(r: LearningRow): EmployeeLearningRecord {
  return {
    id: r.id,
    employeeId: r.employee_id,
    recordType: r.record_type,
    title: r.title,
    ...(r.provider != null ? { provider: r.provider } : {}),
    ...(r.issue_date != null ? { issueDate: r.issue_date } : {}),
    ...(r.expiry_date != null ? { expiryDate: r.expiry_date } : {}),
    status: r.status,
    ...(r.level != null ? { level: r.level } : {}),
    ...(r.notes != null ? { notes: r.notes } : {}),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function listLearningForEmployee(env: Env, employeeId: string): Promise<EmployeeLearningRecord[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM employee_learning_records WHERE employee_id = ? ORDER BY created_at DESC LIMIT 200`)
    .bind(employeeId)
    .all<LearningRow>();
  return (rows.results ?? []).map(rowToLearning);
}

export async function insertLearningRecord(
  env: Env,
  id: string,
  input: {
    employeeId: string;
    recordType: EmployeeLearningRecord['recordType'];
    title: string;
    provider?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    level?: 'beginner' | 'intermediate' | 'expert' | null;
    notes?: string | null;
    actor: string;
  },
): Promise<EmployeeLearningRecord> {
  await env.DB
    .prepare(
      `INSERT INTO employee_learning_records
         (id, employee_id, record_type, title, provider, issue_date, expiry_date,
          status, level, notes, created_by, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, datetime('now'), datetime('now'), ?)`,
    )
    .bind(
      id, input.employeeId, input.recordType, input.title,
      input.provider ?? null, input.issueDate ?? null, input.expiryDate ?? null,
      input.level ?? null, input.notes ?? null, input.actor, input.actor,
    )
    .run();
  const r = await env.DB
    .prepare(`SELECT * FROM employee_learning_records WHERE id = ?`)
    .bind(id)
    .first<LearningRow>();
  if (!r) throw new Error(`Inserted learning record ${id} not found`);
  return rowToLearning(r);
}
