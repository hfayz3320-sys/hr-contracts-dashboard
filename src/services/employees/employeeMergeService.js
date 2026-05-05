import { parseDateToISO } from '../../utils/cleaning';
import {
  areComparableContractsEqual,
  normalizeContractValue,
  normalizeContractVersion,
} from '../../utils/contracts';
import { expectedSchema } from '../../utils/schema';

const MASTER_PROTECTED_FIELDS = ['EmployeeNumber', 'IdentityNumber', 'Name', 'DateOfBirth'];

function isMeaningfulValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function normalizeIdentifier(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeDateKey(value) {
  return parseDateToISO(value || '') || '';
}

function getEmployeeNumberKey(record) {
  return normalizeIdentifier(record?.EmployeeNumber);
}

function getIdentityNumberKey(record) {
  return normalizeIdentifier(record?.IdentityNumber);
}

function getNameDobKey(record) {
  const nameKey = normalizeName(record?.Name);
  const dobKey = normalizeDateKey(record?.DateOfBirth);
  if (!nameKey || !dobKey) {
    return '';
  }
  return `${nameKey}::${dobKey}`;
}

function createIndex(entries, selector) {
  const map = new Map();
  (entries || []).forEach((entry) => {
    const key = selector(entry);
    if (!key) {
      return;
    }

    const group = map.get(key) || [];
    group.push(entry);
    map.set(key, group);
  });
  return map;
}

function countMeaningfulFields(record) {
  return [...expectedSchema, 'EmploymentStatus'].reduce(
    (count, field) => count + (isMeaningfulValue(record?.[field]) ? 1 : 0),
    0
  );
}

function pickCanonicalEmployee(group, contracts = []) {
  const contractByEmployeeId = new Map();
  (contracts || []).forEach((contract) => {
    const current = contractByEmployeeId.get(contract.employeeId);
    if (!current) {
      contractByEmployeeId.set(contract.employeeId, contract);
      return;
    }

    const currentRank =
      (current.IsCurrentVersion === false ? 0 : 1) * 1000 + normalizeContractVersion(current.ContractVersion);
    const nextRank =
      (contract.IsCurrentVersion === false ? 0 : 1) * 1000 + normalizeContractVersion(contract.ContractVersion);

    if (nextRank > currentRank) {
      contractByEmployeeId.set(contract.employeeId, contract);
    }
  });

  return [...group].sort((left, right) => {
    const leftContract = contractByEmployeeId.get(left.id);
    const rightContract = contractByEmployeeId.get(right.id);
    const leftCurrent = leftContract?.IsCurrentVersion === false ? 0 : 1;
    const rightCurrent = rightContract?.IsCurrentVersion === false ? 0 : 1;

    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }

    const leftCompleteness = countMeaningfulFields(left);
    const rightCompleteness = countMeaningfulFields(right);
    if (leftCompleteness !== rightCompleteness) {
      return rightCompleteness - leftCompleteness;
    }

    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    return leftCreated - rightCreated;
  })[0];
}

function valuesConflict(left, right, selector, normalizer = normalizeIdentifier) {
  const leftValue = normalizer(selector(left));
  const rightValue = normalizer(selector(right));
  return Boolean(leftValue && rightValue && leftValue !== rightValue);
}

function canSafelyMergeEmployees(left, right) {
  const sameEmployeeNumber =
    getEmployeeNumberKey(left) && getEmployeeNumberKey(left) === getEmployeeNumberKey(right);
  const sameIdentity =
    getIdentityNumberKey(left) && getIdentityNumberKey(left) === getIdentityNumberKey(right);
  const sameNameDob = getNameDobKey(left) && getNameDobKey(left) === getNameDobKey(right);

  if (!sameEmployeeNumber && !sameIdentity && !sameNameDob) {
    return false;
  }

  if (valuesConflict(left, right, (record) => record.EmployeeNumber)) {
    return false;
  }

  if (valuesConflict(left, right, (record) => record.IdentityNumber)) {
    return false;
  }

  if (
    !sameEmployeeNumber &&
    !sameIdentity &&
    valuesConflict(left, right, (record) => record.Name, normalizeName)
  ) {
    return false;
  }

  if (
    !sameEmployeeNumber &&
    !sameIdentity &&
    valuesConflict(left, right, (record) => record.DateOfBirth, normalizeDateKey)
  ) {
    return false;
  }

  return true;
}

