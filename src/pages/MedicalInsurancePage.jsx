import React, { useEffect, useMemo, useState } from 'react';
import { exportRowsToCsv, exportRowsToXlsx } from '../utils/fileImport';
import { paginateRows } from '../utils/filtering';
import { summarizeInsuranceRecords } from '../services/insurance/insuranceReviewService';
import { MATCH_STATUSES } from '../storage/indexedDb/dbSchema';

function normalize(value) {
  return String(value || '').trim();
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function isDependent(record) {
  return normalizeLower(record.memberType || record.Relationship) !== 'main member' &&
    normalizeLower(record.Relationship) !== 'employee';
}

function isRejected(record) {
  return Boolean(
    normalize(record.MemberRejectReason) ||
      /reject|failed|inactive/i.test(
        `${normalize(record.CCHIPolicyStatus)} ${normalize(record.MemberCCHIStatus)}`
      )
  );
}

function matchesDateRange(value, from, to) {
  if (!value) {
    return !from && !to;
  }
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return true;
  }
  if (from && target < new Date(from)) {
    return false;
  }
  if (to) {
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
    if (target > endDate) {
      return false;
    }
  }
  return true;
}

function filterRecords(records, filters) {
  return (records || []).filter((record) => {
    if (
      filters.employeeNumber &&
      !normalizeLower(record.StaffNumber).includes(normalizeLower(filters.employeeNumber))
    ) {
      return false;
    }
    if (
      filters.employeeName &&
      !normalizeLower(record.MemberName).includes(normalizeLower(filters.employeeName))
    ) {
      return false;
    }
    if (filters.relationship !== 'all' && normalize(record.Relationship) !== filters.relationship) {
      return false;
    }
    if (filters.memberType !== 'all') {
      const expectedDependent = filters.memberType === 'Dependent';
      if (isDependent(record) !== expectedDependent) {
        return false;
      }
    }
    if (filters.classDescription !== 'all' && normalize(record.ClassDescription) !== filters.classDescription) {
      return false;
    }
    if (filters.policyNumber && !normalizeLower(record.PolicyNo).includes(normalizeLower(filters.policyNumber))) {
      return false;
    }
    if (filters.contractNumber && !normalizeLower(record.ContractNo).includes(normalizeLower(filters.contractNumber))) {
      return false;
    }
    if (filters.department !== 'all' && normalize(record.Department) !== filters.department) {
      return false;
    }
    if (filters.branch !== 'all' && normalize(record.BranchDescription) !== filters.branch) {
      return false;
    }
    if (filters.nationality !== 'all' && normalize(record.NationalityName) !== filters.nationality) {
      return false;
    }
    if (filters.insuranceStatus !== 'all' && normalize(record.MemberCCHIStatus) !== filters.insuranceStatus) {
      return false;
    }
    if (filters.matchStatus !== 'all' && normalize(record.matchStatus) !== filters.matchStatus) {
      return false;
    }
    if (filters.reviewState === 'needsReview' && normalize(record.matchStatus) !== MATCH_STATUSES.NEEDS_REVIEW) {
      return false;
    }
    if (filters.reviewState === 'rejected' && !isRejected(record)) {
      return false;
    }
    if (
      !matchesDateRange(
        record.MemberEffectiveDate,
        filters.startDateFrom,
        filters.startDateTo
      )
    ) {
      return false;
    }
    return true;
  });
}

function sortRecords(records, sortKey, direction) {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...(records || [])].sort((left, right) => {
    const leftValue = normalize(left[sortKey]);
    const rightValue = normalize(right[sortKey]);
    return leftValue.localeCompare(rightValue, 'en', { numeric: true, sensitivity: 'base' }) * multiplier;
  });
}

function buildOptions(records) {
  const createList = (selector) =>
    Array.from(
      new Set((records || []).map(selector).map(normalize).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));

  return {
    relationships: createList((record) => record.Relationship),
    classDescriptions: createList((record) => record.ClassDescription),
    departments: createList((record) => record.Department),
    branches: createList((record) => record.BranchDescription),
    nationalities: createList((record) => record.NationalityName),
    insuranceStatuses: createList((record) => record.MemberCCHIStatus),
  };
}

