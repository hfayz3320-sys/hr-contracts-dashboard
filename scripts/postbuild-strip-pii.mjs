// -*- coding: utf-8 -*-
/**
 * scripts/postbuild-strip-pii.mjs
 *
 * Vite copies everything under public/ into dist/ at build time. After the
 * security cleanup, public/data/ contains real PII (Employee Master Excel,
 * Bupa medical Excel, contract PDFs) intended for LOCAL DEV ONLY.
 *
 * This script runs after `npm run build` and:
 *   1. Strips known-PII files/folders from dist/data/
 *   2. Walks dist/ and FAILS the script (exit 2) if any forbidden file
 *      pattern remains — so a stale or future-added PII file can't slip
 *      through unnoticed.
 *
 * Forbidden patterns (gitignored AND must never be deployed):
 *   dist/data/Contract/             dist/data/contracts/
 *   dist/data/contracts-manifest.json
 *   dist/data/sample.xlsx           dist/data/popa.xlsx
 *   dist/data/بيانات الموظفين.xlsx
 *   anything *.pdf or *.xlsx under dist/data/
 *
 * Usage:
 *   node scripts/postbuild-strip-pii.mjs       (default — strip + verify)
 *   node scripts/postbuild-strip-pii.mjs --check-only   (verify, no strip)
 */

import fs       from 'node:fs/promises';
import fsSync   from 'node:fs';
import path     from 'node:path';
import url      from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const ROOT       = path.resolve(path.dirname(__filename), '..');
const DIST_DATA  = path.join(ROOT, 'dist', 'data');

const FORBIDDEN_FILES = [
  'dist/data/sample.xlsx',
  'dist/data/popa.xlsx',
  'dist/data/بيانات الموظفين.xlsx',
  'dist/data/contracts-manifest.json',
];
const FORBIDDEN_DIRS = [
  'dist/data/Contract',
  'dist/data/contracts',
];
// Recursive scan rules — anything matching is PII and must not ship
const FORBIDDEN_PATTERNS = [
  /\.pdf$/i,
  /\.xlsx$/i,
  /\.xls$/i,
  /contracts-manifest\.json$/i,
];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function rmIfExists(p) {
  if (!(await exists(p))) return false;
  await fs.rm(p, { recursive: true, force: true });
  return true;
}

async function walk(dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

function relPosix(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

async function main() {
  const checkOnly = process.argv.includes('--check-only');

  if (!fsSync.existsSync(DIST_DATA)) {
    console.log('postbuild-strip-pii: dist/data does not exist — nothing to do');
    return;
  }

  // 1. Strip known forbidden files/folders
  const stripped = [];
  if (!checkOnly) {
    for (const rel of FORBIDDEN_FILES) {
      const full = path.join(ROOT, rel);
      if (await rmIfExists(full)) stripped.push(rel);
    }
    for (const rel of FORBIDDEN_DIRS) {
      const full = path.join(ROOT, rel);
      if (await rmIfExists(full)) stripped.push(rel + '/');
    }
  }

  // 2. Verify dist is clean — scan EVERY file under dist/data/ and dist/
  const allDistFiles = await walk(path.join(ROOT, 'dist'));
  const violators = [];
  for (const f of allDistFiles) {
    const rel = relPosix(f);
    if (!rel.startsWith('dist/data/')) {
      // Outside dist/data/ — also forbid PDFs / xlsx in dist/ root
      if (FORBIDDEN_PATTERNS.some((re) => re.test(rel))) {
        violators.push(rel);
      }
      continue;
    }
    // Inside dist/data/ — block PII patterns
    if (FORBIDDEN_PATTERNS.some((re) => re.test(rel))) {
      violators.push(rel);
    }
  }

  console.log('postbuild-strip-pii');
  console.log(`  Stripped: ${stripped.length}`);
  stripped.forEach((s) => console.log(`    - ${s}`));
  console.log(`  Remaining violators: ${violators.length}`);
  violators.forEach((v) => console.log(`    !! ${v}`));

  if (violators.length > 0) {
    console.error(`\nFAIL: ${violators.length} PII file(s) detected in dist/. Build is NOT safe to deploy.`);
    process.exit(2);
  }
  console.log('\n  OK: dist/ is PII-free.');
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
