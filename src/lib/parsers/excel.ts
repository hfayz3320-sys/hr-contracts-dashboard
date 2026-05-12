/**
 * Excel parser dispatcher.
 *
 * NO heuristic guessing. The caller (the Import Wizard) ALREADY knows what
 * import type the user is doing — it asked them in the Source step. We use
 * that as the contract and route to a dedicated, explicit adapter:
 *
 *   importType='employees'  → EMPLOYEE_EXCEL_ADAPTER
 *   importType='insurance'  → BUPA_INSURANCE_EXCEL_ADAPTER
 *
 * Each adapter is responsible for its own header dictionary, validation,
 * and any post-processing (e.g. Bupa endDate defaulting). The dispatcher
 * only does file IO and per-sheet iteration.
 *
 * Sheets that don't match the chosen adapter's schema produce a warning
 * but don't fail the whole workbook — a workbook with one valid sheet
 * and a "Notes" sheet should still import that one valid sheet.
 */
import { EMPLOYEE_EXCEL_ADAPTER } from './adapters/employee-excel';
import { BUPA_INSURANCE_EXCEL_ADAPTER } from './adapters/bupa-insurance-excel';
import type { ExcelAdapter } from './adapter-types';

export type ImportType = 'employees' | 'insurance';

export type ParsedSheet = {
  domain: ImportType;
  sheetName: string;
  adapterName: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  /**
   * Per-row list of canonical fields that the adapter could not extract.
   * Same length as `rows`; rows where the array is non-empty will be
   * routed to the review queue by the dry-run resolver.
   */
  missingPerRow: string[][];
  warnings: string[];
};

export type ParsedWorkbook = {
  filename: string;
  importType: ImportType;
  sheets: ParsedSheet[];
  warnings: string[];
};

function adapterFor(importType: ImportType): ExcelAdapter {
  if (importType === 'employees') return EMPLOYEE_EXCEL_ADAPTER;
  if (importType === 'insurance') return BUPA_INSURANCE_EXCEL_ADAPTER;
  throw new Error(`No Excel adapter registered for importType=${importType}`);
}

/**
 * Parse an Excel workbook against a dedicated adapter selected by importType.
 *
 * @param file       The browser File object — bytes never leave this scope.
 * @param importType The type the user picked in the Source step.
 */
export async function parseExcelFile(
  file: File,
  importType: ImportType,
): Promise<ParsedWorkbook> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const adapter = adapterFor(importType);

  const sheets: ParsedSheet[] = [];
  const fileWarnings: string[] = [];
  // Phase 8 — collect every header we saw across every sheet that did NOT
  // match. When the whole workbook matches zero sheets the admin needs to
  // see what headers they sent us so they can extend the synonym list
  // without first opening the file.
  const seenUnknownHeaders = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      raw: false,
      defval: null,
      blankrows: false,
    });
    if (json.length === 0) continue;

    const result = adapter.parseSheet(sheetName, json);
    if (!result.matched) {
      // Sheet didn't match this adapter — surface as a warning but keep
      // looking. The Source step has already confirmed the import type;
      // an unmatched sheet just means "no usable data in this sheet".
      fileWarnings.push(
        `Sheet "${sheetName}" did not match the ${importType} schema and was skipped.`,
      );
      // Capture the headers we DID see in this rejected sheet.
      for (const h of Object.keys(json[0] ?? {})) {
        if (h && h.trim() !== '') seenUnknownHeaders.add(h.trim());
      }
      continue;
    }

    sheets.push({
      domain: importType,
      sheetName,
      adapterName: result.adapterName,
      rowCount: result.rows.length,
      rows: result.rows,
      missingPerRow: result.missingPerRow,
      warnings: result.warnings,
    });
  }

  if (sheets.length === 0) {
    const sample = Array.from(seenUnknownHeaders).slice(0, 12);
    const more = seenUnknownHeaders.size > sample.length ? ` (+${seenUnknownHeaders.size - sample.length} more)` : '';
    fileWarnings.push(
      `No sheets in this workbook matched the ${importType} schema. ` +
        (sample.length > 0
          ? `Headers we saw: ${sample.join(', ')}${more}. `
          : 'No headers were detected at all. ') +
        `Verify the import type matches the file, and extend the ${importType} header dictionary if these are legitimate columns.`,
    );
  }

  return { filename: file.name, importType, sheets, warnings: fileWarnings };
}
