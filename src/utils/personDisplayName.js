// -*- coding: utf-8 -*-
/**
 * personDisplayName.js
 *
 * Resolves a Person's display name following the identity-model precedence:
 *   1. Person.currentName when readable (Employee Master canonicalName)
 *   2. Latest contract's source-PDF filename basename (clean Arabic / English)
 *      when the canonical name is missing OR visually corrupted (visual-order
 *      RTL extraction artefact)
 *   3. The raw canonical value as-is (or "(name unknown)") when neither is usable
 *
 * The raw extracted PDF name (Person.currentName for ContractOnly persons) is
 * NEVER discarded — it lives on the Person record for audit/reference and is
 * surfaced in the Person Profile as `rawExtractedName`.
 */

// Logical-order base Arabic block.
const ARABIC_LOGICAL_RE       = /[؀-ۿ]/g;
// Arabic Presentation Forms-A (U+FB50–FDFF) and Forms-B (U+FE70–FEFF).
// pdfjs/pdfplumber emit these when extracting RTL text without bidi
// normalisation — the resulting string is unreadable when shown LTR.
const ARABIC_PRESENTATION_RE  = /[ﭐ-﷿ﹰ-﻿]/g;

/**
 * Returns true when `text` looks like the visual-order RTL extraction
 * artefact: it contains more Arabic *presentation form* glyphs than
 * *logical* base-Arabic letters.
 */
export function isVisualOrderArabic(text) {
  if (!text) return false;
  const s = String(text);
  const presentation = (s.match(ARABIC_PRESENTATION_RE) || []).length;
  const logical      = (s.match(ARABIC_LOGICAL_RE)      || []).length;
  return presentation > 0 && presentation > logical;
}

/**
 * A name is considered "readable" if it has at least 2 chars and is NOT
 * predominantly composed of Arabic presentation forms.
 */
export function looksReadableName(text) {
  if (!text) return false;
  const trimmed = String(text).trim();
  if (trimmed.length < 2) return false;
  return !isVisualOrderArabic(trimmed);
}

/**
 * Resolves the best display name for a Person.
 *
 * @param {object} person          Person record (or any object with currentName)
 * @param {object} [latestContract] Most-recent ContractRecord for the person, if any
 * @returns {string} display-ready name (never empty — falls back to "(name unknown)")
 */
export function getPersonDisplayName(person, latestContract = null) {
  const canonical = String(person?.currentName || '').trim();

  // 1. Canonical EM name is readable → use it
  if (canonical && looksReadableName(canonical)) return canonical;

  // 2. ContractOnly + visually-corrupted Arabic → use the source-PDF basename
  //    (filenames retain logical Arabic ordering and render correctly)
  const sourcePdf = latestContract?.sourcePdf
    || latestContract?.SourceFile
    || latestContract?.rawExtractionJson?.SourceFile
    || '';
  if (sourcePdf) {
    const base = String(sourcePdf).replace(/\.pdf$/i, '').trim();
    if (base && looksReadableName(base)) return base;
  }

  // 3. Fallback — surface what we have so the row is never blank
  return canonical || '(name unknown)';
}
