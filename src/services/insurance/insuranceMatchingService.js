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

  // Identity-centric order (per identity model rules):
  //   1. IDNo            → IdentityNumber  (primary)
  //   2. MainMemberID    → IdentityNumber  (dependents link to main employee)
  //   3. StaffNumber     → EmployeeNumber  (fallback only — EmpNo can change
  //                                          across renewals so it's not safe
  //                                          as the primary key)

  // 1. IDNo → IdentityNumber
  const idMatches = byIdentityNumber.get(normalize(record.IDNo)) || [];
  if (idMatches.length === 1) {
    return createMatchResult(MATCH_STATUSES.MATCHED, idMatches[0], 'Matched by IDNo (IdentityNumber).');
  }
  if (idMatches.length > 1) {
    return createMatchResult(
      MATCH_STATUSES.DUPLICATE_MATCH_RISK,
      null,
      'Multiple employees matched IDNo.'
    );
  }

  // 2. MainMemberID → IdentityNumber (dependents)
  const mainMemberMatches = byIdentityNumber.get(normalize(record.MainMemberID)) || [];
  if (mainMemberMatches.length === 1) {
    // Dependent linking to the main employee — direct match (not review).
    const isDependent = String(record.Relationship || '').trim().toLowerCase() !== ''
      && String(record.Relationship || '').trim().toLowerCase() !== 'employee'
      && String(record.Relationship || '').trim().toLowerCase() !== 'main';
    return createMatchResult(
      isDependent ? MATCH_STATUSES.MATCHED : MATCH_STATUSES.NEEDS_REVIEW,
      mainMemberMatches[0],
      isDependent
        ? 'Dependent linked to main employee via MainMemberID.'
        : 'Fallback match by MainMemberID requires review.',
      isDependent ? {} : { needsReviewReason: 'Fallback identity match requires manual confirmation.' }
    );
  }
  if (mainMemberMatches.length > 1) {
    return createMatchResult(
      MATCH_STATUSES.DUPLICATE_MATCH_RISK,
      null,
      'Multiple employees matched MainMemberID.'
    );
  }

  // 3. StaffNumber → EmployeeNumber (fallback only)
  const staffMatches = byEmployeeNumber.get(normalize(record.StaffNumber)) || [];
  if (staffMatches.length === 1) {
    return createMatchResult(
      MATCH_STATUSES.NEEDS_REVIEW,
      staffMatches[0],
      'Fallback match by StaffNumber requires review (EmpNo is not a stable key).',
      { needsReviewReason: 'StaffNumber matched but IDNo did not — verify identity.' }
    );
  }
  if (staffMatches.length > 1) {
    return createMatchResult(
      MATCH_STATUSES.DUPLICATE_MATCH_RISK,
      null,
      'Multiple employees matched StaffNumber.'
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
