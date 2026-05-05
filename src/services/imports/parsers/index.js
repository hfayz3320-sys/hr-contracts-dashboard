// -*- coding: utf-8 -*-
/**
 * parsers/index.js
 *
 * Dispatcher — mirrors _contract_lab/extractors/extract_v2.py.
 * Given the per-page text array of a PDF, classifies the template and routes
 * to the matching parser.
 *
 * Phase 1: parsers throw NotImplementedYet — dispatcher is wired up so the
 * import service can call it once parsers are ported in Phase 2.
 *
 * Output shape (when implemented):
 *   {
 *     SourceFile, ContractVersion, ExtractionStatus,
 *     NeedsArabicReview, MatchedBy, MissingCriticalFields,
 *     IdentityNumber, ...,   // see individual parser docs for full list
 *   }
 *
 * Errors are caught and converted to error rows so a single bad PDF doesn't
 * break a batch import. Pattern matches Python extract_v2.process_pdf().
 */

import { TEMPLATES, classify }      from './templateClassifier.js';
import { parse as parseBilingual }  from './parserOldBilingual.js';
import { parse as parseUnified }    from './parserNewQiwaUnified.js';
import { parse as parseArabicStub } from './parserOldArabicOnlyStub.js';
import { extractPagesText }         from './pdfTextExtractor.js';

export { TEMPLATES, classify, extractPagesText };

export function processExtractedPages(pages, sourceFile) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return {
      SourceFile:           sourceFile,
      ContractVersion:      TEMPLATES.UNKNOWN,
      ExtractionStatus:     'ERROR',
      MissingCriticalFields:'ALL',
      NeedsArabicReview:    true,
      Error:                'No pages extracted',
    };
  }

  const template = classify(pages);

  try {
    if (template === TEMPLATES.OLD_QIWA_BILINGUAL)   return parseBilingual(pages, sourceFile);
    if (template === TEMPLATES.NEW_QIWA_UNIFIED)     return parseUnified(pages, sourceFile);
    if (template === TEMPLATES.OLD_QIWA_ARABIC_ONLY) return parseArabicStub(pages, sourceFile);
    return {
      SourceFile:            sourceFile,
      ContractVersion:       TEMPLATES.UNKNOWN,
      ExtractionStatus:      'FAILED_UNKNOWN_TEMPLATE',
      NeedsArabicReview:     true,
      MissingCriticalFields: 'ALL',
    };
  } catch (err) {
    return {
      SourceFile:            sourceFile,
      ContractVersion:       template,
      ExtractionStatus:      'ERROR',
      NeedsArabicReview:     true,
      MissingCriticalFields: 'ALL',
      Error:                 err?.message || String(err),
    };
  }
}

/**
 * End-to-end: PDF (File/Blob/ArrayBuffer) → extracted contract record.
 * Used by the contract import pipeline + the validation script.
 */
export async function extractContractFromPdf(input, sourceFile) {
  let pages;
  try {
    const out = await extractPagesText(input);
    pages = out.pages;
  } catch (err) {
    return {
      SourceFile:            sourceFile,
      ContractVersion:       TEMPLATES.UNKNOWN,
      ExtractionStatus:      'ERROR',
      NeedsArabicReview:     true,
      MissingCriticalFields: 'ALL',
      Error:                 `pdfjs failed: ${err?.message || err}`,
    };
  }
  return processExtractedPages(pages, sourceFile);
}