function mergeFieldValue(field, existingValue, incomingValue, protectedFields) {
  if (!isMeaningfulValue(incomingValue)) {
    return existingValue;
  }

  if (!protectedFields.includes(field) || !isMeaningfulValue(existingValue)) {
    return incomingValue;
  }

  const existingNormalized =
    field === 'Name'
      ? normalizeName(existingValue)
      : field === 'DateOfBirth'
        ? normalizeDateKey(existingValue)
        : normalizeIdentifier(existingValue);
  const incomingNormalized =
    field === 'Name'
      ? normalizeName(incomingValue)
      : field === 'DateOfBirth'
        ? normalizeDateKey(incomingValue)
        : normalizeIdentifier(incomingValue);

  return existingNormalized === incomingNormalized ? incomingValue : existingValue;
}

export function mergeEmployeeMasterRecord(existing = {}, incoming = {}, overrides = {}) {
  const protectedFields = overrides.protectedFields || MASTER_PROTECTED_FIELDS;
  const merged = { ...existing };

  Object.keys(incoming || {}).forEach((field) => {
    if (field === 'id' || field === 'createdAt' || field === 'updatedAt') {
      return;
    }
    merged[field] = mergeFieldValue(field, merged[field], incoming[field], protectedFields);
  });

  return {
    ...merged,
    ...overrides,
    id: overrides.id || existing.id || incoming.id,
    createdAt: existing.createdAt || incoming.createdAt,
  };
}

export function mergeContractSnapshot(existing = {}, incoming = {}, overrides = {}) {
  const merged = { ...existing };

  Object.keys(incoming || {}).forEach((field) => {
    if (field === 'id' || field === 'employeeId' || field === 'createdAt' || field === 'updatedAt') {
      return;
    }

    if (isMeaningfulValue(incoming[field])) {
      merged[field] = incoming[field];
    }
  });

  return {
    ...merged,
    ...overrides,
    id: overrides.id || existing.id || incoming.id,
    employeeId: overrides.employeeId || existing.employeeId || incoming.employeeId || null,
    createdAt: existing.createdAt || incoming.createdAt,
  };
}

function selectUniqueMatch(matches, reason, selector = (record) => record.id) {
  const unique = [];
  const seen = new Set();

  (matches || []).forEach((record) => {
    const key = selector(record);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(record);
  });

  return {
    reason,
    matches: unique,
    employee: unique.length === 1 ? unique[0] : null,
    isAmbiguous: unique.length > 1,
  };
}

export function findEmployeeMasterMatch(candidate, employees = []) {
  const employeeNumber = getEmployeeNumberKey(candidate);
  if (employeeNumber) {
    const result = selectUniqueMatch(
      employees.filter((employee) => getEmployeeNumberKey(employee) === employeeNumber),
      'EmployeeNumber'
    );
    if (result.employee || result.isAmbiguous) {
      return result;
    }
  }

  const identityNumber = getIdentityNumberKey(candidate);
  if (identityNumber) {
    const result = selectUniqueMatch(
      employees.filter((employee) => getIdentityNumberKey(employee) === identityNumber),
      'IdentityNumber'
    );
    if (result.employee || result.isAmbiguous) {
      return result;
    }
  }

  const nameDobKey = getNameDobKey(candidate);
  if (nameDobKey) {
    const result = selectUniqueMatch(
      employees.filter((employee) => getNameDobKey(employee) === nameDobKey),
      'FullName + DOB'
    );
    if (result.employee || result.isAmbiguous) {
      return result;
    }
  }

  return {
    reason: '',
    matches: [],
    employee: null,
    isAmbiguous: false,
  };
}

function buildExactContractKey(contract) {
  return [
    contract.employeeId || '',
    normalizeContractValue(contract.ContractNumber),
    normalizeDateKey(contract.StartDate),
    normalizeDateKey(contract.EndDate),
  ].join('::');
}

