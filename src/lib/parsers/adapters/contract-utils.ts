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
/**
 * Extract a 10-digit identity only from labelled fields inside `text`.
 * Never scans the whole document — use this for employee (Second Party) data.
 */
export function extractIqamaScoped(text: string, labels: string[]): string | undefined {
  const labelled = findLabelledValue(text, labels, '\\d{10}');
  if (labelled) return labelled.replace(/\D/g, '');
  return undefined;
}

/**
 * Labelled match first, then last-resort global 10-digit scan.
 * Safe only when the document has a single identity block (old renewal PDFs).
 */
export function extractIqama(text: string, labels: string[]): string | undefined {
  const scoped = extractIqamaScoped(text, labels);
  if (scoped) return scoped;

  const runs = [...text.matchAll(/\b(\d{10})\b/g)]
    .map((m) => m[1])
    .filter((x): x is string => !!x);
  if (runs.length === 0) return undefined;
  return runs.find((r) => r.startsWith('1') || r.startsWith('2')) ?? runs[runs.length - 1];
}

/** MoHRSD new template — anchored sections for party-scoped extraction. */
export type NewContractSections = {
  contractInfo: string;
  firstParty: string;
  secondParty: string;
  profession: string;
  wage: string;
  bank: string;
};

type SectionAnchor = { key: keyof NewContractSections; patterns: RegExp[] };

const APOS = "['’ʼ`´]";

const NEW_CONTRACT_SECTION_ANCHORS: SectionAnchor[] = [
  {
    key: 'contractInfo',
    patterns: [
      new RegExp(`\\b1\\s*[.)\\-–:]?\\s*(?:Contract\\s*Information|معلومات\\s*العقد)`, 'iu'),
      /Contract\s*Information/iu,
      /معلومات\s*العقد/iu,
    ],
  },
  {
    key: 'firstParty',
    patterns: [
      new RegExp(
        `\\b2\\s*[.)\\-–:]?\\s*(?:First\\s*Party(?:\\s*${APOS}\\s*s)?\\s*Information|الطرف\\s*الأول|بيانات\\s*الطرف\\s*الأول)`,
        'iu',
      ),
      new RegExp(`First\\s*Party(?:\\s*${APOS}\\s*s)?\\s*Information`, 'iu'),
      /بيانات\s*الطرف\s*الأول/iu,
    ],
  },
  {
    key: 'secondParty',
    patterns: [
      new RegExp(
        `\\b3\\s*[.)\\-–:]?\\s*(?:Second\\s*Party(?:\\s*${APOS}\\s*s)?\\s*Information|الطرف\\s*الثاني|بيانات\\s*الطرف\\s*الثاني)`,
        'iu',
      ),
      new RegExp(`Second\\s*Party(?:\\s*${APOS}\\s*s)?\\s*Information`, 'iu'),
      /بيانات\s*الطرف\s*الثاني/iu,
    ],
  },
  {
    key: 'profession',
    patterns: [
      new RegExp(
        `\\b4\\s*[.)\\-–:]?\\s*(?:Profession\\s*&\\s*Work\\s*${APOS}?\\s*s?\\s*Location|Profession|المهنة\\s*ومكان\\s*العمل|مكان\\s*العمل)`,
        'iu',
      ),
      new RegExp(`Work\\s*${APOS}?\\s*s?\\s*Location`, 'iu'),
      /المهنة\s*ومكان\s*العمل/iu,
    ],
  },
  {
    key: 'wage',
    patterns: [
      new RegExp(`\\b9\\s*[.)\\-–:]?\\s*(?:Wage\\s*&\\s*Benefits|Wage|الأجر\\s*والمزايا|الأجر\\s*والمنافع)`, 'iu'),
      /Wage\s*&\s*Benefits/iu,
      /الأجر\s*والمزايا/iu,
    ],
  },
  {
    key: 'bank',
    patterns: [
      new RegExp(
        `\\b10\\s*[.)\\-–:]?\\s*(?:Second\\s*Party(?:\\s*${APOS}\\s*s)?\\s*Bank\\s*Account\\s*Information|Bank\\s*Account|الحساب\\s*البنكي|حساب\\s*البنك)`,
        'iu',
      ),
      new RegExp(`Second\\s*Party(?:\\s*${APOS}\\s*s)?\\s*Bank\\s*Account\\s*Information`, 'iu'),
      /Bank\s*Account/iu,
    ],
  },
];

function findEarliestIndex(text: string, patterns: RegExp[]): number {
  let best = -1;
  for (const re of patterns) {
    const m = text.search(re);
    if (m >= 0 && (best < 0 || m < best)) best = m;
  }
  return best;
}

/**
 * Split a normalised new-contract PDF text into party-scoped regions.
 * Fields that identify the employee MUST be read from `secondParty` only.
 */
export function splitNewContractSections(text: string): NewContractSections {
  // `unpdf` may merge the whole document into one stream and may emit apostrophe
  // variants (', ’, ʼ). Normalize only those runes for search so indices remain
  // stable against the original `text`.
  const searchText = text.replace(/[’ʼ`´]/g, "'");
  const hits: { key: keyof NewContractSections; index: number }[] = [];
  for (const anchor of NEW_CONTRACT_SECTION_ANCHORS) {
    const index = findEarliestIndex(searchText, anchor.patterns);
    if (index >= 0) hits.push({ key: anchor.key, index });
  }
  hits.sort((a, b) => a.index - b.index);

  const empty = '';
  const out: NewContractSections = {
    contractInfo: empty,
    firstParty: empty,
    secondParty: empty,
    profession: empty,
    wage: empty,
    bank: empty,
  };
  if (hits.length === 0) {
    // No section markers — treat entire doc as contractInfo only (safe fallback:
    // new adapter will not global-scan identity).
    out.contractInfo = text;
    return out;
  }

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.index;
    const end = i + 1 < hits.length ? hits[i + 1]!.index : text.length;
    out[hits[i]!.key] = text.slice(start, end);
  }
  return out;
}

/** Saudi IBAN: SA + 22 digits. */
export function extractIban(text: string): string | undefined {
  const m = text.match(/\b(SA(?:\s*\d){22})\b/i);
  if (!m?.[1]) return undefined;
  const normalized = m[1].replace(/\s+/g, '').toUpperCase();
  return /^SA\d{22}$/.test(normalized) ? normalized : undefined;
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
