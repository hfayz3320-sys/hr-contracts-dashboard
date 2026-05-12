/**
 * In-memory D1 mock for Phase 4A route tests.
 *
 * The existing test fixtures use a very crude SQL pattern matcher that
 * only handles the queries shipped pre-Phase-4A. The new
 * employee_documents / employee_transactions routes use more shapes
 * (multi-column AND in WHERE, COALESCE, ORDER BY), so this mock supports:
 *
 *   - INSERT INTO <table> (col, col, ...) VALUES (?, ?, ...)
 *     (`INSERT OR IGNORE` and `INSERT` both work; UNIQUE columns are
 *      honored if registered via `registerUnique`)
 *   - UPDATE <table> SET col = ?, col2 = ?, ... WHERE id = ?
 *     (also `WHERE id = ?` is the only WHERE form we use today)
 *   - SELECT [*|COUNT(*) AS n] FROM <table>
 *       [WHERE <col> = ? [AND <col> = ? ...]]
 *       [ORDER BY ...]
 *       [LIMIT N]
 *
 * `datetime('now')` in SQL strings is substituted with the current ISO
 * timestamp at bind time so audit columns get realistic values.
 *
 * This is NOT a full SQL engine — it's a pragmatic test double. Each new
 * query shape used by a route should be reflected here, or a more
 * targeted test-specific mock should be written. If your test starts
 * relying on something exotic, push back: simplify the route, or write
 * a route-specific assertion that doesn't need the mock to be smart.
 */

export type Row = Record<string, unknown>;

export interface MockD1 {
  d1: unknown;
  tables: Record<string, Row[]>;
  /**
   * Register UNIQUE constraints. Inserts that would violate any
   * registered constraint throw. UNIQUE on a nullable column treats
   * NULLs as distinct (SQLite semantics).
   */
  registerUnique(table: string, columns: string[]): void;
  /**
   * Register a partial UNIQUE INDEX. `whereClause` is evaluated per row
   * (truthy → row counts toward the index). Tests use this for the
   * `employee_documents (employee_id, type) WHERE is_current = 1` rule.
   */
  registerPartialUnique(
    table: string,
    columns: string[],
    rowFilter: (row: Row) => boolean,
  ): void;
}

interface UniqueConstraint {
  columns: string[];
  rowFilter?: (row: Row) => boolean;
}

export function makeMockD1(initialTables: Record<string, Row[]> = {}): MockD1 {
  const tables: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(initialTables)) {
    tables[k] = rows.map((r) => ({ ...r }));
  }
  const uniques: Record<string, UniqueConstraint[]> = {};

  function registerUnique(table: string, columns: string[]) {
    if (!uniques[table]) uniques[table] = [];
    uniques[table]!.push({ columns });
  }
  function registerPartialUnique(
    table: string,
    columns: string[],
    rowFilter: (row: Row) => boolean,
  ) {
    if (!uniques[table]) uniques[table] = [];
    uniques[table]!.push({ columns, rowFilter });
  }

  function checkUnique(table: string, row: Row) {
    const cs = uniques[table];
    if (!cs) return;
    for (const c of cs) {
      // partial: only enforce if rowFilter says the row participates
      if (c.rowFilter && !c.rowFilter(row)) continue;
      // null in any column → SQLite treats as distinct, skip
      if (c.columns.some((col) => row[col] == null)) continue;
      const existing = (tables[table] ?? []).find((r) => {
        // Exclude the row itself — UPDATE-in-place must not collide with
        // its own pre-image. INSERT rows have a fresh id so this is a
        // no-op for new rows.
        if (r.id === row.id) return false;
        if (c.rowFilter && !c.rowFilter(r)) return false;
        return c.columns.every((col) => r[col] === row[col]);
      });
      if (existing) {
        throw new Error(
          `UNIQUE constraint failed: ${table}.(${c.columns.join(',')})`,
        );
      }
    }
  }

  function substituteSqlNow(sql: string): string {
    // datetime('now') is the only computed default we use.
    return sql.replace(/datetime\('now'\)/g, "'__SQL_NOW__'");
  }

  function prepare(sqlRaw: string) {
    const sql = substituteSqlNow(sqlRaw);
    const binds: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => {
        for (const a of args) binds.push(a);
        return stmt;
      },
      first: async <T,>(): Promise<T | null> => {
        const rows = runSelect(sql, binds, tables);
        return (rows[0] ?? null) as T | null;
      },
      all: async <T,>(): Promise<{ results: T[] }> => {
        const rows = runSelect(sql, binds, tables);
        return { results: rows as T[] };
      },
      run: async (): Promise<{ success: true }> => {
        runMutation(sql, binds, tables, checkUnique);
        return { success: true };
      },
    };
    return stmt;
  }

  return {
    d1: { prepare },
    tables,
    registerUnique,
    registerPartialUnique,
  };
}

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ---- SELECT ---------------------------------------------------------------

