import { spawnSync } from 'node:child_process';
import path from 'node:path';

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: node scripts/dev-tools/verify-real-old-contract-pdf.mjs "data/Contract/AAFAQ AHMED ZULFIQAR ALI.pdf"');
  process.exit(1);
}

const script = path.join(process.cwd(), 'scripts', 'dev-tools', 'verify-real-old-contract-pdf.ts');
const r = spawnSync(
  `npx tsx "${script}" "${fileArg}"`,
  { stdio: 'inherit', cwd: process.cwd(), env: process.env, shell: true },
);
if (r.status !== 0) process.exit(r.status ?? 1);
