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

/**
 * Walk `sql` from `startIdx` (which should be just past an opening `(`)
 * and return the index of the MATCHING closing `)`, ignoring parens
 * inside single-quoted string literals. Returns -1 if unmatched.
 */
function findMatchingCloseParen(sql: string, startIdx: number): number {
  let depth = 1;
  let inQuote = false;
  for (let i = startIdx; i < sql.length; i++) {
    const ch = sql[i]!;
    if (inQuote) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { i++; continue; }
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") { inQuote = true; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split a SQL list (column or VALUES contents) while respecting single-
 * quoted strings and parentheses, so `datetime('now')` doesn't get
 * shredded on its inner comma if a future call gets clever.
 */
function splitSqlList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inQuote = false;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuote) {
      buf += ch;
      if (ch === "'") {
        // SQL escapes a quote by doubling — `''` inside a string literal.
        if (s[i + 1] === "'") {
          buf += "'";
          i++;
        } else {
          inQuote = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      buf += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) out.push(buf);
  return out;
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
  // INSERT — match `INSERT [OR IGNORE] INTO <table> (<cols>) VALUES`,
  // then balance-walk the VALUES paren ourselves. A regex-only capture
  // breaks on nested calls like `LOWER(?)` because `[\s\S]+?` stops at
  // the first `)` it sees.
  let m = sql.match(
    /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([\s\S]+?)\)\s*VALUES\s*\(/i,
  );
  if (m) {
    const table = m[1]!;
    const cols = m[2]!.split(',').map((s) => s.trim());
    const valuesStart = m.index! + m[0].length;
    const valuesEnd = findMatchingCloseParen(sql, valuesStart);
    if (valuesEnd === -1) return; // malformed SQL — give up silently
    const valuesContent = sql.slice(valuesStart, valuesEnd);
    const values = splitSqlList(valuesContent).map((s) => s.trim());
    if (!tables[table]) tables[table] = [];
    const row: Row = {};
    // Walk the VALUES list alongside the COLUMNS list so a literal in the
    // VALUES position (e.g. `'__SQL_NOW__'` after datetime() substitution)
    // doesn't consume a bind. Without this, a mixed-shape INSERT like:
    //   (id, …, created_at, updated_at, …, idempotency_key)
    //   VALUES (?, …, datetime('now'), datetime('now'), …, ?)
    // would mis-align columns and drop the last bound value silently.
    let bindCursor = 0;
    cols.forEach((c, i) => {
      const v = values[i] ?? '?';
      if (v === '?') {
        row[c] = binds[bindCursor++];
      } else if (/^LOWER\(\?\)$/i.test(v)) {
        // Repo writes `LOWER(?)` for email columns; mirror SQLite's
        // case-fold so the row is queryable by `findByLowerEmail` later.
        const b = binds[bindCursor++];
        row[c] = typeof b === 'string' ? b.toLowerCase() : b;
      } else if (/^UPPER\(\?\)$/i.test(v)) {
        const b = binds[bindCursor++];
        row[c] = typeof b === 'string' ? b.toUpperCase() : b;
      } else if (v.startsWith("'") && v.endsWith("'")) {
        const lit = v.slice(1, -1);
        row[c] = lit === '__SQL_NOW__' ? nowIso() : lit;
      } else if (/^\d+$/.test(v)) {
        row[c] = Number(v);
      } else {
        // Unknown expression — store the literal text so a downstream
        // assertion can still see "something landed here".
        row[c] = v;
      }
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
