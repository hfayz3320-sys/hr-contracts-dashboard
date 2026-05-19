/**
 * Phase 2B parser validation — PDF.
 *
 * The PDF parser combines:
 *   - `unpdf` text extraction (a real PDF library) for raw text
 *   - regex/keyword logic in `pdf.ts` for field extraction + template detection
 *
 * For these tests we exercise the regex/template logic directly against
 * synthetic text snippets that mimic each contract template, so the tests
 * stay fast and deterministic without depending on real PDF binaries.
 *
 * Covers:
 *   - old contract template
 *   - new contract template
 *   - Arabic text
 *   - scanned/image PDF case (extraction returns empty text)
 *   - missing/invalid Iqama
 *
 * `pdf.ts` does not currently expose its regex helpers, so this test file
 * imports them indirectly by re-exporting the helpers we need via a small
 * shim at the bottom of `pdf.ts`. To keep tests independent of unpdf, we
 * mock `unpdf` to return our synthetic text.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('unpdf', () => ({
  extractText: vi.fn(),
  getDocumentProxy: vi.fn(async () => ({})),
}));

const SYNTH_NEW_CONTRACT_EN = `
Standard Work Contract
وزارة الموارد البشرية
منصة قوى
new appointment

2 First Party's Information
Name: Employer Rep
ID No.: 1000000001

3 Second Party's Information
Employee Name: Alex Rivers
Iqama: 9900000007
Nationality: Demoland

4 Profession & Work Location
Profession: Technician

9 Wage & Benefits
Contract Type: Fixed-term
Start Date: 2025-01-01
End Date: 2027-12-31
Basic Salary: 4,500
Housing Allowance: 1,000
Transport Allowation: 300
Total Salary: 5,800
`;

const SYNTH_OLD_CONTRACT_AR = `
تجديد عقد العمل
الاسم: أحمد سامبل
الهوية: 9900000048
الجنسية: Sampleland
المهنة: Foreman
من تاريخ: 2024-06-01
إلى تاريخ: 2026-05-31
الراتب الأساسي: 3,500
بدل السكن: 800
المجموع: 4,300
`;

const SYNTH_OLD_CONTRACT_EN = `
Employment Contract
Employee Name: Aafaq Ahmed
Iqama No: 2456678890
Nationality: Pakistan
Start Date: 2024-01-01
End Date: 2026-12-31
Basic Salary: 2,500
Total Salary: 3,400
`;

const SYNTH_SCANNED_PDF = ''; // image-only PDF: extracted text is empty
const SYNTH_NO_IQAMA = `
Employment Contract
Employee Name: Phantom Worker
Start Date: 2025-01-01
End Date: 2026-12-31
`;

describe('PDF parser — template + field extraction', () => {
  // We re-import the parser fresh per test so the mock can return per-case text.
  async function parseSynth(text: string) {
    const unpdf = await import('unpdf');
    (unpdf.extractText as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      totalPages: 1,
      text: [text],
    });
    const { parsePdfFile } = await import('@/lib/parsers/pdf');
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'sample.pdf', {
      type: 'application/pdf',
    });
    return parsePdfFile(file);
  }

  it('detects new contract template + extracts EN fields', async () => {
    const r = await parseSynth(SYNTH_NEW_CONTRACT_EN);
    expect(r.templateType).toBe('new_contract');
    expect(r.identityNumber).toBe('9900000007');
    expect(r.fullName).toContain('Alex Rivers');
    expect(r.startDate).toBe('2025-01-01');
    expect(r.endDate).toBe('2027-12-31');
    expect(r.basicSalary).toBe(4500);
    expect(r.housingAllowance).toBe(1000);
    expect(r.transportAllowance).toBe(300);
    expect(r.identityNumber).not.toBe('1000000001');
    expect(r.totalSalary).toBe(5800);
    expect(r.extractionConfidence).toBeGreaterThan(0.7);
  });

  it('detects old contract template + extracts Arabic fields', async () => {
    const r = await parseSynth(SYNTH_OLD_CONTRACT_AR);
    expect(r.templateType).toBe('old_contract');
    expect(r.identityNumber).toBe('9900000048');
    expect(r.startDate).toBe('2024-06-01');
    expect(r.endDate).toBe('2026-05-31');
    expect(r.basicSalary).toBe(3500);
  });

  it('does not misclassify old English contract as new template', async () => {
    const r = await parseSynth(SYNTH_OLD_CONTRACT_EN);
    expect(r.templateType).toBe('old_contract');
    expect(r.identityNumber).toBe('2456678890');
    expect(r.startDate).toBe('2024-01-01');
    expect(r.endDate).toBe('2026-12-31');
  });

  it('returns low confidence + warnings on a scanned/image PDF (empty text)', async () => {
    const r = await parseSynth(SYNTH_SCANNED_PDF);
    expect(r.templateType).toBe('unknown');
    expect(r.identityNumber).toBeUndefined();
    expect(r.startDate).toBeUndefined();
    expect(r.extractionConfidence).toBeLessThan(0.3);
    expect(r.warnings.some((w) => /identity number/i.test(w))).toBe(true);
  });

  it('flags missing Iqama in otherwise-readable PDF', async () => {
    const r = await parseSynth(SYNTH_NO_IQAMA);
    expect(r.identityNumber).toBeUndefined();
    expect(r.warnings.some((w) => /identity number/i.test(w))).toBe(true);
    // Confidence should be reduced because the most-weighted field is missing
    expect(r.extractionConfidence).toBeLessThan(0.7);
  });

  it('hash + filename + warnings are always set', async () => {
    const r = await parseSynth(SYNTH_NEW_CONTRACT_EN);
    expect(r.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.filename).toBe('sample.pdf');
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});
