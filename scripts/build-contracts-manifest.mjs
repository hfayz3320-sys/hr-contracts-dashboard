// -*- coding: utf-8 -*-
/**
 * scripts/build-contracts-manifest.mjs
 *
 * Generates public/data/contracts-manifest.json from the contents of
 * BOTH:
 *   public/data/contracts/   (lowercase — legacy)
 *   public/data/Contract/    (capital C — current operator convention)
 *
 * If both folders exist, the manifest merges them (deduped by filename).
 *
 * Usage:
 *   node scripts/build-contracts-manifest.mjs
 *   node scripts/build-contracts-manifest.mjs --from "D:\\عقود\\Contract"
 *   node scripts/build-contracts-manifest.mjs --from "D:\\عقود\\Contract" --target Contract
 *
 *   --from   <dir>   copy PDFs from this source folder before building
 *   --target <name>  destination folder under public/data/ (default: 'Contract')
 *
 * The manifest's `path` field uses whichever folder the file lives in, so
 * the dashboard can fetch each PDF directly without a server-side rewrite.
 *
 * Both contract folders + the manifest are gitignored.
 */

import fs       from 'node:fs/promises';
import fsSync   from 'node:fs';
import path     from 'node:path';
import url      from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const ROOT       = path.resolve(path.dirname(__filename), '..');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

// Both case variants — Vite/CFlare are case-sensitive on Linux deploys.
const CONTRACT_DIRS = [
  { fsPath: path.join(PUBLIC_DATA, 'contracts'), urlPrefix: '/data/contracts/' },
  { fsPath: path.join(PUBLIC_DATA, 'Contract'),  urlPrefix: '/data/Contract/'  },
];

const MANIFEST_PATH = path.join(PUBLIC_DATA, 'contracts-manifest.json');

function parseArgs(argv) {
  const args = { from: null, target: 'Contract' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from' && argv[i + 1])   { args.from   = argv[++i]; }
    if (argv[i] === '--target' && argv[i + 1]) { args.target = argv[++i]; }
  }
  return args;
}

async function copyFromSource(sourceDir, targetDir) {
  if (!fsSync.existsSync(sourceDir)) {
    throw new Error(`Source folder not found: ${sourceDir}`);
  }
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.pdf')) continue;
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(targetDir, entry.name);
    await fs.copyFile(src, dst);
    copied += 1;
  }
  return copied;
}

async function listPdfs(folder) {
  if (!fsSync.existsSync(folder)) return [];
  const entries = await fs.readdir(folder);
  return entries.filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.from) {
    const targetDir = path.join(PUBLIC_DATA, args.target);
    console.log(`Copying PDFs from ${args.from} → ${targetDir}`);
    const n = await copyFromSource(args.from, targetDir);
    console.log(`  copied ${n} PDF(s)`);
  }

  // Scan both folders, merge by filename (case-sensitive — same name in
  // different folders is treated as the same logical contract).
  const seen = new Set();
  const manifest = [];
  let perDir = [];

  for (const dir of CONTRACT_DIRS) {
    const files = await listPdfs(dir.fsPath);
    perDir.push({ folder: path.relative(ROOT, dir.fsPath), count: files.length });
    for (const fileName of files) {
      const key = fileName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      manifest.push({
        fileName,
        path:  dir.urlPrefix + encodeURIComponent(fileName),
        label: fileName.replace(/\.pdf$/i, ''),
      });
    }
  }

  // Sort the merged manifest by filename for stable diffs.
  manifest.sort((a, b) => a.fileName.localeCompare(b.fileName));

  await fs.mkdir(PUBLIC_DATA, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\nFolders scanned:');
  perDir.forEach((d) => console.log(`  ${d.folder}: ${d.count} PDF(s)`));
  console.log(`\nWrote ${manifest.length} unique entries → ${MANIFEST_PATH}`);
  console.log('NOTE: contracts/, Contract/, and the manifest are gitignored. Never deployed publicly.');
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
