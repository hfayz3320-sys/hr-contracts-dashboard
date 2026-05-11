/**
 * Phase 3C-2 — insurance status is computed at read time.
 *
 * The production D1 column `insurance_policies.status` is a stored
 * snapshot from import / last backfill. It drifts whenever today
 * crosses a row's `end_date` without a fresh recompute, so the read
 * path MUST NOT trust it. Instead, `rowToInsurance` re-evaluates
 * `computeInsuranceStatus(identityNumber, policyNumber, startDate,
 * endDate, today)` on every emit. The stored column is preserved (no
 * migration) but ignored at the API boundary.
 *
 * These tests pin the contract by seeding rows whose stored status
 * deliberately disagrees with reality:
 *
 *   1. Stored "missing" with a clearly active window → API returns
 *      `active`.
 *   2. Stored "active" with an end_date in the past → API returns
 *      `expired`.
 *   3. Stored "active" with null start_date → API returns `missing`.
 *
 * If a future refactor accidentally short-circuits to the stored
 * column, the first two tests fail immediately.
 *
 * A separate test exercises `/api/debug/counts` and asserts the
 * insurance buckets reflect the SAME date predicate. The stored
 * column there can be set to anything; the route must ignore it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../../worker/src/index';

type Row = Record<string, unknown>;

function freezeDate(iso: string): void {
  vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
}

// ---------------------------------------------------------------------------
// Minimal in-memory D1 with SQLite-style date('now') + date(x,'+1 year')
// handling sufficient for the read path + debug counts. We DO NOT rebuild
// the full SQLite engine — just enough of the SQL surface the route uses.
// ---------------------------------------------------------------------------

function addYearISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function evaluateInsuranceWhere(row: Row, sql: string): boolean {
  const id = row.identity_number as string | null;
  const policy = row.policy_number as string | null;
  const start = row.start_date as string | null;
  const end = row.end_date as string | null;
  const criticalPresent = !!id && !!policy && !!start;

  // mirror the SQL the route emits
  if (sql.includes("NOT (identity_number")) return !criticalPresent;
  const effEnd = end ?? (start ? addYearISO(start) : null);
  const today = todayISO();

  if (sql.includes('>= date(\'now\')')) {
    return criticalPresent && effEnd != null && effEnd >= today;
  }
  if (sql.includes("< date('now')")) {
    return criticalPresent && effEnd != null && effEnd < today;
  }
  if (sql.includes('employee_id IS NOT NULL')) {
    return row.employee_id != null;
  }
  return true;
}

function makeFakeD1(initialTables: Record<string, Row[]> = {}): { d1: unknown; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = { ...initialTables };

  function prepare(sql: string) {
    const binds: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => { binds.push(...args); return stmt; },
      first: async <T,>(): Promise<T | null> => {
        // SELECT COUNT(*) AS n FROM insurance_policies WHERE …
        const cm = sql.match(/SELECT\s+COUNT\(\*\)\s+AS\s+n\s+FROM\s+(\w+)/i);
        if (cm) {
          const table = cm[1]!;
          const rows = tables[table] ?? [];
          const filtered = table === 'insurance_policies'
            ? rows.filter((r) => evaluateInsuranceWhere(r, sql))
            : rows;
          return ({ n: filtered.length } as unknown) as T;
        }
        const m = sql.match(/FROM\s+(\w+)/i);
        const t = m?.[1];
        return ((t && tables[t]?.[0]) as unknown as T) ?? null;
      },
      all: async <T,>(): Promise<{ results: T[] }> => {
        const m = sql.match(/FROM\s+(\w+)/i);
        const t = m?.[1];
        return { results: (t && tables[t]) ? [...tables[t]] : [] } as { results: T[] };
      },
      run: async (): Promise<{ success: true }> => ({ success: true }),
    };
    return stmt;
  }
  return { d1: { prepare }, tables };
}

function makeEnv(d1: unknown): Record<string, unknown> {
  return {
    DB: d1,
    ENVIRONMENT: 'development',
    ALLOW_ORIGIN: 'http://localhost:5173',
    ADMIN_EMAILS: 'admin@mid.local',
    DEV_ADMIN_EMAIL: 'admin@mid.local',
    CF_ACCESS_TEAM: '',
    CF_ACCESS_AUD: '',
    RAW_FILES: {},
  };
}

const ADMIN = { id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin', role: 'admin', status: 'active', last_login_at: null, created_at: '2024-01-01T00:00:00Z', created_by: 'system', updated_at: '2024-01-01T00:00:00Z', updated_by: 'system' };

describe('GET /api/insurance — read-path computes status, ignores stored column', () => {
  beforeEach(() => { vi.useFakeTimers(); freezeDate('2026-05-11'); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns active when window covers today, even if stored column says missing', async () => {
    const { d1 } = makeFakeD1({
      insurance_policies: [
        {
          id: 'ins_a',
          employee_id: 'emp_1',
          identity_number: '1234567890',
          policy_number: 'P1',
          member_number: null,
          provider: 'Bupa',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          status: 'missing', // stored snapshot is wrong
          matched: 1,
          unmatched_reason: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      app_users: [ADMIN],
    });
    const res = await app.fetch(
      new Request('http://localhost/api/insurance', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      makeEnv(d1),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ status: string }> };
    expect(body.items[0]!.status).toBe('active');
  });

  it('returns expired when end_date < today, even if stored column says active', async () => {
    const { d1 } = makeFakeD1({
      insurance_policies: [
        {
          id: 'ins_b',
          employee_id: 'emp_2',
          identity_number: '1234567890',
          policy_number: 'P2',
          member_number: null,
          provider: 'Bupa',
          start_date: '2024-01-01',
          end_date: '2025-01-01',
          status: 'active', // stored snapshot is wrong
          matched: 1,
          unmatched_reason: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      app_users: [ADMIN],
    });
    const res = await app.fetch(
      new Request('http://localhost/api/insurance', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      makeEnv(d1),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ status: string }> };
    expect(body.items[0]!.status).toBe('expired');
  });

  it('returns missing when start_date is null, even if stored column says active', async () => {
    const { d1 } = makeFakeD1({
      insurance_policies: [
        {
          id: 'ins_c',
          employee_id: null,
          identity_number: '1234567890',
          policy_number: 'P3',
          member_number: null,
          provider: 'Bupa',
          start_date: null,
          end_date: '2099-01-01',
          status: 'active',
          matched: 0,
          unmatched_reason: 'no_identity_match',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      app_users: [ADMIN],
    });
    const res = await app.fetch(
      new Request('http://localhost/api/insurance', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      makeEnv(d1),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ status: string }> };
    expect(body.items[0]!.status).toBe('missing');
  });

  it('uses startDate + 1 year fallback when end_date is null (Bupa CCHI default)', async () => {
    const { d1 } = makeFakeD1({
      insurance_policies: [
        {
          id: 'ins_d',
          employee_id: 'emp_4',
          identity_number: '1234567890',
          policy_number: 'P4',
          member_number: null,
          provider: 'Bupa',
          start_date: '2026-01-01', // +1y = 2027-01-01, today 2026-05-11 → active
          end_date: null,
          status: 'missing',
          matched: 1,
          unmatched_reason: null,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ins_e',
          employee_id: 'emp_5',
          identity_number: '1234567890',
          policy_number: 'P5',
          member_number: null,
          provider: 'Bupa',
          start_date: '2024-01-01', // +1y = 2025-01-01, today 2026-05-11 → expired
          end_date: null,
          status: 'missing',
          matched: 1,
          unmatched_reason: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      app_users: [ADMIN],
    });
    const res = await app.fetch(
      new Request('http://localhost/api/insurance', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      makeEnv(d1),
    );
    const body = (await res.json()) as { items: Array<{ id: string; status: string }> };
    const byId = new Map(body.items.map((i) => [i.id, i.status]));
    expect(byId.get('ins_d')).toBe('active');
    expect(byId.get('ins_e')).toBe('expired');
  });
});

describe('GET /api/debug/counts — insurance buckets ignore stored status', () => {
  beforeEach(() => { vi.useFakeTimers(); freezeDate('2026-05-11'); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports active/expired/missing from current date predicate, not from stored column', async () => {
    // Mix of rows where the stored column is intentionally wrong:
    //   - 2 truly active (today inside window) but stored "missing"
    //   - 1 truly expired (end < today) but stored "active"
    //   - 1 truly missing (no start_date) but stored "active"
    // Expected computed buckets: active=2, expired=1, missing=1.
    const { d1 } = makeFakeD1({
      insurance_policies: [
        { id: 'a1', employee_id: 'e1', identity_number: '11', policy_number: 'p', member_number: null, provider: 'Bupa', start_date: '2026-01-01', end_date: '2026-12-31', status: 'missing', matched: 1, unmatched_reason: null, created_at: '2026-01-01' },
        { id: 'a2', employee_id: 'e2', identity_number: '22', policy_number: 'p', member_number: null, provider: 'Bupa', start_date: '2026-02-01', end_date: null,         status: 'missing', matched: 1, unmatched_reason: null, created_at: '2026-02-01' },
        { id: 'x1', employee_id: 'e3', identity_number: '33', policy_number: 'p', member_number: null, provider: 'Bupa', start_date: '2024-01-01', end_date: '2025-01-01', status: 'active',  matched: 1, unmatched_reason: null, created_at: '2024-01-01' },
        { id: 'm1', employee_id: null, identity_number: '44', policy_number: 'p', member_number: null, provider: 'Bupa', start_date: null,         end_date: '2099-01-01', status: 'active',  matched: 0, unmatched_reason: 'no_identity_match', created_at: '2024-01-01' },
      ],
      app_users: [ADMIN],
    });
    const res = await app.fetch(
      new Request('http://localhost/api/debug/counts', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      makeEnv(d1),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { db: { insurance: number; insuranceActive: number; insuranceExpired: number; insuranceMissing: number; insuranceLinked: number } };
    expect(body.db.insurance).toBe(4);
    expect(body.db.insuranceActive).toBe(2);
    expect(body.db.insuranceExpired).toBe(1);
    expect(body.db.insuranceMissing).toBe(1);
    // Sanity: buckets partition the table.
    expect(body.db.insuranceActive + body.db.insuranceExpired + body.db.insuranceMissing).toBe(body.db.insurance);
  });
});
