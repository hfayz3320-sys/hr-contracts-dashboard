import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocumentProxy, extractText } from 'unpdf';
import { NEW_CONTRACT_ADAPTER } from '../../src/lib/parsers/adapters/contract-new';

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function assertEq<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function assertNe<T>(label: string, actual: T, unexpected: T): void {
  if (actual === unexpected) {
    throw new Error(`${label} must not equal ${String(unexpected)}`);
  }
}

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg) {
    throw new Error('Usage: tsx scripts/dev-tools/verify-real-contract-pdf.ts "Data/Contract/contract-29714467 (2).pdf"');
  }
  const abs = path.resolve(process.cwd(), fileArg);
  const bytes = new Uint8Array(await readFile(abs));
  const hash = await sha256Hex(bytes);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join('\n') : text;
  const out = NEW_CONTRACT_ADAPTER.extract(fullText, path.basename(abs), hash);

  console.log('[verify-real-contract] extracted:', JSON.stringify({
    identityNumber: out.identityNumber,
    fullName: out.fullName,
    executionDate: out.executionDate,
    startDate: out.startDate,
    endDate: out.endDate,
    basicSalary: out.basicSalary,
    housingAllowance: out.housingAllowance,
    transportAllowance: out.transportAllowance,
    otherCashAllowances: out.otherCashAllowances,
    totalSalary: out.totalSalary,
    iban: out.iban,
    extractionConfidence: out.extractionConfidence,
    warnings: out.warnings,
  }, null, 2));

  assertEq('identityNumber', out.identityNumber, '2598101232');
  assertNe('identityNumber', out.identityNumber, '1002896619');
  assertEq('startDate', out.startDate, '2025-02-16');
  assertEq('endDate', out.endDate, '2027-02-15');
  assertEq('executionDate', out.executionDate, '2025-09-08');
  assertEq('totalSalary', out.totalSalary, 13500);
  assertEq('otherCashAllowances', out.otherCashAllowances, 2000);
  assertEq('iban', out.iban, 'SA1180000858608014771260');

  console.log('[verify-real-contract] PASS');
}

main().catch((err) => {
  console.error('[verify-real-contract] FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