function runSelect(
  sql: string,
  binds: unknown[],
  tables: Record<string, Row[]>,
): Row[] {
  const m = sql.match(/FROM\s+(\w+)/i);
  const table = m?.[1];
  if (!table || !tables[table]) return [];
  let rows = [...tables[table]];

  // WHERE — handle simple `col = ?` joined by AND. We treat
  // unrecognized predicates as match-all (test mock, not query engine).
  const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
  if (whereMatch) {
    const where = whereMatch[1]!.trim();
    const preds = where.split(/\s+AND\s+/i).map((s) => s.trim());
    let bindCursor = 0;
    for (const p of preds) {
      const eqQ = p.match(/^(\w+)\s*=\s*\?$/);
      if (eqQ) {
        const col = eqQ[1]!;
        const val = binds[bindCursor++];
        rows = rows.filter((r) => r[col] === val);
        continue;
      }
      // LOWER(col) = LOWER(?) — case-insensitive equality. Mirrors the
      // SQLite `LOWER(email) = LOWER(?)` pattern used by
      // findAppUserByEmail.
      const lowerEq = p.match(/^LOWER\((\w+)\)\s*=\s*LOWER\(\?\)$/i);
      if (lowerEq) {
        const col = lowerEq[1]!;
        const val = binds[bindCursor++];
        const lower = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : String(v));
        rows = rows.filter((r) => lower(r[col]) === lower(val));
        continue;
      }
      const eqLit = p.match(/^(\w+)\s*=\s*(\d+|'[^']*')$/);
      if (eqLit) {
        const col = eqLit[1]!;
        let v: unknown = eqLit[2]!;
        if (typeof v === 'string' && v.startsWith("'") && v.endsWith("'")) {
          v = v.slice(1, -1);
        } else if (typeof v === 'string' && /^\d+$/.test(v)) {
          v = Number(v);
        }
        rows = rows.filter((r) => r[col] === v);
        continue;
      }
      // unrecognized predicate → ignore (lenient mock)
    }
  }

  // COUNT(*) aggregate
  if (/SELECT\s+COUNT\(\*\)/i.test(sql)) {
    return [{ n: rows.length } as Row];
  }

  // LIMIT 1
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    rows = rows.slice(0, Number(limitMatch[1]));
  }

  return rows;
}

// ---- INSERT / UPDATE ------------------------------------------------------

function runMutation(
  sql: string,
  binds: unknown[],
  tables: Record<string, Row[]>,
  checkUnique: (table: string, row: Row) => void,
): void {
  // INSERT
  let m = sql.match(
    /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)/i,
  );
  if (m) {
    const table = m[1]!;
    const cols = m[2]!.split(',').map((s) => s.trim());
    if (!tables[table]) tables[table] = [];
    const row: Row = {};
    cols.forEach((c, i) => {
      row[c] = binds[i];
    });
    // Defaults that real D1 would supply on INSERT (only the ones the
    // migrations use): created_at/updated_at via datetime('now'), and
    // their values get bound via the NOW_PLACEHOLDER substitution. If
    // the column wasn't in the INSERT column list AT ALL, fill in.
    if (
      table === 'employee_documents' ||
      table === 'employee_transactions'
    ) {
      if (row.created_at == null) row.created_at = nowIso();
      if (row.updated_at == null) row.updated_at = nowIso();
      if (
        table === 'employee_documents' &&
        row.is_current == null
      ) {
        row.is_current = 1;
      }
      if (
        table === 'employee_documents' &&
        row.status == null
      ) {
        row.status = 'active';
      }
      if (
        table === 'employee_documents' &&
        row.review_required == null
      ) {
        row.review_required = 0;
      }
      if (
        table === 'employee_transactions' &&
        row.status == null
      ) {
        row.status = 'requested';
      }
      if (
        table === 'employee_transactions' &&
        row.payload_schema_version == null
      ) {
        row.payload_schema_version = 1;
      }
      if (
        table === 'employee_transactions' &&
        row.review_required == null
      ) {
        row.review_required = 0;
      }
    }
    if (sql.toUpperCase().includes('OR IGNORE')) {
      if (row.id && tables[table].some((r) => r.id === row.id)) return;
    }
    checkUnique(table, row);
    tables[table].push(row);
    return;
  }
  // UPDATE
  m = sql.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+id\s*=\s*\?/i);
  if (m) {
    const table = m[1]!;
    const setClause = m[2]!;
    const setItems = setClause.split(',').map((s) => s.trim());
    // Each item is either `col = ?` or `col = '<literal>'`. We must walk
    // them in order to align with binds.
    const id = binds[binds.length - 1];
    const rows = tables[table];
    if (!rows) return;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const updated: Row = { ...rows[idx] };
    let cursor = 0;
    for (const item of setItems) {
      const matchQ = item.match(/^(\w+)\s*=\s*\?$/);
      if (matchQ) {
        updated[matchQ[1]!] = binds[cursor++];
        continue;
      }
      const matchLit = item.match(/^(\w+)\s*=\s*'([^']*)'$/);
      if (matchLit) {
        const col = matchLit[1]!;
        const lit = matchLit[2]!;
        updated[col] = lit === '__SQL_NOW__' ? nowIso() : lit;
        continue;
      }
      const matchNum = item.match(/^(\w+)\s*=\s*(\d+)$/);
      if (matchNum) {
        updated[matchNum[1]!] = Number(matchNum[2]!);
        continue;
      }
    }
    // Re-check uniques (e.g. promoting a doc to is_current=1)
    checkUnique(table, updated);
    rows[idx] = updated;
  }
}
