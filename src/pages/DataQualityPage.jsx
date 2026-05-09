import React, { useMemo, useState } from 'react';
import CollapsibleFilters from '../components/filters/CollapsibleFilters';
import { exportRowsToCsv } from '../utils/fileImport';
import { formatNumber } from '../utils/format';

function getIssueMessage(issue, lang) {
  const messages = {
    END_BEFORE_START: {
      ar: 'تاريخ نهاية العقد أقل من تاريخ البداية',
      en: 'End date is earlier than start date',
    },
    IBAN_INVALID: {
      ar: 'IBAN مفقود أو طوله غير منطقي',
      en: 'IBAN is missing or length is not plausible',
    },
    EMAIL_INVALID: {
      ar: 'تنسيق البريد الإلكتروني غير صالح',
      en: 'Invalid email format',
    },
    MOBILE_INVALID: {
      ar: 'رقم الجوال غير صالح',
      en: 'Invalid mobile number format',
    },
    ID_EXPIRED: {
      ar: 'هوية الموظف منتهية',
      en: 'ID is expired',
    },
    DURATION_MISMATCH: {
      ar: 'مدة العقد لا تطابق الفرق بين تاريخ البداية والنهاية',
      en: 'Contract duration does not match start/end range',
    },
    NAME_MISSING: {
      ar: 'اسم الموظف مفقود',
      en: 'Employee name is missing',
    },
  };

  const scoped = messages[issue.code];
  if (!scoped) {
    return issue.message;
  }
  return lang === 'ar' ? scoped.ar : scoped.en;
}

export default function DataQualityPage({ lang, t, rows, issues, importSummary }) {
  const [severityFilter, setSeverityFilter] = useState('all');

  const filteredIssues = useMemo(() => {
    if (severityFilter === 'all') {
      return issues;
    }
    return issues.filter((x) => x.severity === severityFilter);
  }, [issues, severityFilter]);

  const healthyRows = useMemo(() => {
    const rowsWithIssues = new Set(issues.map((x) => x.rowIndex));
    return Math.max(0, rows.length - rowsWithIssues.size);
  }, [rows, issues]);

  const exportQualityCsv = () => {
    const data = filteredIssues.map((item) => ({
      Row: item.rowIndex,
      EmployeeNumber: item.employeeNumber,
      Field: item.field,
      Code: item.code,
      Severity: item.severity,
      Message: getIssueMessage(item, lang),
    }));
    exportRowsToCsv(data, 'quality-report.csv');
  };

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>{lang === 'ar' ? 'جودة البيانات' : 'Data Quality'}</h1>
          <p>{lang === 'ar' ? 'متابعة الأخطاء الحرجة والتحذيرات مع تصدير تقرير الجودة.' : 'Track critical issues and warnings with exportable report.'}</p>
        </div>
      </div>

      <div className="import-summary">
        <strong>{t(lang, 'importSummary')}</strong>
        <div className="badge-row">
          <span className="badge">{t(lang, 'rows')}: {formatNumber(importSummary.rowCount)}</span>
          <span className="badge">{t(lang, 'columns')}: {formatNumber(importSummary.columnCount)}</span>
          <span className="badge">{t(lang, 'missing')}: {formatNumber(importSummary.totalMissingValues)}</span>
          <span className="badge">{t(lang, 'critical')}: {formatNumber(importSummary.criticalCount)}</span>
          <span className="badge">{t(lang, 'warnings')}: {formatNumber(importSummary.warningCount)}</span>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="kpi-card kpi-danger">
          <div className="kpi-top">{t(lang, 'critical')}</div>
          <div className="kpi-value">{formatNumber(importSummary.criticalCount)}</div>
        </div>

        <div className="kpi-card kpi-warn">
          <div className="kpi-top">{t(lang, 'warnings')}</div>
          <div className="kpi-value">{formatNumber(importSummary.warningCount)}</div>
        </div>

        <div className="kpi-card kpi-success">
          <div className="kpi-top">{t(lang, 'healthyRows')}</div>
          <div className="kpi-value">{formatNumber(healthyRows)}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button className="btn" type="button" onClick={exportQualityCsv}>{t(lang, 'qualityExport')}</button>
        <CollapsibleFilters
          activeCount={severityFilter !== 'all' ? 1 : 0}
          buttonLabel="Filter"
          drawerTitle="Quality Filters"
          onClear={() => setSeverityFilter('all')}
        >
          <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="dqSeverity">Severity</label>
            <select
              id="dqSeverity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ minHeight: 36, borderRadius: 10, border: '1px solid var(--line)', padding: '6px 10px' }}
            >
              <option value="all">{t(lang, 'all')}</option>
              <option value="Critical">Critical</option>
              <option value="Warning">Warning</option>
            </select>
          </div>
        </CollapsibleFilters>
      </div>

      <div className="chart-card compact-chart-card" style={{ marginTop: 10 }}>
        <h3>{lang === 'ar' ? 'جدول مشاكل الجودة' : 'Quality Issues'}</h3>
        <div className="table-wrap" style={{ maxHeight: 'min(360px, 44vh)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Row</th>
                <th>{lang === 'ar' ? 'رقم الموظف' : 'Employee No'}</th>
                <th>{lang === 'ar' ? 'الحقل' : 'Field'}</th>
                <th>Code</th>
                <th>{lang === 'ar' ? 'الخطورة' : 'Severity'}</th>
                <th>{lang === 'ar' ? 'الرسالة' : 'Message'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((issue, idx) => (
                <tr key={`${issue.code}-${issue.rowIndex}-${idx}`}>
                  <td>{issue.rowIndex}</td>
                  <td>{issue.employeeNumber}</td>
                  <td>{issue.field}</td>
                  <td>{issue.code}</td>
                  <td>
                    <span className={`status-pill ${issue.severity === 'Critical' ? 'pill-danger' : 'pill-warn'}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td>{getIssueMessage(issue, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-card" style={{ marginTop: 10 }}>
        <h3>{lang === 'ar' ? 'أكثر المشاكل تكرارًا' : 'Top Detected Issues'}</h3>
        <div className="badge-row">
          {(importSummary.topIssues || []).map((item) => (
            <span key={item.code} className="badge">{item.code}: {item.count}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