function pickCanonicalContract(group) {
  return [...group].sort((left, right) => {
    const leftCurrent = left.IsCurrentVersion === false ? 0 : 1;
    const rightCurrent = right.IsCurrentVersion === false ? 0 : 1;
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }

    const leftVersion = normalizeContractVersion(left.ContractVersion);
    const rightVersion = normalizeContractVersion(right.ContractVersion);
    if (leftVersion !== rightVersion) {
      return rightVersion - leftVersion;
    }

    const leftCreated = new Date(left.createdAt || 0).getTime();
    const rightCreated = new Date(right.createdAt || 0).getTime();
    return leftCreated - rightCreated;
  })[0];
}

function mergeDuplicateContracts(contracts = []) {
  const contractGroups = new Map();
  (contracts || []).forEach((contract) => {
    const groupKey = buildExactContractKey(contract);
    const group = contractGroups.get(groupKey) || [];
    group.push(contract);
    contractGroups.set(groupKey, group);
  });

  const mergedContracts = [];
  let changed = false;

  contractGroups.forEach((group) => {
    const pending = [...group];

    while (pending.length) {
      const seed = pending.shift();
      const duplicates = [seed];

      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const candidate = pending[index];
        const sameSourceHash =
          normalizeContractValue(seed.SourceFileHash) &&
          normalizeContractValue(seed.SourceFileHash) === normalizeContractValue(candidate.SourceFileHash);
        const sameSnapshot = areComparableContractsEqual(seed, candidate);

        if (sameSourceHash || sameSnapshot) {
          duplicates.push(candidate);
          pending.splice(index, 1);
        }
      }

      if (duplicates.length === 1) {
        mergedContracts.push(seed);
        continue;
      }

      changed = true;
      const canonical = pickCanonicalContract(duplicates);
      const merged = duplicates.reduce(
        (current, contract) =>
          mergeContractSnapshot(current, contract, {
            id: canonical.id,
            employeeId: canonical.employeeId,
          }),
        canonical
      );

      mergedContracts.push(merged);
    }
  });

  return {
    contracts: mergedContracts,
    changed,
  };
}

function pickCurrentContract(contracts = []) {
  return [...contracts].sort((left, right) => {
    const leftCurrent = left.IsCurrentVersion === false ? 0 : 1;
    const rightCurrent = right.IsCurrentVersion === false ? 0 : 1;
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }

    const leftVersion = normalizeContractVersion(left.ContractVersion);
    const rightVersion = normalizeContractVersion(right.ContractVersion);
    if (leftVersion !== rightVersion) {
      return rightVersion - leftVersion;
    }

    const leftEnd = new Date(left.EndDate || 0).getTime();
    const rightEnd = new Date(right.EndDate || 0).getTime();
    return rightEnd - leftEnd;
  })[0] || null;
}

