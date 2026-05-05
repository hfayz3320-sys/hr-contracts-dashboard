import {
  areComparableContractsEqual,
  buildContractGroupKey,
  normalizeContractValue,
  normalizeContractVersion,
} from '../../utils/contracts';
import { findEmployeeMasterMatch } from '../employees/employeeMergeService';

function normalizeDateValue(value) {
  return String(value || '').trim();
}

function buildIdentityKey(record, fallbackEmployeeNumber = '') {
  return [
    normalizeContractValue(record?.EmployeeNumber || fallbackEmployeeNumber),
    normalizeContractValue(record?.ContractNumber),
    normalizeDateValue(record?.StartDate),
    normalizeDateValue(record?.EndDate),
  ].join('::');
}

function toMatch(record, reasons, type, extra = {}) {
  return {
    id: record.id || record.contractId || record.pdfId || crypto.randomUUID(),
    employeeId: record.employeeId || record.id || null,
    contractId: record.contractId || record.id || null,
    employeeNumber: record.EmployeeNumber || record.employeeNumber || record.StaffNumber || '',
    contractNumber: record.ContractNumber || record.contractNumber || '',
    contractVersion: normalizeContractVersion(record.ContractVersion || record.contractVersion),
    name: record.Name || record.name || record.fileName || '',
    reasons,
    type,
    ...extra,
  };
}

function findSourceFileHashMatches(candidate, existingEmployees, existingContracts, existingPdfRecords) {
  const sourceFileHash = normalizeContractValue(candidate.SourceFileHash);
  if (!sourceFileHash) {
    return [];
  }

  const employeeMatches = (existingEmployees || [])
    .filter((row) => normalizeContractValue(row.SourceFileHash) === sourceFileHash)
    .map((row) => toMatch(row, ['Source file hash'], 'exact_duplicate'));

  const contractMatches = (existingContracts || [])
    .filter((row) => normalizeContractValue(row.SourceFileHash) === sourceFileHash)
    .map((row) => toMatch(row, ['Source file hash'], 'exact_duplicate'));

  const pdfMatches = (existingPdfRecords || [])
    .filter((row) => normalizeContractValue(row.sourceFileHash) === sourceFileHash)
    .map((row) =>
      toMatch(
        {
          id: row.id,
          contractNumber: row.contractNumber,
          employeeNumber: row.employeeNumber,
          fileName: row.fileName,
        },
        ['Source file hash'],
        'exact_duplicate'
      )
    );

  const seen = new Set();
  return [...employeeMatches, ...contractMatches, ...pdfMatches].filter((match) => {
    const key = `${match.type}:${match.contractId || ''}:${match.employeeId || ''}:${match.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getCurrentGroupTarget(groupRows) {
  const sorted = [...groupRows].sort((left, right) => {
    const leftCurrent = left.IsCurrentVersion === false ? 0 : 1;
    const rightCurrent = right.IsCurrentVersion === false ? 0 : 1;
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }

    return normalizeContractVersion(right.ContractVersion) - normalizeContractVersion(left.ContractVersion);
  });

  const target = sorted[0] || null;
  if (!target) {
    return null;
  }

  return {
    employeeId: target.employeeId || null,
    contractId: target.id || null,
    contractVersion: normalizeContractVersion(target.ContractVersion),
  };
}

export function detectEmployeeDuplicateRisk(
  candidate,
  {
    existingEmployees = [],
    existingContracts = [],
    existingPdfRecords = [],
  } = {}
) {
  const contractNumber = normalizeContractValue(candidate.ContractNumber);
  const employeeMatch = findEmployeeMasterMatch(candidate, existingEmployees);
  const matchedEmployee = employeeMatch.employee;
  const effectiveEmployeeNumber = matchedEmployee?.EmployeeNumber || candidate.EmployeeNumber || '';
  const identityKey = buildIdentityKey(candidate, effectiveEmployeeNumber);
  const contractGroupKey = buildContractGroupKey(candidate);

  const sourceHashMatches = findSourceFileHashMatches(
    candidate,
    existingEmployees,
    existingContracts,
    existingPdfRecords
  );

  if (sourceHashMatches.length) {
    return {
      hasDuplicateRisk: true,
      hasBlockingDuplicate: true,
      requiresDecision: false,
      recommendedDecision: '',
      matches: sourceHashMatches,
      contractGroupKey,
      nextVersion: 1,
      employeeMatch,
    };
  }

  if (employeeMatch.isAmbiguous) {
    return {
      hasDuplicateRisk: true,
      hasBlockingDuplicate: false,
      requiresDecision: false,
      recommendedDecision: '',
      matches: employeeMatch.matches.map((record) =>
        toMatch(record, [`Ambiguous employee match by ${employeeMatch.reason}`], 'employee_match_review')
      ),
      contractGroupKey,
      nextVersion: 1,
      employeeMatch,
    };
  }

  if (!contractNumber || !matchedEmployee) {
    return {
      hasDuplicateRisk: false,
      hasBlockingDuplicate: false,
      requiresDecision: false,
      recommendedDecision: '',
      matches: [],
      contractGroupKey,
      nextVersion: 1,
      employeeMatch,
    };
  }

  const sameGroupRows = (existingContracts || []).filter(
    (row) =>
      (row.employeeId === matchedEmployee.id ||
        (!row.employeeId &&
          normalizeContractValue(row.EmployeeNumber) === normalizeContractValue(effectiveEmployeeNumber))) &&
      normalizeContractValue(row.ContractNumber) === contractNumber
  );

  if (!sameGroupRows.length) {
    return {
      hasDuplicateRisk: false,
      hasBlockingDuplicate: false,
      requiresDecision: false,
      recommendedDecision: '',
      matches: [],
      contractGroupKey,
      nextVersion: 1,
      employeeMatch,
    };
  }

  const exactIdentityRows = sameGroupRows.filter(
    (row) => buildIdentityKey(row, effectiveEmployeeNumber) === identityKey
  );
  const exactComparableRows = exactIdentityRows.filter((row) => areComparableContractsEqual(candidate, row));

  if (exactComparableRows.length) {
    return {
      hasDuplicateRisk: true,
      hasBlockingDuplicate: true,
      requiresDecision: false,
      recommendedDecision: '',
      matches: exactComparableRows.map((row) =>
        toMatch(row, ['Exact contract identity'], 'exact_duplicate')
      ),
      contractGroupKey,
      nextVersion:
        Math.max(
          1,
          ...sameGroupRows.map((row) => normalizeContractVersion(row.ContractVersion))
        ) + 1,
      employeeMatch,
    };
  }

  const target = getCurrentGroupTarget(sameGroupRows);
  const nextVersion =
    Math.max(1, ...sameGroupRows.map((row) => normalizeContractVersion(row.ContractVersion))) + 1;
  const recommendedDecision = exactIdentityRows.length ? 'replace_existing' : 'import_new_version';

  return {
    hasDuplicateRisk: true,
    hasBlockingDuplicate: false,
    requiresDecision: true,
    recommendedDecision,
    matches: sameGroupRows.map((row) =>
      toMatch(
        row,
        exactIdentityRows.some((candidateRow) => candidateRow.id === row.id)
          ? ['Same employee and contract number', 'Contract dates overlap existing record']
          : ['Same employee and contract number'],
        'version_review'
      )
    ),
    contractGroupKey,
    nextVersion,
    target,
    employeeMatch,
  };
}
