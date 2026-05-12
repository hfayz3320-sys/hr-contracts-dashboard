/**
 * Phase 8 — dispatcher-level "no sheets matched" warning aggregates the
 * unknown headers from every rejected sheet, so the admin can extend the
 * synonym list without first opening the file in Excel.
 *
 * No PII files are read; synthetic workbooks are built in-test.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile } from '@/lib/parsers/excel';

function makeXlsx(name: string, sheets: Record<string, Record<string, unknown>[]>): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('Phase 8 — dispatcher "no sheets matched" surfaces unknown headers', () => {
  it('aggregates headers from every rejected sheet into the workbook warning', async () => {
    const file = makeXlsx('weird.xlsx', {
      Sheet1: [{ FOO: 'a', BAR: 'b' }],
      Sheet2: [{ BAZ: 'c', QUX: 'd' }],
    });
    const wb = await parseExcelFile(file, 'employees');
    expect(wb.sheets).toHaveLength(0);
    const noMatchWarning = wb.warnings.find((w) => /No sheets in this workbook matched/i.test(w));
    expect(noMatchWarning).toBeDefined();
    // Every header we saw across BOTH rejected sheets should appear so the
    // admin can copy them into the synonym dictionary.
    for (const h of ['FOO', 'BAR', 'BAZ', 'QUX']) {
      expect(noMatchWarning).toContain(h);
    }
  });

  it('caps the visible header sample at 12 with a "+N more" suffix', async () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) wide[`COL_${i}`] = `v${i}`;
    const file = makeXlsx('wide.xlsx', { Sheet1: [wide] });
    const wb = await parseExcelFile(file, 'employees');
    const w = wb.warnings.find((x) => x.startsWith('No sheets in this workbook matched'))!;
    expect(w).toMatch(/\+\d+ more/);
  });

  it('still surfaces a plain "no headers detected" line when the file is empty', async () => {
    // workbook with one sheet whose only row is all-null
    const file = makeXlsx('empty.xlsx', { Sheet1: [{ a: null, b: null }] });
    const wb = await parseExcelFile(file, 'employees');
    // sheet_to_json with blankrows:false drops all-null rows so json.length===0,
    // adapter is never called, and the workbook reports "No sheets matched".
    expect(wb.sheets).toHaveLength(0);
    const noMatchWarning = wb.warnings.find((w) => /No sheets in this workbook matched/i.test(w));
    expect(noMatchWarning).toBeDefined();
  });
});
