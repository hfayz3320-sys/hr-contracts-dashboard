import { MATCH_STATUSES } from '../../storage/indexedDb/dbSchema';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function buildMultiMap(rows, selector) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = normalize(selector(row));
    if (!key) {
      return;
    }
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
  });
  return map;
}

function createMatchResult(status, employee, reason, extra = {}) {
  return {
    matchStatus: status,
    matchedEmployeeId: employee?.id || null,
    matchedEmployeeNumber: employee?.EmployeeNumber || '',
    matchReason: reason || '',
    ...extra,
  };
}

export function matchInsuranceRecordToEmployee(record, employees) {
  const list = employees || [];
  const byEmployeeNumber = buildMultiMap(list, (row) => row.EmployeeNumber);
  const byIdentityNumber = buildMultiMap(list, (row) => row.IdentityNumber);

  const staffMatches = byEmployeeNumber.get(normalize(record.StaffNumber)) || [];
  if (staffMatches.length === 1) {
    return createMatchResult(MATCH_STATUSES.MATCHED, staffMatches[0], 'Matched by StaffNumber.');
  }
  if (staffMatches.length > 1) {
    return createMatchResult(
      MATCH_STATUSES.DUPLICATE_MATCH_RISK,
      null,
      'Multiple employees matched StaffNumber.'
    );
  }

  const idMatches = byIdentityNumber.get(normalize(record.IDNo)) || [];
  if (idMatches.length === 1) {
    return createMatchResult(MATCH_STATUSES.MATCHED, idMatches[0], 'Matched by IDNo.');
  }
  if (idMatches.length > 1) {
    return createMatchResult(
      MATCH_STATUSES.DUPLICATE_MATCH_RISK,
      null,
      'Multiple employees matched IDNo.'
    );
  }

  const mainMemberMatches = byIdentityNumber.get(normalize(record.MainMemberID)) || [];
  if (mainMemberMatches.length === 1) {
    return createMatchResult(
      MATCH_STATUSES.NEEDS_REVIEW,
      mainMemberMatches[0],
      'Fallback match by MainMemberID requires review.',
      {
        needsReviewReason: 'Fallback identity match requires manual confirmation.',
      }
    );
  }
  if (mainMemberMatches.length > 1) {
    return createMatchResult(
      MATCH_STATUSES.DUPLICATE_MATCH_RISK,
      null,
      'Multiple employees matched MainMemberID.'
    );
  }

  return createMatchResult(MATCH_STATUSES.UNMATCHED, null, 'No employee match found.');
}

export function applyInsuranceMatching(records, employees) {
  return (records || []).map((record) => ({
    ...record,
    ...matchInsuranceRecordToEmployee(record, employees),
  }));
}
