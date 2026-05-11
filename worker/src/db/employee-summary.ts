/**
 * Helpers for embedding a compact employee snapshot into joined list
 * responses (Phase 3B). Two-step pattern:
 *
 *   1. Run the main SELECT (contracts, insurance, etc.) — single query.
 *   2. Collect the distinct `employee_id` values referenced.
 *   3. One-or-more IN-list SELECTs against employees +
 *      employee_number_history (chunked under D1's bound-param cap).
 *
 * D1 caps bound parameters at 100 per prepared statement:
 *   https://developers.cloudflare.com/d1/platform/limits/
 *
 * The 328-row contracts response references up to 328 distinct employee
 * ids — a single IN-list with 328 placeholders crashes the worker with
 * HTTP 500 (the original Phase 3A hotfix mis-quoted SQLite's 999 limit
 * as if it applied to D1). We chunk at 90 placeholders per query,
 * safely under the documented 100.
 */
import type { Env } from '../env';
import type { EmployeeSummary } from '@shared/domain';

export function redactIdentity(s: string | null | undefined): string {
  if (!s) return '';
  if (s.length < 6) return s;
  return s.slice(0, 2) + 'x'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}

type EmpRow = {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  identity_number: string;
};

type HistoryRow = { employee_id: string; number: string };

// Safely below D1's documented 100-bound-parameter limit.
const CHUNK = 90;

export async function buildEmployeeSummaryMap(
  env: Env,
  employeeIds: ReadonlyArray<string>,
): Promise<Map<string, EmployeeSummary>> {
  const unique = Array.from(new Set(employeeIds.filter((id) => !!id)));
  const summary = new Map<string, EmployeeSummary>();
  if (unique.length === 0) return summary;

  // Step A: employees rows.
  const empRows: EmpRow[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    const r = await env.DB
      .prepare(
        `SELECT id, full_name, department, job_title, identity_number
         FROM employees
         WHERE id IN (${placeholders})`,
      )
      .bind(...slice)
      .all<EmpRow>();
    empRows.push(...(r.results ?? []));
  }

  // Step B: current open employee-number per employee. `to_date IS NULL`
  // is the canonical "currently held" marker.
  const numberByEmp = new Map<string, string>();
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    const r = await env.DB
      .prepare(
        `SELECT employee_id, number FROM employee_number_history
         WHERE to_date IS NULL AND employee_id IN (${placeholders})`,
      )
      .bind(...slice)
      .all<HistoryRow>();
    for (const row of r.results ?? []) {
      numberByEmp.set(row.employee_id, row.number);
    }
  }

  // Step C: assemble summary map.
  for (const e of empRows) {
    summary.set(e.id, {
      id: e.id,
      fullName: e.full_name,
      employeeNumber: numberByEmp.get(e.id) ?? null,
      identityNumberRedacted: redactIdentity(e.identity_number),
      department: e.department,
      jobTitle: e.job_title,
    });
  }
  return summary;
}
