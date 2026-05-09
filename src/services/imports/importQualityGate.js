// -*- coding: utf-8 -*-
/**
 * importQualityGate.js
 *
 * Pure-computation summary used as a "quality gate" in the UI and validator
 * BEFORE commit. Surfaces the counts the operator must understand before
 * pressing Commit:
 *
 *   completeContracts        ContractRecords with ExtractionStatus=COMPLETE
 *   partialContracts         ContractRecords with PARTIAL_REVIEW_REQUIRED
 *   missingIdentity          rows/contracts without a valid IdentityNumber
 *   contractOnlyPersons      contracts whose IdentityNumber has no EM match
 *   duplicateIdentity        IdentityNumbers seen >1× in the same import
 *   empNoDivergence          persons whose contract EmpNo differs from EM EmpNo
 *
 * This is informational — it does NOT mutate the previews. The caller
 * decides whether the counts are acceptable.
 */

/**
 * Build the gate summary from the EM and PDF previews produced by
 * buildEmployeeMasterImportPreview() and buildContractImportPreview().
 *
 * Either preview can be null when only one source is being imported.
 */
export function buildImportQualityGate({ emPreview = null, pdfPreview = null } = {}) {
  const em  = emPreview?.summary  || {};
  const pdf = pdfPreview?.summary || {};

  // Complete vs partial — a contract is COMPLETE only when extraction did
  // not flag PARTIAL_REVIEW_REQUIRED. The PDF preview already excludes
  // extractionError, so partial = the rows whose ExtractionStatus is partial.
  const completeContracts = countByExtractionStatus(pdfPreview, 'COMPLETE');
  const partialContracts  = countByExtractionStatus(pdfPreview, 'PARTIAL_REVIEW_REQUIRED');

  // Duplicate IdentityNumber within the same import (file-level dup check)
  // The EM service stores duplicates inside `needsReview` with a "appears Nx" reason.
  const duplicateIdentityEm  = (emPreview?.needsReview  || []).filter((r) => /appears \d+/.test(r.reason || '')).length;
  const duplicateIdentityPdf = (pdfPreview?.needsReview || []).filter((r) => /appears \d+/.test(r.reason || '')).length;

  // EmpNo divergence = empNoHistory candidates with a non-empty note
  const empNoDivergence = (pdfPreview?.empNoHistoryCandidates || [])
    .filter((c) => c.note && !c.firstSeen).length
    + (emPreview?.empNoHistoryCandidates || [])
    .filter((c) => !c.firstSeen).length;

  const summary = {
    completeContracts,
    partialContracts,
    missingIdentity: (em.missingIdentity || 0) + (pdf.missingIdentity || 0),
    invalidIdentity: (em.invalidIdentity || 0) + (pdf.invalidIdentity || 0),
    contractOnlyPersons:    pdf.newContractOnlyPerson || 0,
    contractsForExisting:   pdf.newContractForExistingPerson || 0,
    duplicateContracts:     pdf.duplicateContract || 0,
    duplicateIdentity:      duplicateIdentityEm + duplicateIdentityPdf,
    empNoDivergence,
    extractionErrors:       pdf.extractionError || 0,
    // EM-side
    newPersons:             em.new || 0,
    updatedPersons:         em.updated || 0,
    unchangedPersons:       em.unchanged || 0,
    totalEmRows:            em.total || 0,
    totalContractsExtracted: pdf.total || 0,
  };

  // Risk classification
  const blockers = [];
  if (summary.extractionErrors > 0) {
    blockers.push(`${summary.extractionErrors} contract(s) failed extraction`);
  }
  // duplicateIdentity is always block-worthy: an operator should resolve before commit
  if (summary.duplicateIdentity > 0) {
    blockers.push(`${summary.duplicateIdentity} duplicate IdentityNumber row(s) need resolution`);
  }

  const warnings = [];
  if (summary.missingIdentity > 0)   warnings.push(`${summary.missingIdentity} row(s) without IdentityNumber → review queue`);
  if (summary.invalidIdentity > 0)   warnings.push(`${summary.invalidIdentity} row(s) with invalid IdentityNumber → review queue`);
  if (summary.contractOnlyPersons > 0)
    warnings.push(`${summary.contractOnlyPersons} contract(s) have no Employee Master match (ContractOnly persons)`);
  if (summary.partialContracts > 0)
    warnings.push(`${summary.partialContracts} contract(s) parsed as PARTIAL — review needed`);
  if (summary.empNoDivergence > 0)
    warnings.push(`${summary.empNoDivergence} person(s) have a different EmployeeNumber on contract vs EM (history record)`);

  return {
    summary,
    blockers,
    warnings,
    safeToCommit: blockers.length === 0,
  };
}

function countByExtractionStatus(pdfPreview, status) {
  if (!pdfPreview) return 0;
  let n = 0;
  for (const arr of [pdfPreview.newContractsForExistingPersons, pdfPreview.newContractOnlyPersons]) {
    for (const item of arr || []) {
      if ((item.contractRecord?.extractionStatus || item.sourceContract?.ExtractionStatus) === status) n += 1;
    }
  }
  return n;
}
