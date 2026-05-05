import React from 'react';
import { formatCurrency, formatDate, formatNumber } from '../utils/format';

const fields = [
  'EmployeeNumber',
  'Name',
  'Profession',
  'Nationality',
  'ContractNumber',
  'StartDate',
  'EndDate',
  'ContractDaysRemaining',
  'ContractStatus',
  'Age',
  'BasicSalary',
  'TotalCashAllowances',
  'GrossCashMonthly',
  'Email',
  'MobileNumber',
  'IBAN',
  'SourceFile',
];

const labelsAr = {
  EmployeeNumber: 'رقم الموظف',
  Name: 'الاسم',
  Profession: 'المهنة',
  Nationality: 'الجنسية',
  ContractNumber: 'رقم العقد',
  StartDate: 'تاريخ البداية',
  EndDate: 'تاريخ النهاية',
  ContractDaysRemaining: 'الأيام المتبقية',
  ContractStatus: 'حالة العقد',
  Age: 'العمر',
  BasicSalary: 'الراتب الأساسي',
  TotalCashAllowances: 'إجمالي البدلات',
  GrossCashMonthly: 'إجمالي شهري',
  Email: 'البريد الإلكتروني',
  MobileNumber: 'رقم الجوال',
  IBAN: 'IBAN',
  SourceFile: 'ملف المصدر',
};

const labelsEn = {
  EmployeeNumber: 'Employee Number',
  Name: 'Name',
  Profession: 'Profession',
  Nationality: 'Nationality',
  ContractNumber: 'Contract Number',
  StartDate: 'Start Date',
  EndDate: 'End Date',
  ContractDaysRemaining: 'Days Remaining',
  ContractStatus: 'Contract Status',
  Age: 'Age',
  BasicSalary: 'Basic Salary',
  TotalCashAllowances: 'Total Allowances',
  GrossCashMonthly: 'Gross Monthly',
  Email: 'Email',
  MobileNumber: 'Mobile Number',
  IBAN: 'IBAN',
  SourceFile: 'Source File',
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

function renderInsuranceSummary(insuranceDetails) {
  if (!insuranceDetails?.primaryRecord) {
    return (
      <div className="empty-state-card compact">
        <strong>Not insured</strong>
        <span>No linked medical insurance record was found for this employee.</span>
      </div>
    );
  }

  const { primaryRecord, dependents } = insuranceDetails;

  return (
    <>
      <div className="table-wrap" style={{ maxHeight: 280 }}>
        <table className="table">
          <tbody>
            <tr>
              <th>Insurance Class</th>
              <td>{primaryRecord.ClassDescription || '-'}</td>
            </tr>
            <tr>
              <th>Policy Number</th>
              <td>{primaryRecord.PolicyNo || '-'}</td>
            </tr>
            <tr>
              <th>Contract Number</th>
              <td>{primaryRecord.ContractNo || '-'}</td>
            </tr>
            <tr>
              <th>Subscription Start Date</th>
              <td>{primaryRecord.MemberEffectiveDate || '-'}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>{primaryRecord.MemberCCHIStatus || primaryRecord.CCHIPolicyStatus || '-'}</td>
            </tr>
            <tr>
              <th>Upload Status</th>
              <td>{primaryRecord.CCHIPolicyStatus || '-'}</td>
            </tr>
            <tr>
              <th>Dependents Count</th>
              <td>{dependents.length}</td>
            </tr>
            <tr>
              <th>Reject Reason</th>
              <td>{primaryRecord.MemberRejectReason || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {dependents.length ? (
        <div className="chart-card" style={{ marginTop: 12, minHeight: 'auto' }}>
          <h3>Dependents</h3>
          <div className="table-wrap" style={{ maxHeight: 220 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Relationship</th>
                  <th>Class</th>
                  <th>Start Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dependents.map((record) => (
                  <tr key={record.id}>
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
      ) : null}
    </>
  );
}

export default function EmployeeModal({
  lang,
  t,
  employee,
  onClose,
  pdfUrl,
  onEdit,
  insuranceDetails,
}) {
  if (!employee) {
    return null;
  }

  const labels = lang === 'ar' ? labelsAr : labelsEn;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 4 }}>{t(lang, 'employeeDetails')}</h1>
            <p>{employee.Name} - {employee.EmployeeNumber}</p>
          </div>
          <div className="toolbar-group">
            {onEdit ? (
              <button type="button" className="btn" onClick={() => onEdit(employee)}>
                Edit Employee
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onClose}>{t(lang, 'close')}</button>
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: '62vh' }}>
          <table className="table">
            <tbody>
              {fields.map((field) => {
                let value = employee[field];
                if (field.toLowerCase().includes('date')) {
                  value = formatDate(value);
                }
                if (['BasicSalary', 'TotalCashAllowances', 'GrossCashMonthly'].includes(field)) {
                  value = formatCurrency(value);
                }
                if (['Age', 'ContractDaysRemaining'].includes(field)) {
                  value = value === null || value === undefined ? '-' : formatNumber(value);
                }
                if (field === 'ContractStatus') {
                  value = statusLabel(value, lang, t);
                }

                return (
                  <tr key={field}>
                    <th>{labels[field] || field}</th>
                    <td>{String(value ?? '-')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10 }}>
          {pdfUrl ? (
            <a className="btn primary" href={pdfUrl} target="_blank" rel="noreferrer">
              Open Contract PDF
            </a>
          ) : (
            <span className="badge">{t(lang, 'noPdf')}</span>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 10px' }}>Medical Insurance</h3>
          {renderInsuranceSummary(insuranceDetails)}
        </div>
      </div>
    </div>
  );
}
