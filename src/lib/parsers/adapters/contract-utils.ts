/**
 * Shared text-extraction utilities for the old/new contract PDF adapters.
 *
 * The two adapters share the same dictionary of EN+AR labels and the same
 * date/number/name regex fragments — only the *fingerprint* and the
 * *template-specific overrides* are different. By exposing the utilities
 * here we keep each adapter file focused on what makes it distinct.
 */

import { normalizeArabicText } from '../arabic-text';

// Acceptable date shapes:
//   2024-06-22, 2024/06/22, 2024.06.22  (ISO-ish)
//   22-06-2024, 22/06/2024, 22.06.2024  (DD-first)
//   2024-6-2                            (single-digit components)
export const RE_DATE = '\\d{1,4}[-/.][\\d]{1,2}[-/.][\\d]{1,4}';
export const RE_NUMBER = '[\\d,]+(?:\\.\\d+)?';
// Names: Arabic + Latin letters, optional spaces, hyphens, apostrophes.
// Capped at 80 chars to avoid swallowing paragraph text.
export const RE_NAME = '[A-Za-z\\u0600-\\u06FF][A-Za-z\\u0600-\\u06FF\\s\\.\\-\']{1,79}';
export const RE_TYPE = '[A-Za-z\\u0600-\\u06FF][A-Za-z\\u0600-\\u06FF\\s\\.\\-/]{0,49}';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build an alternation pattern from a list of labels. Each label is
 * regex-escaped and word-whitespace inside the label tolerates any
 * whitespace sequence (so "Contract Start Date" matches "Contract  Start
 * Date" too).
 */
export function labelAlt(labels: string[]): string {
  return labels
    .map((l) => escapeRegex(l).replace(/\\?\s+/g, '\\s+'))
    .join('|');
}

/**
 * Search for a label followed by a value in any of these layouts:
 *
 *   inline           : "Label: value"   (separator is any of : ：- –)
 *   no-separator     : "Label value"
 *   next-line        : "Label\nvalue"
 *   gap (table cell) : "Label …<up to 200 chars>… value"
 *
 * Returns the first non-empty capture. The gap pattern is critical for
 * table-based MoHRSD contract PDFs where the value can be in a different
 * cell from the label.
 */
export function findLabelledValue(
  text: string,
  labels: string[],
  valuePattern: string,
): string | undefined {
  const alt = labelAlt(labels);
  const sep = '[\\s:：\\-–|]*';
  const re1 = new RegExp(`(?:${alt})${sep}(${valuePattern})`, 'iu');
  const re2 = new RegExp(`(?:${alt})${sep}\\n+\\s*(${valuePattern})`, 'iu');
  const re3 = new RegExp(`(?:${alt})[^\\n]{0,200}?(${valuePattern})`, 'iu');
  return (
    match(text, re1) ?? match(text, re2) ?? match(text, re3)
  );
}

function match(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m && m[1] ? m[1].trim() : undefined;
}

/**
 * Convert a flexible date string to ISO YYYY-MM-DD. Returns undefined for
 * ambiguous or out-of-range inputs.
 */
export function toIsoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split(/[-/.]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 3) return undefined;
  const [a, b, c] = parts as [string, string, string];

  let year: number, month: number, day: number;
  if (a.length === 4) { year = Number(a); month = Number(b); day = Number(c); }
  else if (c.length === 4) { day = Number(a); month = Number(b); year = Number(c); }
  else return undefined;

  if (!isFinite(year) || !isFinite(month) || !isFinite(day)) return undefined;
  if (year < 1900 || year > 2100) return undefined;
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > 31) return undefined;

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function toNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Last-resort date extractor: pull EVERY date-shaped token, then prefer
 * Gregorian (marked with "م" or with year >= 1900 < 1500 of Hijri) over
 * Hijri (marked with "هـ" or "هـ"). Used as fallback when no labelled
 * date can be matched.
 */
export function findAllDates(text: string): string[] {
  const re = new RegExp(RE_DATE, 'g');
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const iso = toIsoDate(m[0]);
    if (iso) out.push(iso);
  }
  return out;
}

/**
 * Iqama extractor — tries labelled match first, then falls back to the
 * 10-digit run that starts with 1 or 2 (current Saudi Iqama allocations).
 */
export function extractIqama(text: string, labels: string[]): string | undefined {
  const labelled = findLabelledValue(text, labels, '\\d{10}');
  if (labelled) return labelled.replace(/\D/g, '');

  const runs = [...text.matchAll(/\b(\d{10})\b/g)]
    .map((m) => m[1])
    .filter((x): x is string => !!x);
  if (runs.length === 0) return undefined;
  return runs.find((r) => r.startsWith('1') || r.startsWith('2')) ?? runs[runs.length - 1];
}

export function normalizeContractText(text: string): string {
  // Preserve newlines (layout hint), but normalise everything else.
  // Keep the original Arabic letter shapes — we want to MATCH against them
  // verbatim, not canonicalised. Use the canonicalised form only when
  // building regex labels above.
  return text
    .replace(/[^\S\n\r]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function snippetForReview(text: string, max = 2000): string {
  const normalized = normalizeArabicText(text);
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}
