import React, { useMemo } from 'react';
import CollapsibleFilters from '../filters/CollapsibleFilters';

/**
 * Employee list filters — collapsed behind a Filter button by default.
 * The 6 underlying field controls remain identical; only the wrapper
 * changed from an always-visible card to a drawer.
 */
export default function EmployeeFiltersBar({
  filters,
  options,
  onChange,
  onReset,
}) {
  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.employeeNumber)                              n += 1;
    if (filters.employeeName)                                n += 1;
    if (filters.nationality      && filters.nationality      !== 'all') n += 1;
    if (filters.jobTitle         && filters.jobTitle         !== 'all') n += 1;
    if (filters.employmentStatus && filters.employmentStatus !== 'all') n += 1;
    if (filters.contractExpiry   && filters.contractExpiry   !== 'all') n += 1;
    return n;
  }, [filters]);

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <CollapsibleFilters
        activeCount={activeCount}
        buttonLabel="Filter"
        drawerTitle="Employee Filters"
        onClear={onReset}
      >
        <div className="employee-filter-grid" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label htmlFor="employeeNumberFilter">Employee Number</label>
            <input
              id="employeeNumberFilter"
              value={filters.employeeNumber}
              onChange={(event) => onChange('employeeNumber', event.target.value)}
              placeholder="Exact or starts with"
            />
          </div>

          <div className="field">
            <label htmlFor="employeeNameFilter">Employee Name</label>
            <input
              id="employeeNameFilter"
              value={filters.employeeName}
              onChange={(event) => onChange('employeeName', event.target.value)}
              placeholder="Contains match"
            />
          </div>

          <div className="field">
            <label htmlFor="employeeNationalityFilter">Nationality</label>
            <select
              id="employeeNationalityFilter"
              value={filters.nationality}
              onChange={(event) => onChange('nationality', event.target.value)}
            >
              <option value="all">All</option>
              {(options.nationalities || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="employeeJobTitleFilter">Job Title / Position</label>
            <select
              id="employeeJobTitleFilter"
              value={filters.jobTitle}
              onChange={(event) => onChange('jobTitle', event.target.value)}
            >
              <option value="all">All</option>
              {(options.jobTitles || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="employeeStatusFilter">Employment Status</label>
            <select
              id="employeeStatusFilter"
              value={filters.employmentStatus}
              onChange={(event) => onChange('employmentStatus', event.target.value)}
            >
              <option value="all">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="employeeExpiryFilter">Contract Expiry</label>
            <select
              id="employeeExpiryFilter"
              value={filters.contractExpiry}
              onChange={(event) => onChange('contractExpiry', event.target.value)}
            >
              <option value="all">All</option>
              <option value="Expired">Expired</option>
              <option value="Expiring30">Expiring in 30 days</option>
              <option value="Expiring60">Expiring in 60 days</option>
            </select>
          </div>
        </div>
      </CollapsibleFilters>
    </div>
  );
}
