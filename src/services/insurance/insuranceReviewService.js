function normalize(value) {
  return String(value || '').trim();
}

function distinctCount(rows, selector) {
  return new Set(
    (rows || [])
      .map(selector)
      .map((value) => normalize(value))
      .filter(Boolean)
  ).size;
}

function isRejected(record) {
  return Boolean(
    normalize(record.MemberRejectReason) ||
      /reject|failed|inactive/i.test(
        `${normalize(record.MemberCCHIStatus)} ${normalize(record.CCHIPolicyStatus)}`
      )
  );
}

function isDependent(record) {
  return normalize(record.memberType || record.Relationship).toLowerCase() !== 'main member' &&
    normalize(record.Relationship).toLowerCase() !== 'employee';
}

export function summarizeInsuranceRecords(records) {
  const list = records || [];
  const primaryMembers = list.filter((record) => !isDependent(record));
  const dependents = list.filter((record) => isDependent(record));

  const classGroups = Array.from(
    list.reduce((map, record) => {
      const key = normalize(record.ClassDescription) || 'Unclassified';
      if (!map.has(key)) {
        map.set(key, {
          classDescription: key,
          employeeCount: 0,
          dependentCount: 0,
          totalLives: 0,
        });
      }
      const current = map.get(key);
      current.totalLives += 1;
      if (isDependent(record)) {
        current.dependentCount += 1;
      } else {
        current.employeeCount += 1;
      }
      return map;
    }, new Map()).values()
  ).sort((left, right) => left.classDescription.localeCompare(right.classDescription));

  return {
    totalInsuredEmployees: primaryMembers.length,
    totalInsuredDependents: dependents.length,
    totalCoveredLives: list.length,
    unmatched: list.filter((record) => record.matchStatus === 'Unmatched').length,
    needsReview: list.filter((record) => record.matchStatus === 'Needs Review').length,
    rejected: list.filter((record) => isRejected(record)).length,
    totalInsuranceClasses: distinctCount(list, (record) => record.ClassDescription),
    classGroups,
  };
}
