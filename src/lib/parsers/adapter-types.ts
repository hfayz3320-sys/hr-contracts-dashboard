/**
 * Shared types for the explicit per-import-type adapters.
 *
 * Each adapter is dedicated to one (importType, source-format) pair and is
 * responsible for: header recognition, row-level field mapping, validation,
 * and producing canonical rows the worker resolver can consume directly.
 *
 *   Excel adapters:   employee-excel, bupa-insurance-excel
 *   PDF adapters:     contract-old, contract-new
 *
 * The dispatcher modules (excel.ts, pdf.ts) route to these by either the
 * user-selected ImportType (Excel) or an in-file template fingerprint (PDF).
 */

export type ImportType = 'employees' | 'insurance' | 'contracts';

/**
 * One canonical row produced by an adapter. Field names mirror what the
 * worker dry-run resolver expects (camelCase). Adapters MAY include extra
 * keys for the review-queue UI; the resolver ignores unknown keys.
 */
export type AdapterRow = Record<string, unknown>;

/**
 * Result of running an Excel adapter against a single sheet OR a PDF adapter
 * against a single file.
 */
export type AdapterResult = {
  /** Adapter identity for telemetry/audit ("employee_excel/mid_v1", etc.). */
  adapterName: string;
  /**
   * Origin of the rows inside the source — for Excel this is the sheet name,
   * for PDF this is the filename + page hint.
   */
  source: string;
  /** Canonical, resolver-ready rows. */
  rows: AdapterRow[];
  /** Per-row list of missing canonical fields (same length as rows). */
  missingPerRow: string[][];
  /** Adapter-level warnings (unknown headers, layout drift, etc.). */
  warnings: string[];
  /**
   * Sheet/page is unmatched if the adapter could not find any of the
   * canonical fields it was built for. Dispatcher uses this to decide
   * whether to skip vs surface as an error.
   */
  matched: boolean;
};

/**
 * Common shape of an Excel adapter — selected by the user via the
 * Source step. Excel adapters work sheet-by-sheet.
 */
export interface ExcelAdapter {
  readonly name: string;
  readonly importType: 'employees' | 'insurance';
  parseSheet(sheetName: string, rows: Record<string, unknown>[]): AdapterResult;
}

/**
 * Shape of a PDF contract template adapter. The dispatcher classifies the
 * PDF text against each adapter's fingerprint(); whichever returns true wins.
 * Falling back to template='unknown' surfaces a clear error to the user.
 */
export interface PdfContractAdapter {
  readonly name: string;
  readonly templateType: 'old_contract' | 'new_contract';
  /**
   * Returns true if the PDF text matches this template's anchors. Anchors
   * should be specific enough that the two templates don't false-positive
   * against each other.
   */
  fingerprint(text: string): boolean;
  /** Extract canonical fields from one contract's text. */
  extract(text: string, filename: string, fileHash: string): ContractExtraction;
}

export type ContractExtraction = {
  filename: string;
  fileHash: string;
  sourceFile?: string;
  /**
   * 'unknown' when no template adapter recognised the document — the row
   * still flows downstream (with rawTextSnippet) so the review queue can
   * surface it to an admin instead of silently failing.
   */
  templateType: 'old_contract' | 'new_contract' | 'unknown';
  contractNumber?: string;
  executionDate?: string;
  identityNumber?: string;
  fullName?: string;
  nationality?: string;
  passportNumber?: string;
  gender?: string;
  maritalStatus?: string;
  birthDate?: string;
  educationLevel?: string;
  speciality?: string;
  mobile?: string;
  email?: string;
  occupation?: string;
  jobTitle?: string;
  workLocation?: string;
  contractType?: string;
  startDate?: string;
  endDate?: string;
  basicSalary?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  otherCashAllowances?: number;
  totalSalary?: number;
  bankName?: string;
  iban?: string;
  /** Number in [0, 1]. >= 0.6 is generally acceptable. */
  extractionConfidence: number;
  /** Canonical names of fields the adapter could not extract. */
  missingFields: string[];
  /** Adapter warnings (e.g. ambiguous dates). */
  warnings: string[];
  /**
   * Snippet of normalized text the resolver / review queue can display so a
   * human can verify what the adapter saw. Capped at ~2 KB for storage.
   */
  rawTextSnippet: string;
};
