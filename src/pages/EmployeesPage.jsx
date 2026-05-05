import React from 'react';
import EmployeeFiltersBar from '../components/employees/EmployeeFiltersBar';
import { formatCurrency, formatDate, formatNumber } from '../utils/format';

const labelMapEn = {
  EmployeeNumber: 'Employee No',
  Name: 'Name',
  Profession: 'Profession',
  Nationality: 'Nationality',
  StartDate: 'Start Date',
  EndDate: 'End Date',
  ContractStatus: 'Status',
  ContractDaysRemaining: 'Days Left',
  BasicSalary: 'Basic',
  TotalCashAllowances: 'Allowances',
  GrossCashMonthly: 'Gross',
  MobileNumber: 'Mobile',
  Email: 'Email',
  IBAN: 'IBAN',
  IdentityNumber: 'Identity No',
};

const labelMapAr = {
  EmployeeNumber: 'رقم الموظف',
  Name: 'الاسم',
  Profession: 'المهنة',
  Nationality: 'الجنسية',
  StartDate: 'تاريخ البداية',
  EndDate: 'تاريخ النهاية',
  ContractStatus: 'الحالة',
  ContractDaysRemaining: 'الأيام المتبقية',
  BasicSalary: 'الأساسي',
  TotalCashAllowances: 'البدلات',
  GrossCashMonthly: 'الإجمالي',
  MobileNumber: 'الجوال',
  Email: 'البريد',
  IBAN: 'IBAN',
  IdentityNumber: 'رقم الهوية',
};

function statusLabel(value, lang, t) {
  if (value === 'Active') {
    return t(lang, 'active');
  }
  if (value === 'Expired') {
    return t(lang, 'expired');
  }
  if (value === 'ExpiringSoon') {
    return t(lang, 'expiringSoon');
  }
  return value || '-';
}

function renderValue(row, column, lang, t) {
  const value = row[column];
  if (['StartDate', 'EndDate'].includes(column)) {
    return formatDate(value);
  }
  if (['BasicSalary', 'TotalCashAllowances', 'GrossCashMonthly'].includes(column)) {
    return formatCurrency(value);
  }
  if (column === 'ContractDaysRemaining') {
    return value === null || value === undefined ? '-' : formatNumber(value);
  }
  if (column === 'ContractStatus') {
    const className =
      value === 'Active' ? 'pill-ok' : value === 'Expired' ? 'pill-danger' : 'pill-warn';
    return <span className={`status-pill ${className}`}>{statusLabel(value, lang, t)}</span>;
  }
  return String(value ?? '-');
}

function SummaryCard({ title, value, className, note }) {
  return (
    <div className={`kpi-card ${className || ''}`}>
      <div className="kpi-top">
        <span>{title}</span>
      </div>
      <div className="kpi-value">{formatNumber(value)}</div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </div>
  );
}

