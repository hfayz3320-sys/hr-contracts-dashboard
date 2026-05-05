// -*- coding: utf-8 -*-
/**
 * templateClassifier.js
 *
 * Detects which Qiwa contract template a PDF belongs to.
 * Direct JS port of _contract_lab/extractors/template_classifier.py.
 *
 * Templates:
 *   OLD_QIWA_BILINGUAL    — foreign workers, 4–5 pages, Arabic + English side-by-side
 *   NEW_QIWA_UNIFIED      — new Qiwa format, 10 pages, numbered sections
 *   OLD_QIWA_ARABIC_ONLY  — Saudi nationals, 3 pages, Arabic-only (quarantine)
 *   UNKNOWN               — cannot classify
 */

export const TEMPLATES = Object.freeze({
  OLD_QIWA_BILINGUAL:   'OLD_QIWA_BILINGUAL',
  NEW_QIWA_UNIFIED:     'NEW_QIWA_UNIFIED',
  OLD_QIWA_ARABIC_ONLY: 'OLD_QIWA_ARABIC_ONLY',
  UNKNOWN:              'UNKNOWN',
});

/**
 * classify(pages) → template name string
 * pages: array of extracted text strings, one per PDF page.
 */
export function classify(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return TEMPLATES.UNKNOWN;

  const head = String(pages[0] || '');
  const full = pages.map((p) => String(p || '')).join('\n');

  // NEW_QIWA_UNIFIED: distinct heading in English
  if (head.includes('Unified Employment Contract')) return TEMPLATES.NEW_QIWA_UNIFIED;
  if (head.includes('1. Contract Information') && full.includes('Contract number:')) {
    return TEMPLATES.NEW_QIWA_UNIFIED;
  }

  // OLD_QIWA_BILINGUAL: English heading + SECOND PARTY block
  if (head.includes('EMPLOYMENT CONTRACT') && full.includes('SECOND PARTY:')) {
    return TEMPLATES.OLD_QIWA_BILINGUAL;
  }

  // OLD_QIWA_ARABIC_ONLY: no English heading
  if (!head.includes('EMPLOYMENT CONTRACT')) return TEMPLATES.OLD_QIWA_ARABIC_ONLY;

  return TEMPLATES.UNKNOWN;
}
