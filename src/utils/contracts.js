export function normalizeContractValue(value) {
  return String(value || '').trim().toLowerCase();
}

export function buildContractGroupKey(record) {
  const employeeNumber = normalizeContractValue(record?.EmployeeNumber);
  const contractNumber = normalizeContractValue(record?.ContractNumber);

  if (!employeeNumber && !contractNumber) {
    return '';
  }

  return `${employeeNumber || 'unknown-employee'}::${contractNumber || 'unknown-contract'}`;
}

export function normalizeContractVersion(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
}

const COMPARABLE_FIELDS = [
  'EmployeeNumber',
  'ContractNumber',
  'StartDate',
  'EndDate',
  'Name',
  'Profession',
  'Nationality',
  'IdentityNumber',
  'IDType',
  'IDExpiryDate',
  'BasicSalary',
  'FoodAllowance',
  'OTAllowance',
  'GrossCashMonthly',
  'WorkLocation',
];

export function buildComparableContractSnapshot(record) {
  return COMPARABLE_FIELDS.reduce((snapshot, field) => {
    snapshot[field] = String(record?.[field] ?? '').trim();
    return snapshot;
  }, {});
}

export function areComparableContractsEqual(left, right) {
  const leftSnapshot = buildComparableContractSnapshot(left);
  const rightSnapshot = buildComparableContractSnapshot(right);

  return Object.keys(leftSnapshot).every(
    (field) => normalizeContractValue(leftSnapshot[field]) === normalizeContractValue(rightSnapshot[field])
  );
}
