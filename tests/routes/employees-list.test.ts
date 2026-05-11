/**
 * Phase 3A hotfix regression test for GET /api/employees.
 *
 * The original symptom: 501 employees in production D1 → `loadHistoryForEmployees`
 * built a single `IN (?, ?, …)` statement with 501 placeholders → D1
 * rejected it (documented 100-bound-parameter cap) → worker returned
 * HTTP 500 to every authenticated browser request, surfaced in the FE
 * as the red "Failed to load employees" banner.
 *
 * This test pins the chunking behaviour by:
 *   1. Seeding the in-memory D1 mock with 250 employees + 250 history rows.
 *   2. Calling `/api/employees` end-to-end via `app.fetch(Request, env)`.
 *   3. Asserting the response is 200 with `items.length === 250` and
 *      `total === 250`.
 *   4. Asserting that EVERY prepared statement issued during the request
 *      bound ≤ 100 parameters — i.e. no single query exceeds the D1 cap.
 *
 * If a future change re-introduces a >100-param IN-list anywhere in the
 * employees path (or in any joined helper invoked from it), the assertion
 * in step 4 fails the build long before production sees a 500.
 */
import { describe, it, expect } from 'vitest';
import app from '../../worker/src/index';

type Row = Record<string, unknown>;

interface PreparedCall {
  sql: string;
  bindCount: number;
}

function makeFakeD1(
  initialTables: Record<string, Row[]> = {},
  calls: PreparedCall[] = [],
): { d1: unknown; tables: Record<string, Row[]>; calls: PreparedCall[] } {
  const tables: Record<string, Row[]> = { ...initialTables };
  function prepare(sql: string) {
    const binds: unknown[] = [];
    const call: PreparedCall = { sql, bindCount: 0 };
    calls.push(call);
    const stmt = {
      bind: (...args: unknown[]) => {
        binds.push(...args);
        call.bindCount = binds.length;
        return stmt;
      },
      first: async <T,>(): Promise<T | null> => {
        return pickFirst(sql, binds, tables) as T | null;
      },
      all: async <T,>(): Promise<{ results: T[] }> => {
        return { results: pickAll(sql, binds, tables) as T[] };
      },
      run: async (): Promise<{ success: true }> => {
        return { success: true };
      },
    };
    return stmt;
  }
  return { d1: { prepare }, tables, calls };
}

function pickFirst(sql: string, _binds: unknown[], tables: Record<string, Row[]>): Row | null {
  const m = sql.match(/FROM\s+(\w+)/i);
  const t = m?.[1];
  return (t && tables[t]?.[0]) ?? null;
}

function pickAll(sql: string, binds: unknown[], tables: Record<string, Row[]>): Row[] {
  // Honor `WHERE employee_id IN (?, ?, …)` so chunking can be observed.
  const inMatch = sql.match(/WHERE\s+employee_id\s+IN\s*\(([^)]+)\)/i);
  if (inMatch) {
    const ids = new Set(binds.map(String));
    const table = (sql.match(/FROM\s+(\w+)/i)?.[1] ?? '') as string;
    return (tables[table] ?? []).filter((r) => ids.has(String(r.employee_id)));
  }
  const m = sql.match(/FROM\s+(\w+)/i);
  const t = m?.[1];
  return (t && tables[t]) ? [...tables[t]] : [];
}

function buildEmployeeRow(i: number): Row {
  return {
    id: `emp_${i}`,
    identity_number: `${1000000000 + i}`,
    full_name: `Employee ${i.toString().padStart(4, '0')}`,
    full_name_arabic: null,
    department: 'Engineering',
    job_title: 'Engineer',
    nationality: 'SA',
    date_of_birth: null,
    hire_date: '2024-01-01',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function buildHistoryRow(i: number): Row {
  return {
    employee_id: `emp_${i}`,
    number: `E${i.toString().padStart(4, '0')}`,
    from_date: '2024-01-01',
    to_date: null,
  };
}

describe('GET /api/employees — D1 bound-param chunking', () => {
  it('handles 250 employees without exceeding 100 bound params per statement', async () => {
    const N = 250;
    const employees = Array.from({ length: N }, (_, i) => buildEmployeeRow(i));
    const history = Array.from({ length: N }, (_, i) => buildHistoryRow(i));
    const { d1, calls } = makeFakeD1({
      employees,
      employee_number_history: history,
      app_users: [
        {
          id: 'usr_admin',
          email: 'admin@mid.local',
          display_name: 'Admin',
          role: 'admin',
          status: 'active',
          last_login_at: null,
          created_at: '2024-01-01T00:00:00Z',
          created_by: 'system',
          updated_at: '2024-01-01T00:00:00Z',
          updated_by: 'system',
        },
      ],
    });

    const env = {
      DB: d1,
      ENVIRONMENT: 'development',
      ALLOW_ORIGIN: 'http://localhost:5173',
      ADMIN_EMAILS: 'admin@mid.local',
      DEV_ADMIN_EMAIL: 'admin@mid.local',
      CF_ACCESS_TEAM: '',
      CF_ACCESS_AUD: '',
      RAW_FILES: {} as unknown,
    };

    const res = await app.fetch(
      new Request('http://localhost/api/employees', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.total).toBe(N);
    expect(body.items.length).toBe(N);

    // The critical assertion: no single prepared statement bound more
    // than 100 parameters. If a future change drops the chunking and
    // sends 250 placeholders in one go, D1 rejects it in production
    // and this test fails locally with the same root cause.
    const maxBinds = Math.max(...calls.map((c) => c.bindCount));
    expect(maxBinds).toBeLessThanOrEqual(100);
  });
});