const defaultFilters = {
  employeeNumber: '',
  employeeName: '',
  relationship: 'all',
  memberType: 'all',
  classDescription: 'all',
  policyNumber: '',
  contractNumber: '',
  department: 'all',
  branch: 'all',
  nationality: 'all',
  insuranceStatus: 'all',
  matchStatus: 'all',
  reviewState: 'all',
  startDateFrom: '',
  startDateTo: '',
};

function InsuranceRecordModal({ open, record, employees, onClose, onSave, canReview, canEdit }) {
  const [draft, setDraft] = useState(record);
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    setDraft(record || null);
    setEmployeeId(record?.matchedEmployeeId || '');
  }, [record]);

  if (!open || !draft) {
    return null;
  }

  const handleChange = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const selectedEmployee = employees.find((employee) => employee.id === employeeId) || null;

  const saveRecord = async (mode) => {
    const now = new Date().toISOString();
    const nextRecord = {
      ...draft,
      matchedEmployeeId: selectedEmployee?.id || draft.matchedEmployeeId || null,
      matchedEmployeeNumber:
        selectedEmployee?.EmployeeNumber || draft.matchedEmployeeNumber || '',
      matchStatus:
        selectedEmployee?.id
          ? MATCH_STATUSES.MATCHED
          : draft.matchStatus || MATCH_STATUSES.NEEDS_REVIEW,
      matchReason: selectedEmployee?.id
        ? 'Manually linked from insurance review.'
        : draft.matchReason || '',
      needsReviewReason: selectedEmployee?.id ? '' : draft.needsReviewReason || '',
      reviewedAt: canReview ? now : draft.reviewedAt || null,
      confirmedAt: mode === 'confirm' ? now : draft.confirmedAt || null,
    };
    await onSave(nextRecord);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal auth-modal">
        <div className="page-header">
          <div>
            <h1>Insurance Record</h1>
            <p>{draft.MemberName} - {draft.StaffNumber || draft.BupaID || 'Unassigned'}</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="employee-form-grid">
          {[
            ['MemberName', 'Member Name'],
            ['StaffNumber', 'Staff Number'],
            ['Relationship', 'Relationship'],
            ['ClassDescription', 'Insurance Class'],
            ['PolicyNo', 'Policy Number'],
            ['ContractNo', 'Contract Number'],
            ['MemberEffectiveDate', 'Subscription Start Date'],
            ['Department', 'Department'],
            ['BranchDescription', 'Branch'],
            ['MemberCCHIStatus', 'Member Status'],
            ['CCHIPolicyStatus', 'Policy Status'],
            ['MemberRejectReason', 'Reject Reason'],
          ].map(([field, label]) => (
            <div key={field} className="field">
              <label>{label}</label>
              <input
                value={draft[field] || ''}
                onChange={(event) => handleChange(field, event.target.value)}
                disabled={!canEdit}
              />
            </div>
          ))}

          <div className="field field-span-2">
            <label>Manual employee link</label>
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Unlinked</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.EmployeeNumber} - {employee.Name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={() => saveRecord('review')}
            disabled={!canReview && !canEdit}
          >
            Save Review
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => saveRecord('confirm')}
            disabled={!canReview && !canEdit}
          >
            Confirm Record
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MedicalInsurancePage({
  employees,
  insuranceRecords,
  canImport,
  canEdit,
  canExport,
  canReview,
  onImportFiles,
  onImportSample,
  onSaveRecord,
}) {
  const [filters, setFilters] = useState(defaultFilters);
  const [sortKey, setSortKey] = useState('StaffNumber');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [message, setMessage] = useState({ error: '', success: '' });
  const [isImporting, setIsImporting] = useState(false);

  const options = useMemo(() => buildOptions(insuranceRecords), [insuranceRecords]);
  const filteredRecords = useMemo(
    () => filterRecords(insuranceRecords, filters),
    [insuranceRecords, filters]
  );
  const sortedRecords = useMemo(
    () => sortRecords(filteredRecords, sortKey, sortDirection),
    [filteredRecords, sortDirection, sortKey]
  );
  const pagedRecords = useMemo(
    () => paginateRows(sortedRecords, page, pageSize),
    [sortedRecords, page, pageSize]
  );
  const summary = useMemo(
    () => summarizeInsuranceRecords(filteredRecords),
    [filteredRecords]
  );
  const dependents = useMemo(
    () => sortedRecords.filter((record) => isDependent(record)).slice(0, 25),
    [sortedRecords]
  );
  const reviewQueue = useMemo(
    () =>
      sortedRecords.filter(
        (record) =>
          record.matchStatus === MATCH_STATUSES.UNMATCHED ||
          record.matchStatus === MATCH_STATUSES.NEEDS_REVIEW ||
          record.matchStatus === MATCH_STATUSES.DUPLICATE_MATCH_RISK ||
          isRejected(record)
      ),
    [sortedRecords]
  );

  useEffect(() => {
    setPage(1);
  }, [filters, sortKey, sortDirection, pageSize]);

  useEffect(() => {
    if (page !== pagedRecords.page) {
      setPage(pagedRecords.page);
    }
  }, [page, pagedRecords.page]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const handleImport = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) {
      return;
    }

    setIsImporting(true);
    setMessage({ error: '', success: '' });
    try {
      const records = await onImportFiles(files);
      setMessage({
        error: '',
        success: `${records.length} insurance records imported into local IndexedDB.`,
      });
    } catch (error) {
      setMessage({
        error: error.message || 'Insurance import failed.',
        success: '',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportSample = async () => {
    setIsImporting(true);
    setMessage({ error: '', success: '' });
    try {
      const records = await onImportSample();
      setMessage({
        error: '',
        success: `${records.length} records loaded from popa.xlsx.`,
      });
    } catch (error) {
      setMessage({
        error: error.message || 'Unable to load popa.xlsx.',
        success: '',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="admin-shell">
      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>Medical Insurance</h1>
            <p>
              Local insurance records mapped from the real Bupa columns in
              {' '}
              `popa.xlsx`, with employee matching, dependents, and review controls.
            </p>
          </div>

          <div className="toolbar-group">
            {canImport ? (
              <>
                <label className="btn primary" htmlFor="insuranceFileInput">
                  {isImporting ? 'Importing...' : 'Import Insurance File'}
                </label>
                <button type="button" className="btn" onClick={handleImportSample} disabled={isImporting}>
                  Load popa.xlsx
                </button>
              </>
            ) : null}
            {canExport ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => exportRowsToCsv(sortedRecords, 'insurance-filtered.csv')}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => exportRowsToXlsx(sortedRecords, 'insurance-filtered.xlsx')}
                >
                  Export Excel
                </button>
              </>
            ) : null}
          </div>
        </div>

        {message.error ? <div className="form-error">{message.error}</div> : null}
        {message.success ? <div className="form-success">{message.success}</div> : null}

        <input
          id="insuranceFileInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          style={{ display: 'none' }}
          onChange={handleImport}
        />

        <div className="kpi-grid insurance-kpi-grid">
          <div className="kpi-card">
            <div className="kpi-top"><span>Total Insured Employees</span></div>
            <div className="kpi-value">{summary.totalInsuredEmployees}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-top"><span>Total Insured Dependents</span></div>
            <div className="kpi-value">{summary.totalInsuredDependents}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-top"><span>Total Covered Lives</span></div>
            <div className="kpi-value">{summary.totalCoveredLives}</div>
          </div>
          <div className="kpi-card kpi-warn">
            <div className="kpi-top"><span>Unmatched</span></div>
            <div className="kpi-value">{summary.unmatched}</div>
          </div>
          <div className="kpi-card kpi-warn">
            <div className="kpi-top"><span>Needs Review</span></div>
            <div className="kpi-value">{summary.needsReview}</div>
          </div>
          <div className="kpi-card kpi-danger">
            <div className="kpi-top"><span>Rejected</span></div>
            <div className="kpi-value">{summary.rejected}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-top"><span>Total Insurance Classes</span></div>
            <div className="kpi-value">{summary.totalInsuranceClasses}</div>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div>
            <h1>Insurance Class Groups</h1>
            <p>Counts grouped by class or tier from the imported insurer file.</p>
          </div>
        </div>

        <div className="insurance-class-grid">
          {summary.classGroups.map((group) => (
            <div key={group.classDescription} className="kpi-card">
              <div className="kpi-top">
                <span>{group.classDescription}</span>
              </div>
              <div className="kpi-note">Employees: {group.employeeCount}</div>
              <div className="kpi-note">Dependents: {group.dependentCount}</div>
              <div className="kpi-value insurance-class-total">{group.totalLives}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card employee-filters-card">
        <h3>Insurance Filters</h3>
        <div className="insurance-filter-grid">
          <div className="field">
            <label>Employee Number</label>
            <input
              value={filters.employeeNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, employeeNumber: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Employee Name</label>
            <input
              value={filters.employeeName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, employeeName: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Relationship</label>
            <select
              value={filters.relationship}
              onChange={(event) =>
                setFilters((current) => ({ ...current, relationship: event.target.value }))
              }
            >
              <option value="all">All</option>
              {options.relationships.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Main Member / Dependent</label>
            <select
              value={filters.memberType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, memberType: event.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="Main Member">Main Member</option>
              <option value="Dependent">Dependent</option>
            </select>
          </div>
          <div className="field">
            <label>Insurance Class / Tier</label>
            <select
              value={filters.classDescription}
              onChange={(event) =>
                setFilters((current) => ({ ...current, classDescription: event.target.value }))
              }
            >
              <option value="all">All</option>
              {options.classDescriptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Policy Number</label>
            <input
              value={filters.policyNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, policyNumber: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Contract Number</label>
            <input
              value={filters.contractNumber}
              onChange={(event) =>
                setFilters((current) => ({ ...current, contractNumber: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Department</label>
            <select
              value={filters.department}
              onChange={(event) =>
                setFilters((current) => ({ ...current, department: event.target.value }))
              }
            >
              <option value="all">All</option>
              {options.departments.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Branch</label>
            <select
              value={filters.branch}
              onChange={(event) =>
                setFilters((current) => ({ ...current, branch: event.target.value }))
              }
            >
              <option value="all">All</option>
              {options.branches.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nationality</label>
            <select
              value={filters.nationality}
              onChange={(event) =>
                setFilters((current) => ({ ...current, nationality: event.target.value }))
              }
            >
              <option value="all">All</option>
              {options.nationalities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Insurance Status</label>
            <select
              value={filters.insuranceStatus}
              onChange={(event) =>
                setFilters((current) => ({ ...current, insuranceStatus: event.target.value }))
              }
            >
              <option value="all">All</option>
              {options.insuranceStatuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Match Status</label>
            <select
              value={filters.matchStatus}
              onChange={(event) =>
                setFilters((current) => ({ ...current, matchStatus: event.target.value }))
              }
            >
              <option value="all">All</option>
              <option value={MATCH_STATUSES.MATCHED}>{MATCH_STATUSES.MATCHED}</option>
              <option value={MATCH_STATUSES.UNMATCHED}>{MATCH_STATUSES.UNMATCHED}</option>
              <option value={MATCH_STATUSES.NEEDS_REVIEW}>{MATCH_STATUSES.NEEDS_REVIEW}</option>
              <option value={MATCH_STATUSES.DUPLICATE_MATCH_RISK}>
                {MATCH_STATUSES.DUPLICATE_MATCH_RISK}
              </option>
            </select>
          </div>
          <div className="field">
            <label>Reject / Review</label>
            <select
              value={filters.reviewState}
              onChange={(event) =>
                setFilters((current) => ({ ...current, reviewState: event.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="needsReview">Needs Review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="field">
            <label>Subscription Start Date From</label>
            <input
              type="date"
              value={filters.startDateFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, startDateFrom: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Subscription Start Date To</label>
            <input
              type="date"
              value={filters.startDateTo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, startDateTo: event.target.value }))
              }
            />
          </div>
          <div className="field insurance-filter-actions">
            <label>&nbsp;</label>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setFilters(defaultFilters)}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>Insurance Overview</h1>
            <p>Filtered records only. Click a row for detail, manual linking, and review actions.</p>
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: 'min(540px, 58vh)' }}>
          <table className="table">
            <thead>
              <tr>
                {[
                  ['StaffNumber', 'Employee Number'],
                  ['MemberName', 'Employee Name'],
                  ['memberType', 'Main/Dependent'],
                  ['Relationship', 'Relationship'],
                  ['ClassDescription', 'Insurance Class'],
                  ['PolicyNo', 'Policy Number'],
                  ['ContractNo', 'Contract Number'],
                  ['MemberEffectiveDate', 'Subscription Start Date'],
                  ['MemberCCHIStatus', 'Insurance Status'],
                  ['matchStatus', 'Match Status'],
                  ['Department', 'Department'],
                  ['BranchDescription', 'Branch'],
                ].map(([field, label]) => (
                  <th key={field}>
                    <button
                      type="button"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort(field)}
                    >
                      {label}
                      {sortKey === field ? ` ${sortDirection === 'asc' ? '↑' : '↓'}` : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRecords.items.map((record) => (
                <tr
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{record.StaffNumber || '-'}</td>
                  <td>{record.MemberName || '-'}</td>
                  <td>{record.memberType || (isDependent(record) ? 'Dependent' : 'Main Member')}</td>
                  <td>{record.Relationship || '-'}</td>
                  <td>{record.ClassDescription || '-'}</td>
                  <td>{record.PolicyNo || '-'}</td>
                  <td>{record.ContractNo || '-'}</td>
                  <td>{record.MemberEffectiveDate || '-'}</td>
                  <td>{record.MemberCCHIStatus || '-'}</td>
                  <td>{record.matchStatus || '-'}</td>
                  <td>{record.Department || '-'}</td>
                  <td>{record.BranchDescription || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <div>
            Total Results: <strong>{sortedRecords.length}</strong>
          </div>

          <div className="toolbar-group">
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <button
              type="button"
              className="btn"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              Prev
            </button>
            <span className="badge">
              {pagedRecords.page} / {pagedRecords.pages}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setPage(Math.min(pagedRecords.pages, page + 1))}
              disabled={page >= pagedRecords.pages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card" style={{ minHeight: 'auto' }}>
          <h3>Dependents View</h3>
          <div className="table-wrap" style={{ maxHeight: 'min(360px, 42vh)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Main Member ID</th>
                  <th>Dependent Name</th>
                  <th>Relationship</th>
                  <th>Insurance Class</th>
                  <th>Start Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dependents.map((record) => (
                  <tr key={record.id}>
                    <td>{record.MainMemberID || record.MainMembershipNo || '-'}</td>
                    <td>{record.MemberName || '-'}</td>
                    <td>{record.Relationship || '-'}</td>
                    <td>{record.ClassDescription || '-'}</td>
                    <td>{record.MemberEffectiveDate || '-'}</td>
                    <td>{record.MemberCCHIStatus || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="chart-card" style={{ minHeight: 'auto' }}>
          <h3>Exceptions / Review Queue</h3>
          <div className="table-wrap" style={{ maxHeight: 'min(360px, 42vh)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Staff Number</th>
                  <th>Match Status</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((record) => (
                  <tr key={record.id}>
                    <td>{record.MemberName || '-'}</td>
                    <td>{record.StaffNumber || '-'}</td>
                    <td>{record.matchStatus || '-'}</td>
                    <td>
                      {record.needsReviewReason ||
                        record.MemberRejectReason ||
                        record.matchReason ||
                        'Manual review required'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InsuranceRecordModal
        open={Boolean(selectedRecord)}
        record={selectedRecord}
        employees={employees}
        onClose={() => setSelectedRecord(null)}
        onSave={onSaveRecord}
        canReview={canReview}
        canEdit={canEdit}
      />
    </div>
  );
}
