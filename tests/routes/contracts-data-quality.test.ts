/**
 * Phase 3D — `/api/contracts` end-to-end test for the read-time
 * `dataQualityIssue` flag.
 *
 * Three fixture rows:
 *   1. Normal 1-year fixed-term → no flag, status passes through
 *   2. Reproduction of ctr_76f8321af33906df (start 2023-11-01,
 *      end 2035-03-02) → flagged duration_over_3_years
 *   3. Negative duration → flagged duration_negative
 *
 * The route should attach `dataQualityIssue` to (2) and (3) but not
 * (1). The stored `contracts.status` column in the fixture is left as
 * 'active' for all rows, mirroring the production state where 143
 * misextracted rows are silently marked active.
 */
import { describe, it, expect } from 'vitest';
import app from '../../worker/src/index';

type Row = Record<string, unknown>;

function makeFakeD1(initialTables: Record<string, Row[]> = {}): { d1: unknown } {
  const tables: Record<string, Row[]> = { ...initialTables };
  function prepare(sql: string) {
    const stmt = {
      bind: (..._a: unknown[]) => stmt,
      first: async <T,>(): Promise<T | null> => {
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
  return { d1: { prepare } };
}

const ADMIN_ROW: Row = {
  id: 'usr_admin', email: 'admin@mid.local', display_name: 'Admin', role: 'admin',
  status: 'active', last_login_at: null,
  created_at: '2024-01-01T00:00:00Z', created_by: 'system',
  updated_at: '2024-01-01T00:00:00Z', updated_by: 'system',
};

describe('GET /api/contracts — dataQualityIssue computed at read time', () => {
  it('attaches dataQualityIssue to rows with implausible windows; omits it for normal rows', async () => {
    const { d1 } = makeFakeD1({
      contracts: [
        {
          id: 'ctr_normal',
          employee_id: 'emp_1',
          identity_number: '1234567890',
          contract_type: 'Fixed-term',
          start_date: '2024-01-01',
          end_date: '2025-01-01',
          status: 'active',
          version: 1,
          version_of: null,
          file_hash: 'a'.repeat(64),
          filename: 'normal.pdf',
          extraction_confidence: 0.9,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'ctr_76f8321af33906df', // production bug repro
          employee_id: 'emp_2',
          identity_number: '2564753099',
          contract_type: 'Fixed-term',
          start_date: '2023-11-01',
          end_date: '2035-03-02',
          status: 'active', // stored value is wrong — must be ignored visually
          version: 1,
          version_of: null,
          file_hash: 'b'.repeat(64),
          filename: 'sample.pdf',
          extraction_confidence: 0.92,
          notes: null,
          created_at: '2023-11-01T00:00:00Z',
        },
        {
          id: 'ctr_negative',
          employee_id: 'emp_3',
          identity_number: '1111111111',
          contract_type: 'Fixed-term',
          start_date: '2025-06-01',
          end_date: '2025-05-30', // end before start
          status: 'active',
          version: 1,
          version_of: null,
          file_hash: 'c'.repeat(64),
          filename: 'neg.pdf',
          extraction_confidence: 0.85,
          notes: null,
          created_at: '2025-06-01T00:00:00Z',
        },
      ],
      app_users: [ADMIN_ROW],
    });

    const env = {
      DB: d1,
      ENVIRONMENT: 'development',
      ALLOW_ORIGIN: 'http://localhost:5173',
      ADMIN_EMAILS: 'admin@mid.local',
      DEV_ADMIN_EMAIL: 'admin@mid.local',
      CF_ACCESS_TEAM: '',
      CF_ACCESS_AUD: '',
      RAW_FILES: {},
    };

    const res = await app.fetch(
      new Request('http://localhost/api/contracts', {
        headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
      }),
      env as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; dataQualityIssue?: string }> };
    const byId = new Map(body.items.map((c) => [c.id, c.dataQualityIssue]));
    expect(byId.get('ctr_normal')).toBeUndefined();
    expect(byId.get('ctr_76f8321af33906df')).toBe('duration_over_3_years');
    expect(byId.get('ctr_negative')).toBe('duration_negative');
  });
});
