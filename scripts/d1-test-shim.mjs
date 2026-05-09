// -*- coding: utf-8 -*-
/**
 * scripts/d1-test-shim.mjs
 *
 * Wraps Node 22's experimental `node:sqlite` (DatabaseSync) in a
 * Cloudflare D1-shaped interface so functions/lib/hrUpsert.js can run
 * unmodified for headless testing.
 *
 * D1's surface used by hrUpsert.js:
 *   db.prepare(sql).bind(...args).run()   → { success: true, meta: {...} }
 *   db.prepare(sql).bind(...args).first() → row | null
 *   db.prepare(sql).bind(...args).all()   → { results: [...] }
 *
 * This shim mirrors that exactly. Statements without .bind() also work.
 *
 * Usage:
 *   import { createD1ShimFromMigration } from './d1-test-shim.mjs';
 *   const db = await createD1ShimFromMigration('./migrations/0001_init.sql');
 */
import fs from 'node:fs/promises';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch (err) {
  throw new Error(
    'node:sqlite not available. Run with `node --experimental-sqlite ...` ' +
    '(Node 22.5+ required). Original: ' + err.message
  );
}

class D1Statement {
  constructor(sqliteDb, sql) {
    this._sqliteDb = sqliteDb;
    this._sql      = sql;
    this._bound    = [];
  }
  bind(...args) {
    // D1 spreads the bind args into positional `?` placeholders, mirroring
    // node:sqlite's positional parameter API.
    this._bound = args.map((v) => (v === undefined ? null : v));
    return this;
  }
  _stmt() {
    return this._sqliteDb.prepare(this._sql);
  }
  async run() {
    const stmt = this._stmt();
    const meta = stmt.run(...this._bound);
    return { success: true, meta };
  }
  async first() {
    const stmt = this._stmt();
    const row  = stmt.get(...this._bound);
    return row || null;
  }
  async all() {
    const stmt = this._stmt();
    const rows = stmt.all(...this._bound);
    return { results: rows || [], success: true };
  }
}

class D1Shim {
  constructor(sqliteDb) {
    this._sqliteDb = sqliteDb;
  }
  prepare(sql) {
    return new D1Statement(this._sqliteDb, sql);
  }
  exec(sql) {
    this._sqliteDb.exec(sql);
  }
  close() {
    this._sqliteDb.close();
  }
}

export async function createD1ShimFromMigration(migrationPath) {
  const sqliteDb = new DatabaseSync(':memory:');
  const sql = await fs.readFile(migrationPath, 'utf-8');
  sqliteDb.exec(sql);
  return new D1Shim(sqliteDb);
}

export async function createEmptyD1Shim() {
  const sqliteDb = new DatabaseSync(':memory:');
  return new D1Shim(sqliteDb);
}