export function deduplicateEmployeeContractData(employees = [], contracts = []) {
  if (!employees.length) {
    return {
      employees,
      contracts,
      changed: false,
      mergedEmployeeIds: [],
    };
  }

  const byEmployeeNumber = createIndex(employees, getEmployeeNumberKey);
  const byIdentityNumber = createIndex(employees, getIdentityNumberKey);
  const byNameDob = createIndex(employees, getNameDobKey);
  const candidates = new Map();

  [byEmployeeNumber, byIdentityNumber, byNameDob].forEach((index) => {
    index.forEach((group) => {
      if (group.length < 2) {
        return;
      }

      group.forEach((employee) => {
        const current = candidates.get(employee.id) || [];
        candidates.set(
          employee.id,
          Array.from(new Set([...current, ...group.map((item) => item.id)]))
        );
      });
    });
  });

  const visited = new Set();
  const mergedEmployeeIds = [];
  const nextEmployees = [...employees];
  const nextContracts = [...contracts];

  for (const employee of employees) {
    if (visited.has(employee.id)) {
      continue;
    }

    const queue = [employee.id];
    const groupIds = new Set();

    while (queue.length) {
      const currentId = queue.shift();
      if (groupIds.has(currentId)) {
        continue;
      }
      groupIds.add(currentId);
      (candidates.get(currentId) || []).forEach((candidateId) => {
        if (!groupIds.has(candidateId)) {
          queue.push(candidateId);
        }
      });
    }

    groupIds.forEach((id) => visited.add(id));
    if (groupIds.size < 2) {
      continue;
    }

    const group = nextEmployees.filter((item) => groupIds.has(item.id));
    const safeGroup = group.filter((item) =>
      group.every((other) => item.id === other.id || canSafelyMergeEmployees(item, other))
    );

    if (safeGroup.length < 2) {
      continue;
    }

    const canonical = pickCanonicalEmployee(safeGroup, nextContracts);
    const duplicateIds = safeGroup.filter((item) => item.id !== canonical.id).map((item) => item.id);
    if (!duplicateIds.length) {
      continue;
    }

    mergedEmployeeIds.push(...duplicateIds);
    const mergedEmployee = safeGroup.reduce(
      (current, item) =>
        mergeEmployeeMasterRecord(current, item, {
          id: canonical.id,
          createdAt: canonical.createdAt || item.createdAt,
        }),
      canonical
    );

    for (let index = 0; index < nextContracts.length; index += 1) {
      if (duplicateIds.includes(nextContracts[index].employeeId)) {
        nextContracts[index] = {
          ...nextContracts[index],
          employeeId: canonical.id,
        };
      }
    }

    const employeeIndex = nextEmployees.findIndex((item) => item.id === canonical.id);
    if (employeeIndex >= 0) {
      nextEmployees[employeeIndex] = mergedEmployee;
    }

    for (const duplicateId of duplicateIds) {
      const duplicateIndex = nextEmployees.findIndex((item) => item.id === duplicateId);
      if (duplicateIndex >= 0) {
        nextEmployees.splice(duplicateIndex, 1);
      }
    }
  }

  const { contracts: mergedContracts, changed: contractsChanged } = mergeDuplicateContracts(nextContracts);
  const contractsByEmployeeId = new Map();

  mergedContracts.forEach((contract) => {
    const group = contractsByEmployeeId.get(contract.employeeId) || [];
    group.push(contract);
    contractsByEmployeeId.set(contract.employeeId, group);
  });

  const hydratedEmployees = nextEmployees.map((employee) => {
    const currentContract = pickCurrentContract(contractsByEmployeeId.get(employee.id) || []);
    if (!currentContract) {
      return employee;
    }

    return mergeEmployeeMasterRecord(employee, currentContract, {
      id: employee.id,
      contractId: currentContract.id,
      contractPdfId: currentContract.pdfFileId || employee.contractPdfId || null,
      ContractVersion: currentContract.ContractVersion,
      IsCurrentVersion: currentContract.IsCurrentVersion,
      ContractGroupKey: currentContract.ContractGroupKey || employee.ContractGroupKey || '',
      ParentContractKey: currentContract.ParentContractKey || employee.ParentContractKey || '',
      SourceFileHash: currentContract.SourceFileHash || employee.SourceFileHash || '',
    });
  });

  return {
    employees: hydratedEmployees,
    contracts: mergedContracts,
    changed: mergedEmployeeIds.length > 0 || contractsChanged,
    mergedEmployeeIds: Array.from(new Set(mergedEmployeeIds)),
  };
}

export function resolveContractForEmployee(row, employee, contracts = []) {
  if (!employee) {
    return null;
  }

  const contractNumber = normalizeContractValue(row?.ContractNumber);
  if (!contractNumber) {
    return null;
  }

  const matchingContracts = (contracts || []).filter(
    (contract) =>
      contract.employeeId === employee.id &&
      normalizeContractValue(contract.ContractNumber) === contractNumber
  );

  if (!matchingContracts.length) {
    return null;
  }

  if (row?.contractId) {
    const explicitMatch = matchingContracts.find((contract) => contract.id === row.contractId);
    if (explicitMatch) {
      return explicitMatch;
    }
  }

  const exactComparableMatch = matchingContracts.find((contract) =>
    areComparableContractsEqual(row, mergeEmployeeMasterRecord(employee, contract))
  );

  if (exactComparableMatch) {
    return exactComparableMatch;
  }

  return pickCurrentContract(matchingContracts);
}