export default function EmployeesPage({
  lang,
  t,
  paged,
  sortKey,
  sortDirection,
  setSorting,
  visibleColumns,
  toggleColumn,
  page,
  setPage,
  pageSize,
  setPageSize,
  onRowClick,
  onExportCsv,
  onExportXlsx,
  summary,
  filtersDraft,
  filterOptions,
  onFilterChange,
  onResetDedicatedFilters,
  onCreateEmployee,
  onEditEmployee,
  onImportContractPdf,
  onReviewImports,
  reviewItemsCount,
  canCreateEmployee,
  canEditEmployee,
  canImportContracts,
  canReviewImports,
  resolvePdfUrl,
}) {
  const visible = Object.keys(visibleColumns).filter((col) => visibleColumns[col]);
  const labels = lang === 'ar' ? labelMapAr : labelMapEn;
  const showActionsColumn = Boolean(canEditEmployee || resolvePdfUrl);

  return (
    <div className="admin-shell">
      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>{lang === 'ar' ? 'جدول الموظفين' : 'Employees'}</h1>
            <p>{t(lang, 'employeeTableSubtitle')}</p>
          </div>
          <div className="toolbar-group">
            {canImportContracts ? (
              <button type="button" className="btn primary" onClick={onImportContractPdf}>
                Import Contract PDF
              </button>
            ) : null}
            {canCreateEmployee ? (
              <button type="button" className="btn" onClick={onCreateEmployee}>
                Create Employee
              </button>
            ) : null}
            {canReviewImports ? (
              <button type="button" className="btn" onClick={onReviewImports}>
                Review Contract Imports
                {reviewItemsCount ? ` (${reviewItemsCount})` : ''}
              </button>
            ) : null}
            <button className="btn" type="button" onClick={onExportCsv}>
              {t(lang, 'downloadFilteredCsv')}
            </button>
            <button className="btn" type="button" onClick={onExportXlsx}>
              {t(lang, 'downloadFilteredXlsx')}
            </button>
          </div>
        </div>

        <div className="kpi-grid employees-summary-grid">
          <SummaryCard title="Total Employees" value={summary.totalEmployees} />
          <SummaryCard title="Active Employees" value={summary.activeEmployees} className="kpi-success" />
          <SummaryCard title="Expiring Soon" value={summary.expiringSoon} className="kpi-warn" />
          <SummaryCard title="Expired" value={summary.expired} className="kpi-danger" />
          <SummaryCard title="Total Positions" value={summary.totalPositions} />
        </div>
      </div>

      <div className="page-card">
        <EmployeeFiltersBar
          filters={filtersDraft}
          options={filterOptions}
          onChange={onFilterChange}
          onReset={onResetDedicatedFilters}
        />

        <div className="chart-card" style={{ marginBottom: 10, minHeight: 'auto' }}>
          <h3>{lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Columns Visibility'}</h3>
          <div className="badge-row">
            {Object.keys(visibleColumns).map((col) => (
              <label
                key={col}
                className="badge"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  type="checkbox"
                  checked={visibleColumns[col]}
                  onChange={() => toggleColumn(col)}
                />
                {labels[col] || col}
              </label>
            ))}
          </div>
        </div>

        {!paged.items.length ? (
          <div className="empty-state-card">
            <strong>No employees match the current filters.</strong>
            <span>Reset filters or refine the search criteria to continue.</span>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'min(560px, 58vh)' }}>
            <table className="table">
              <thead>
                <tr>
                  {visible.map((column) => (
                    <th key={column}>
                      <button
                        type="button"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSorting(column)}
                      >
                        {labels[column] || column}
                        {sortKey === column ? ` ${sortDirection === 'asc' ? '↑' : '↓'}` : ''}
                      </button>
                    </th>
                  ))}
                  {showActionsColumn ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {paged.items.map((row) => {
                  const pdfUrl = resolvePdfUrl ? resolvePdfUrl(row) : '';
                  return (
                    <tr
                      key={row.id || `${row.EmployeeNumber}-${row.ContractNumber}`}
                      onClick={() => onRowClick(row)}
                      style={{ cursor: 'pointer' }}
                    >
                      {visible.map((column) => (
                        <td key={column}>{renderValue(row, column, lang, t)}</td>
                      ))}
                      {showActionsColumn ? (
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="row-actions">
                            <button type="button" className="btn" onClick={() => onRowClick(row)}>
                              View
                            </button>
                            {canEditEmployee ? (
                              <button
                                type="button"
                                className="btn"
                                onClick={() => onEditEmployee(row)}
                              >
                                Edit
                              </button>
                            ) : null}
                            {pdfUrl ? (
                              <a
                                className="btn ghost"
                                href={pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open Contract PDF
                              </a>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination">
          <div>
            {lang === 'ar' ? 'إجمالي النتائج' : 'Total Results'}:{' '}
            <strong>{formatNumber(paged.total)}</strong>
          </div>

          <div className="toolbar-group">
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <button className="btn" type="button" onClick={() => setPage(Math.max(1, page - 1))}>
              {lang === 'ar' ? 'السابق' : 'Prev'}
            </button>
            <span className="badge">
              {page} / {paged.pages}
            </span>
            <button
              className="btn"
              type="button"
              onClick={() => setPage(Math.min(paged.pages, page + 1))}
            >
              {lang === 'ar' ? 'التالي' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
