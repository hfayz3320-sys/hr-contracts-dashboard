import dayjs from 'dayjs';

function between(dateValue, from, to) {
  if (!dateValue) {
    return false;
  }
  const current = dayjs(dateValue);
  if (!current.isValid()) {
    return false;
  }

  const fromOk = from ? !current.isBefore(dayjs(from), 'day') : true;
  const toOk = to ? !current.isAfter(dayjs(to), 'day') : true;
  return fromOk && toOk;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesEmployeeNumber(row, filterValue) {
  const query = normalize(filterValue);
  if (!query) {
    return true;
  }

  const employeeNumber = normalize(row.EmployeeNumber);
  return employeeNumber === query || employeeNumber.startsWith(query);
}

function matchesEmployeeName(row, filterValue) {
  const query = normalize(filterValue);
  if (!query) {
    return true;
  }

  return normalize(row.Name).includes(query);
}

function matchesEmploymentStatus(row, filterValue) {
  const query = String(filterValue || '').trim();
  if (!query || query === 'all') {
    return true;
  }

  const rowStatus = String(row.EmploymentStatus || '').trim();
  if (rowStatus) {
    return rowStatus === query;
  }

  if (query === 'Active') {
    return String(row.ContractStatus || '').trim() === 'Active';
  }
  if (query === 'Inactive') {
    return String(row.ContractStatus || '').trim() === 'Expired';
  }

  return false;
}

function matchesContractExpiry(row, filterValue) {
  const query = String(filterValue || '').trim();
  if (!query || query === 'all') {
    return true;
  }

  const daysRemaining = Number(row.ContractDaysRemaining);
  if (query === 'Expired') {
    return String(row.ContractStatus || '').trim() === 'Expired' || daysRemaining < 0;
  }
  if (query === 'Expiring30') {
    return daysRemaining >= 0 && daysRemaining <= 30;
  }
  if (query === 'Expiring60') {
    return daysRemaining > 30 && daysRemaining <= 60;
  }

  return true;
}

export function applyFilters(rows, filters) {
  const search = normalize(filters.search);
  const professionFilter = filters.jobTitle || filters.profession;

  return (rows || []).filter((row) => {
    if (filters.nationality && filters.nationality !== 'all' && row.Nationality !== filters.nationality) {
      return false;
    }

    if (professionFilter && professionFilter !== 'all' && row.Profession !== professionFilter) {
      return false;
    }

    if (filters.contractStatus && filters.contractStatus !== 'all' && row.ContractStatus !== filters.contractStatus) {
      return false;
    }

    if (filters.startFrom || filters.startTo) {
      if (!between(row.StartDate || row.JoiningDate, filters.startFrom, filters.startTo)) {
        return false;
      }
    }

    if (filters.endFrom || filters.endTo) {
      if (!between(row.EndDate, filters.endFrom, filters.endTo)) {
        return false;
      }
    }

    if (!matchesEmployeeNumber(row, filters.employeeNumber)) {
      return false;
    }

    if (!matchesEmployeeName(row, filters.employeeName)) {
      return false;
    }

    if (!matchesEmploymentStatus(row, filters.employmentStatus)) {
      return false;
    }

    if (!matchesContractExpiry(row, filters.contractExpiry)) {
      return false;
    }

    if (search) {
      if (!normalize(row.Name).includes(search)) {
        return false;
      }
    }

    return true;
  });
}

export function sortRows(rows, sortKey, direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  return [...(rows || [])].sort((a, b) => {
    const aValue = a?.[sortKey];
    const bValue = b?.[sortKey];

    if (aValue === bValue) {
      return 0;
    }

    if (aValue === null || aValue === undefined || aValue === '') {
      return 1;
    }

    if (bValue === null || bValue === undefined || bValue === '') {
      return -1;
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * sign;
    }

    if (['EmployeeNumber', 'ContractNumber'].includes(sortKey)) {
      return String(aValue).localeCompare(String(bValue), 'en', {
        sensitivity: 'base',
        numeric: true,
      }) * sign;
    }

    const aDate = dayjs(aValue);
    const bDate = dayjs(bValue);
    if (aDate.isValid() && bDate.isValid()) {
      if (aDate.isSame(bDate)) {
        return 0;
      }
      return (aDate.isAfter(bDate) ? 1 : -1) * sign;
    }

    return String(aValue).localeCompare(String(bValue), 'en', { sensitivity: 'base' }) * sign;
  });
}

export function paginateRows(rows, page, pageSize) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return {
    items,
    total,
    pages,
    page: safePage,
  };
}

export function buildFilterOptions(rows) {
  const nationalitySet = new Set();
  const professionSet = new Set();

  (rows || []).forEach((row) => {
    if (row.Nationality) {
      nationalitySet.add(row.Nationality);
    }
    if (row.Profession) {
      professionSet.add(row.Profession);
    }
  });

  return {
    nationalities: Array.from(nationalitySet).sort((a, b) => a.localeCompare(b)),
    professions: Array.from(professionSet).sort((a, b) => a.localeCompare(b)),
    jobTitles: Array.from(professionSet).sort((a, b) => a.localeCompare(b)),
  };
}
