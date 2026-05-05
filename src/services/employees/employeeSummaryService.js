function distinctCount(rows, selector) {
  return new Set(
    (rows || [])
      .map(selector)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ).size;
}

export function calculateEmployeePageSummary(rows) {
  const list = rows || [];

  return {
    totalEmployees: list.length,
    activeEmployees: list.filter(
      (row) =>
        String(row.EmploymentStatus || '').trim() === 'Active' ||
        String(row.ContractStatus || '').trim() === 'Active'
    ).length,
    expiringSoon: list.filter((row) => String(row.ContractStatus || '').trim() === 'ExpiringSoon')
      .length,
    expired: list.filter((row) => String(row.ContractStatus || '').trim() === 'Expired').length,
    totalPositions: distinctCount(list, (row) => row.Profession),
  };
}
