/**
 * Arabic-aware text normalization.
 *
 * Real-world Arabic Excel headers and PDF text have many "visually identical"
 * variants that differ at the codepoint level — and a naive substring match
 * misses every one of them. This module produces a *single canonical form*
 * that's safe to use as a Map key for header matching, regex anchors, etc.
 *
 * What it does (in order):
 *
 *   1. NFKC Unicode normalization — collapses compatibility forms (e.g.
 *      Arabic Presentation Forms to base letters) and ensures consistent
 *      combining mark order.
 *   2. Strip diacritics / Tashkeel (U+064B..U+065F, U+0670).
 *   3. Strip Tatweel / Kashida (U+0640) — the decorative letter extender.
 *   4. Normalize alef variants  (U+0622 0623 0625 0671) to (U+0627).
 *   5. Normalize yeh variants    (U+0649 06CC) to (U+064A).
 *   6. Normalize kaf variants    (U+06A9) to (U+0643).
 *   7. Teh marbuta (U+0629) is intentionally kept distinct from he (U+0647).
 *   8. Replace NBSP and other Unicode whitespace with ASCII space.
 *   9. Collapse whitespace and lowercase Latin letters.
 *
 * Header normalization additionally strips structural punctuation so that
 * "Contract Start Date", "contract_start_date" and "contract-start.date"
 * all collide on the same key. For Arabic headers the same applies: tatweel,
 * NBSP, diacritics, and letter-shape variants are all folded away.
 */

const DIACRITICS_RE = /[ً-ٰٟ]/g;
const TATWEEL_RE = /ـ/g;
const ALEF_RE = /[آأإٱ]/g;
const YEH_RE = /[ىی]/g;
const KAF_RE = /[ک]/g;
// Unicode "Z" category spaces other than ASCII U+0020.
// U+00A0 (NBSP), U+2000–U+200A (various widths), U+202F, U+205F, U+3000, U+FEFF (BOM)
const NBSP_LIKE_RE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g;

export function normalizeArabicText(input: string): string {
  let s = input.normalize('NFKC');
  s = s.replace(DIACRITICS_RE, '');
  s = s.replace(TATWEEL_RE, '');
  s = s.replace(ALEF_RE, 'ا');
  s = s.replace(YEH_RE, 'ي');
  s = s.replace(KAF_RE, 'ك');
  s = s.replace(NBSP_LIKE_RE, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.toLowerCase();
}

/**
 * Canonicalize a column header for Map-key comparison. After Arabic
 * normalization above, also collapses structural punctuation so:
 *
 *   "Contract Start Date"  -> "contractstartdate"
 *   "contract_start_date"  -> "contractstartdate"
 *   "contract-start.date"  -> "contractstartdate"
 *   Arabic example: "تاريخ بدء العقد" -> "تاريخبدءالعقد"
 *
 * Also folds diacritics, tatweel, NBSP, and letter-shape variants via the
 * underlying `normalizeArabicText`.
 */
export function normalizeHeader(input: string): string {
  return normalizeArabicText(input).replace(/[\s_\-./#()*&+,،]+/g, '');
}

/**
 * Build a lookup index from a synonym map. Each canonical key is added with
 * its own normalized form so an exact-match synonym list isn't required.
 */
export function buildHeaderIndex(
  synonymsByCanonical: Record<string, readonly string[]>,
): Map<string, string> {
  const idx = new Map<string, string>();
  for (const [canonical, synonyms] of Object.entries(synonymsByCanonical)) {
    idx.set(normalizeHeader(canonical), canonical);
    for (const s of synonyms) idx.set(normalizeHeader(s), canonical);
  }
  return idx;
}
