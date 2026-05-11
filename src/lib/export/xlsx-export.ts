/**
 * Browser-side XLSX export.
 *
 * Lazy-loaded so the user only pays the SheetJS bundle cost when they
 * actually export. Produces a workbook with:
 *
 *   - A "Summary" sheet (key totals + filter context)
 *   - One data sheet per dataset (Employees / Insurance / Contracts / etc.)
 *   - Frozen header row, auto-fit column widths, ISO date formatting
 *
 * Sensitive identity numbers are redacted by default — pass `redactIdentity:
 * false` only when the caller has confirmed the actor is allowed full PII.
 *
 * Triggers a download in the browser via a Blob + anchor click. No bytes
 * leave the user's machine.
 */

export type ExportColumn<TRow> = {
  /** Header label shown in the workbook. */
  header: string;
  /** Field accessor. Returns the raw value. */
  value: (row: TRow) => unknown;
  /** Optional width hint (chars). Auto-computed if absent. */
  width?: number;
  /** Cell formatter (date / currency / etc.) — applied AFTER value(). */
  format?: 'date' | 'number';
};

export type ExportInput<TRow> = {
  /** Workbook + file name (no extension). */
  filename: string;
  /** Sheet name for the data sheet. */
  sheet: string;
  rows: TRow[];
  columns: ExportColumn<TRow>[];
  /** Summary rows ("Total employees: 501", filter context, etc.). */
  summary?: Array<{ label: string; value: string | number }>;
};

function redactIqama(s: unknown): string {
  if (typeof s !== 'string' || s.length < 6) return s == null ? '' : String(s);
  return s.slice(0, 2) + 'x'.repeat(s.length - 4) + s.slice(-2);
}

/**
 * Build the XLSX workbook bytes WITHOUT triggering a download. Exposed
 * separately from `exportToXlsx` so unit tests can inspect the bytes
 * without needing a DOM. Browser code should keep using `exportToXlsx`.
 */
export async function buildXlsxBuffer<TRow>(
  input: ExportInput<TRow>,
  opts?: { redactIdentity?: boolean },
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const summaryAOA: (string | number)[][] = [
    ['MID Contracts Dashboard — Export'],
    [`Generated: ${new Date().toISOString()}`],
    [],
  ];
  if (input.summary && input.summary.length > 0) {
    summaryAOA.push(['Summary']);
    for (const s of input.summary) summaryAOA.push([s.label, s.value]);
  }
  const summaryWS = XLSX.utils.aoa_to_sheet(summaryAOA);
  summaryWS['!cols'] = [{ wch: 36 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');

  const redact = opts?.redactIdentity !== false;
  const rows = input.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of input.columns) {
      let v = c.value(r);
      if (redact && /identity|iqama/i.test(c.header) && typeof v === 'string') {
        v = redactIqama(v);
      }
      if (c.format === 'date' && v != null && typeof v === 'string') {
        v = v.slice(0, 10);
      }
      o[c.header] = v ?? '';
    }
    return o;
  });

  const dataWS = XLSX.utils.json_to_sheet(rows, {
    header: input.columns.map((c) => c.header),
  });
  dataWS['!cols'] = input.columns.map((c) => ({
    wch: c.width ?? Math.max(c.header.length + 2, 14),
  }));
  dataWS['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, dataWS, input.sheet.slice(0, 31));

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/**
 * Browser-only convenience: build the XLSX and trigger a download via
 * Blob + anchor click. Tests should use `buildXlsxBuffer` instead.
 */
export async function exportToXlsx<TRow>(
  input: ExportInput<TRow>,
  opts?: { redactIdentity?: boolean },
): Promise<void> {
  const buf = await buildXlsxBuffer(input, opts);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${input.filename}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
