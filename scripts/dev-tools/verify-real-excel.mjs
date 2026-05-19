import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dataDir = process.argv[2] ?? 'data';
const script = path.join(process.cwd(), 'scripts', 'dev-tools', 'verify-real-excel.ts');
const r = spawnSync(
  `npx tsx "${script}" "${dataDir}"`,
  { stdio: 'inherit', cwd: process.cwd(), env: process.env, shell: true },
);
if (r.status !== 0) process.exit(r.status ?? 1);

