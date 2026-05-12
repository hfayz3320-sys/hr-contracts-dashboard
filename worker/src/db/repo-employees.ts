import type { Env } from '../env';
import type {
  Employee,
  EmployeeNumberHistoryEntry,
  EmployeeStatus,
} from '@shared/domain';

type EmployeeRow = {
  id: string;
  identity_number: string;
  full_name: string;
  full_name_arabic: string | null;
  department: string | null;
  job_title: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  hire_date: string | null;
  // Phase 11: added by migration 0009. Optional in the row type so pre-
  // migration databases (where the columns don't exist) still type-check.
  mobile?: string | null;
  notes?: string | null;
  status: EmployeeStatus;
  created_at: string;
  updated_at: string;
};

type HistoryRow = {
  employee_id: string;
  number: string;
  from_date: string;
  to_date: string | null;
};

function rowToEmployee(r: EmployeeRow, history: EmployeeNumberHistoryEntry[]): Employee {
  return {
    id: r.id,
    identityNumber: r.identity_number,
    fullName: r.full_name,
    ...(r.full_name_arabic != null ? { fullNameArabic: r.full_name_arabic } : {}),
    employeeNumberHistory: history,
    ...(r.department != null ? { department: r.department } : {}),
    ...(r.job_title != null ? { jobTitle: r.job_title } : {}),
    ...(r.nationality != null ? { nationality: r.nationality } : {}),
    ...(r.date_of_birth != null ? { dateOfBirth: r.date_of_birth } : {}),
    ...(r.hire_date != null ? { hireDate: r.hire_date } : {}),
    ...(r.mobile != null ? { mobile: r.mobile } : {}),
    ...(r.notes != null ? { notes: r.notes } : {}),
    status: r.status,
    sourceFiles: [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listEmployees(env: Env): Promise<{ items: Employee[]; total: number }> {
  const rows = await env.DB
    .prepare(`SELECT * FROM employees ORDER BY full_name ASC`)
    .all<EmployeeRow>();

  const ids = (rows.results ?? []).map((r) => r.id);
  const history = await loadHistoryForEmployees(env, ids);
  const items = (rows.results ?? []).map((r) => rowToEmployee(r, history.get(r.id) ?? []));
  return { items, total: items.length };
}

export async function getEmployee(env: Env, id: string): Promise<Employee | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM employees WHERE id = ?`)
    .bind(id)
    .first<EmployeeRow>();
  if (!r) return null;
  const history = await loadHistoryForEmployees(env, [id]);
  return rowToEmployee(r, history.get(id) ?? []);
}

export async function findEmployeeByIdentity(env: Env, identityNumber: string): Promise<Employee | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM employees WHERE identity_number = ?`)
    .bind(identityNumber)
    .first<EmployeeRow>();
  if (!r) return null;
  const history = await loadHistoryForEmployees(env, [r.id]);
  return rowToEmployee(r, history.get(r.id) ?? []);
}

// ===========================================================================
// UPSERT helpers used by the commit pipeline (Phase 2B)
// ===========================================================================

export type EmployeeUpsertInput = {
  identityNumber: string;
  fullName: string;
  fullNameArabic?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  hireDate?: string | null;
  // Phase 11 — manual-create form fields.
  mobile?: string | null;
  notes?: string | null;
  status?: EmployeeStatus;
  /** Source-traceability — required for any production-committed row. */
  sourceFileId: string;
};

export async function insertEmployee(
  env: Env,
  id: string,
  input: EmployeeUpsertInput,
): Promise<string> {
  // Phase 11 — the `mobile` / `notes` columns land via migration 0009.
  // Try the full insert first; if the database is pre-0009, fall back to
  // the legacy column set so older deployments keep working until the
  // migration is applied.
  try {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO employees
         (id, identity_number, full_name, full_name_arabic, department, job_title,
          nationality, date_of_birth, hire_date, mobile, notes, status, source_file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.identityNumber,
        input.fullName,
        input.fullNameArabic ?? null,
        input.department ?? null,
        input.jobTitle ?? null,
        input.nationality ?? null,
        input.dateOfBirth ?? null,
        input.hireDate ?? null,
        input.mobile ?? null,
        input.notes ?? null,
        input.status ?? 'active',
        input.sourceFileId,
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such column/i.test(msg)) throw err;
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO employees
         (id, identity_number, full_name, full_name_arabic, department, job_title,
          nationality, date_of_birth, hire_date, status, source_file_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.identityNumber,
        input.fullName,
        input.fullNameArabic ?? null,
        input.department ?? null,
        input.jobTitle ?? null,
        input.nationality ?? null,
        input.dateOfBirth ?? null,
        input.hireDate ?? null,
        input.status ?? 'active',
        input.sourceFileId,
      )
      .run();
  }
  const existing = await findEmployeeByIdentity(env, input.identityNumber);
  return existing?.id ?? id;
}

export async function updateEmployeeFields(
  env: Env,
  id: string,
  input: Partial<EmployeeUpsertInput>,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (input.fullName !== undefined) { sets.push('full_name = ?'); binds.push(input.fullName); }
  if (input.fullNameArabic !== undefined) { sets.push('full_name_arabic = ?'); binds.push(input.fullNameArabic); }
  if (input.department !== undefined) { sets.push('department = ?'); binds.push(input.department); }
  if (input.jobTitle !== undefined) { sets.push('job_title = ?'); binds.push(input.jobTitle); }
  if (input.nationality !== undefined) { sets.push('nationality = ?'); binds.push(input.nationality); }
  if (input.dateOfBirth !== undefined) { sets.push('date_of_birth = ?'); binds.push(input.dateOfBirth); }
  if (input.hireDate !== undefined) { sets.push('hire_date = ?'); binds.push(input.hireDate); }
  if (input.mobile !== undefined) { sets.push('mobile = ?'); binds.push(input.mobile); }
  if (input.notes !== undefined) { sets.push('notes = ?'); binds.push(input.notes); }
  if (input.status !== undefined) { sets.push('status = ?'); binds.push(input.status); }
  if (input.sourceFileId !== undefined) { sets.push('source_file_id = ?'); binds.push(input.sourceFileId); }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  binds.push(id);
  await env.DB
    .prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

/**
 * Append a new employee_number_history row, closing the previous open one
 * if the number changed. EmployeeNumber is secondary/history only — never on
 * the employees row itself.
 */
export async function setCurrentEmployeeNumber(
  env: Env,
  employeeId: string,
  number: string,
  fromDate: string,
  sourceFileId: string,
): Promise<void> {
  const open = await env.DB
    .prepare(
      `SELECT number FROM employee_number_history
       WHERE employee_id = ? AND to_date IS NULL`,
    )
    .bind(employeeId)
    .first<{ number: string }>();
  if (open?.number === number) return;
  await env.DB
    .prepare(
      `UPDATE employee_number_history
       SET to_date = ?
       WHERE employee_id = ? AND to_date IS NULL`,
    )
    .bind(fromDate, employeeId)
    .run();
  await env.DB
    .prepare(
      `INSERT OR IGNORE INTO employee_number_history
         (id, employee_id, number, from_date, to_date, source_file_id)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .bind(crypto.randomUUID(), employeeId, number, fromDate, sourceFileId)
    .run();
}

export async function getCurrentEmployeeNumber(env: Env, employeeId: string): Promise<string | null> {
  const r = await env.DB
    .prepare(`SELECT number FROM employee_number_history WHERE employee_id = ? AND to_date IS NULL`)
    .bind(employeeId)
    .first<{ number: string }>();
  return r?.number ?? null;
}

/**
 * D1 caps bound parameters at 100 per prepared statement:
 *   https://developers.cloudflare.com/d1/platform/limits/
 *
 * The production employees table holds 501 rows. Without chunking, the
 * single `IN (?, ?, …)` statement here would bind 501 placeholders and
 * D1 would reject the query at runtime, surfacing as HTTP 500 from
 * `/api/employees`. We chunk into batches of 90 (safely below the
 * documented 100 limit) and merge the maps. `loadHistoryForEmployees` is
 * called by listEmployees / getEmployee / findEmployeeByIdentity — only
 * the listEmployees path can exceed 100 ids, but the chunking pattern
 * keeps a single code path correct for every caller.
 */
const D1_PARAM_CHUNK = 90;

async function loadHistoryForEmployees(
  env: Env,
  ids: string[],
): Promise<Map<string, EmployeeNumberHistoryEntry[]>> {
  if (ids.length === 0) return new Map();
  const map = new Map<string, EmployeeNumberHistoryEntry[]>();
  for (let i = 0; i < ids.length; i += D1_PARAM_CHUNK) {
    const slice = ids.slice(i, i + D1_PARAM_CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    const rows = await env.DB
      .prepare(
        `SELECT employee_id, number, from_date, to_date
         FROM employee_number_history
         WHERE employee_id IN (${placeholders})
         ORDER BY from_date ASC`,
      )
      .bind(...slice)
      .all<HistoryRow>();
    for (const r of rows.results ?? []) {
      const list = map.get(r.employee_id) ?? [];
      list.push({ number: r.number, from: r.from_date, to: r.to_date });
      map.set(r.employee_id, list);
    }
  }
  return map;
}
