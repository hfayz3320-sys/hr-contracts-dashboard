// -*- coding: utf-8 -*-
/**
 * personProfileService.js
 *
 * Read-only aggregator for the future Employee Profile screen (Phase 2 UI).
 * Pure read; no mutations. Sorted output ready for display.
 *
 *   getPersonProfile(identityNumber) → {
 *     person:                 { identityNumber, idType, currentName, nationality, ... } | null,
 *     masterSnapshot:         current EmployeeMasterSnapshot | null,
 *     contracts:              [...sorted by startDate desc],
 *     employeeNumberHistory:  [...sorted by firstSeenDate asc],
 *     auditLog:               [...sorted by importTimestamp desc, capped at limit],
 *     flags:                  { hasOpenReviewItems, hasMultipleEmpNos, ... }
 *   }
 */

import { personRepository }                  from '../../storage/repositories/personRepository';
import { employeeMasterSnapshotRepository }  from '../../storage/repositories/employeeMasterSnapshotRepository';
import { contractRecordRepository }          from '../../storage/repositories/contractRecordRepository';
import { employeeNumberHistoryRepository }   from '../../storage/repositories/employeeNumberHistoryRepository';
import { auditLogRepository }                from '../../storage/repositories/auditLogRepository';
import { reviewQueueRepository }             from '../../storage/repositories/reviewQueueRepository';
import { REVIEW_STATUSES }                   from '../../storage/indexedDb/dbSchema';
import { getPersonDisplayName, isVisualOrderArabic } from '../../utils/personDisplayName';

const DEFAULT_AUDIT_LIMIT = 200;

function compareDateDesc(a, b) {
  return String(b || '').localeCompare(String(a || ''));
}
function compareDateAsc(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

export async function getPersonProfile(identityNumber, { auditLimit = DEFAULT_AUDIT_LIMIT } = {}) {
  if (!identityNumber) {
    return {
      person: null, masterSnapshot: null,
      contracts: [], employeeNumberHistory: [], auditLog: [],
      flags: { hasOpenReviewItems: false, hasMultipleEmpNos: false },
    };
  }

  const [person, snapshot, contracts, history, auditAll, reviewAll] = await Promise.all([
    personRepository.getByIdentityNumber(identityNumber),
    employeeMasterSnapshotRepository.getByIdentityNumber(identityNumber),
    contractRecordRepository.listByIdentityNumber(identityNumber),
    employeeNumberHistoryRepository.listByIdentityNumber(identityNumber),
    auditLogRepository.listByIdentityNumber(identityNumber),
    reviewQueueRepository.listAll(),
  ]);

  const sortedContracts = (contracts || []).slice().sort(
    (a, b) => compareDateDesc(a.startDate, b.startDate)
  );
  const sortedHistory = (history || []).slice().sort(
    (a, b) => compareDateAsc(a.firstSeenDate, b.firstSeenDate)
  );
  const sortedAudit = (auditAll || [])
    .slice()
    .sort((a, b) => compareDateDesc(a.importTimestamp, b.importTimestamp))
    .slice(0, auditLimit);

  const openReviewForPerson = (reviewAll || []).filter(
    (r) =>
      r?.extractedData?.v3 &&
      r?.entityId === identityNumber &&
      r?.status === REVIEW_STATUSES.OPEN
  );

  const uniqueEmpNos = new Set(
    sortedHistory.map((h) => String(h.employeeNumber || '').trim()).filter(Boolean)
  );

  const latestContract = sortedContracts[0] || null;
  // Resolve the canonical display name. Person.currentName is preserved as
  // rawExtractedName so the profile can still surface it for audit/reference.
  const displayName       = getPersonDisplayName(person, latestContract);
  const rawExtractedName  = String(person?.currentName || '').trim();
  const nameVisualCorrupted = isVisualOrderArabic(rawExtractedName);

  return {
    person:                person || null,
    masterSnapshot:        snapshot || null,
    contracts:             sortedContracts,
    employeeNumberHistory: sortedHistory,
    auditLog:              sortedAudit,
    flags: {
      hasOpenReviewItems:    openReviewForPerson.length > 0,
      hasMultipleEmpNos:     uniqueEmpNos.size > 1,
      contractCount:         sortedContracts.length,
      empNoCount:            uniqueEmpNos.size,
      nameVisualCorrupted,
      isContractOnly:        !snapshot,
    },
    displayName,
    rawExtractedName,
    openReviewItems:      openReviewForPerson,
  };
}

/**
 * listPersonsSummary(opts?) — light-weight list for an "All Persons" page.
 * Returns: [{ identityNumber, idType, currentName, nationality, contractCount, empNoCount, hasOpenReview }]
 *
 * Phase 1: simple in-memory aggregation. Optimisation deferred until UI exists.
 */
export async function listPersonsSummary() {
  const [persons, contracts, history, reviewAll] = await Promise.all([
    personRepository.listAll(),
    contractRecordRepository.listAll(),
    employeeNumberHistoryRepository.listAll(),
    reviewQueueRepository.listAll(),
  ]);

  const contractsByPerson = new Map();
  for (const c of contracts) {
    const arr = contractsByPerson.get(c.identityNumber) || [];
    arr.push(c);
    contractsByPerson.set(c.identityNumber, arr);
  }
  // Sort each person's contracts by startDate desc so [0] is the latest.
  for (const arr of contractsByPerson.values()) {
    arr.sort((a, b) => compareDateDesc(a.startDate, b.startDate));
  }

  const empNosByPerson = new Map();
  for (const h of history) {
    const set = empNosByPerson.get(h.identityNumber) || new Set();
    if (h.employeeNumber) set.add(String(h.employeeNumber).trim());
    empNosByPerson.set(h.identityNumber, set);
  }

  const openReviewByEntity = new Map();
  for (const r of reviewAll) {
    if (!r?.extractedData?.v3) continue;
    if (r.status !== REVIEW_STATUSES.OPEN) continue;
    if (!r.entityId) continue;
    openReviewByEntity.set(r.entityId, true);
  }

  return persons
    .map((p) => {
      const cs = contractsByPerson.get(p.identityNumber) || [];
      const latest = cs[0] || null;
      return {
        identityNumber:           p.identityNumber,
        idType:                   p.idType,
        // displayName is the resolved name to render in tables / headers.
        // currentName + rawExtractedName preserve the underlying values.
        displayName:              getPersonDisplayName(p, latest),
        currentName:              p.currentName,
        rawExtractedName:         p.currentName,
        nameVisualCorrupted:      isVisualOrderArabic(String(p.currentName || '').trim()),
        latestContractSourcePdf:  latest?.sourcePdf || null,
        nationality:              p.nationality,
        contractCount:            cs.length,
        empNoCount:               (empNosByPerson.get(p.identityNumber) || new Set()).size,
        hasOpenReview:            Boolean(openReviewByEntity.get(p.identityNumber)),
        updatedAt:                p.updatedAt,
      };
    })
    .sort((a, b) => compareDateDesc(a.updatedAt, b.updatedAt));
}
