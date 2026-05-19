import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePdfFile } from '../../src/lib/parsers/pdf';

function assertTrue(label: string, condition: boolean): void {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg) {
    throw new Error(
      'Usage: tsx scripts/dev-tools/verify-real-old-contract-pdf.ts "data/Contract/AAFAQ AHMED ZULFIQAR ALI.pdf"',
    );
  }
  const abs = path.resolve(process.cwd(), fileArg);
  const bytes = await readFile(abs);
  const file = new File([bytes], path.basename(abs), { type: 'application/pdf' });
  const out = await parsePdfFile(file);

  console.log(
    '[verify-real-old-contract] extracted:',
    JSON.stringify(
      {
        templateType: out.templateType,
        identityNumber: out.identityNumber,
        fullName: out.fullName,
        nationality: out.nationality,
        jobTitle: out.jobTitle,
        startDate: out.startDate,
        endDate: out.endDate,
        basicSalary: out.basicSalary,
        housingAllowance: out.housingAllowance,
        transportAllowance: out.transportAllowance,
        totalSalary: out.totalSalary,
        extractionConfidence: out.extractionConfidence,
        warnings: out.warnings,
      },
      null,
      2,
    ),
  );

  assertTrue('templateType is old_contract', out.templateType === 'old_contract');
  assertTrue('identityNumber extracted', typeof out.identityNumber === 'string' && out.identityNumber.length > 0);
  assertTrue('startDate extracted', typeof out.startDate === 'string' && out.startDate.length > 0);
  assertTrue('endDate extracted', typeof out.endDate === 'string' && out.endDate.length > 0);
  assertTrue('confidence is present', typeof out.extractionConfidence === 'number');
  assertTrue('fullName does not contain Profession', !/\bprofession\b/i.test(out.fullName ?? ''));
  assertTrue('nationality does not contain Date of Birth', !/\bdate of birth\b/i.test(out.nationality ?? ''));
  assertTrue('jobTitle does not contain Employee Number', !/\bemployee number\b/i.test(out.jobTitle ?? ''));

  const suspiciousSalary =
    (typeof out.totalSalary === 'number' && out.totalSalary > 0 && out.totalSalary < 500) ||
    (typeof out.basicSalary === 'number' && out.basicSalary > 0 && out.basicSalary < 500);
  assertTrue(
    'salary either realistic or omitted',
    !suspiciousSalary ||
      out.basicSalary == null ||
      out.totalSalary == null ||
      out.warnings.some((w) => /salary values appear unusually low/i.test(w)),
  );

  console.log('[verify-real-old-contract] PASS');
}

main().catch((err) => {
  console.error('[verify-real-old-contract] FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
