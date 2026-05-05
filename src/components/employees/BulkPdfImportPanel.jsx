import React, { useEffect, useMemo, useState } from 'react';
import {
  employeeFieldConfig,
  employeeFieldOrder,
} from '../../services/employees/employeeFormService';

function renderField(field, value, onChange) {
  const config = employeeFieldConfig[field];
  if (!config) {
    return null;
  }

  if (config.type === 'select') {
    return (
      <select value={value || ''} onChange={(event) => onChange(field, event.target.value)}>
        {config.options.map((option) => (
          <option key={option} value={option}>
            {option || 'Select'}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={config.type}
      step={config.step}
      value={value || ''}
      placeholder={config.placeholder}
      onChange={(event) => onChange(field, event.target.value)}
    />
  );
}

export default function BulkPdfImportPanel({
  open,
  title,
  reviewItems,
  onClose,
  onSaveItem,
  onSkipItem,
  onConfirmSelected,
  isSaving,
}) {
  const [draftItems, setDraftItems] = useState(reviewItems || []);
  const [activeId, setActiveId] = useState(reviewItems?.[0]?.id || '');

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftItems(reviewItems || []);
    setActiveId(reviewItems?.[0]?.id || '');
  }, [open, reviewItems]);

  const activeItem = useMemo(
    () => draftItems.find((item) => item.id === activeId) || draftItems[0] || null,
    [activeId, draftItems]
  );

  if (!open) {
    return null;
  }

  const handleFieldChange = (field, value) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === activeId
          ? {
              ...item,
              extractedData: {
                ...item.extractedData,
                [field]: value,
              },
            }
          : item
      )
    );
  };

  const handleImportDecisionChange = (value) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === activeId
          ? {
              ...item,
              importDecision: value,
            }
          : item
      )
    );
  };

  const handleSaveCurrent = async () => {
    if (!activeItem) {
      return;
    }
    await onSaveItem(activeItem);
  };

  const handleSkipCurrent = async () => {
    if (!activeItem) {
      return;
    }
    await onSkipItem(activeItem);
  };

  const handleConfirmCurrent = async () => {
    if (!activeItem) {
      return;
    }
    await onConfirmSelected(draftItems, [activeItem.id]);
  };

  const confirmDisabled =
    !activeItem ||
    isSaving ||
    activeItem.status === 'Skipped' ||
    activeItem.duplicateAnalysis?.hasBlockingDuplicate ||
    (activeItem.duplicateAnalysis?.requiresDecision && !activeItem.importDecision);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal pdf-review-modal">
        <div className="page-header">
          <div>
            <h1>{title}</h1>
            <p>
              Review one contract at a time, resolve duplicate or version decisions, then confirm
              the current record.
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pdf-review-layout">
          <div className="table-wrap pdf-review-list">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {draftItems.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === activeItem?.id ? 'is-selected-row' : ''}
                    onClick={() => setActiveId(item.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{item.title}</strong>
                      <div className="table-subtext">
                        {item.duplicateMatches?.length
                          ? `${item.duplicateMatches.length} duplicate warning(s)`
                          : 'No duplicate warning'}
                      </div>
                    </td>
                    <td>{item.extractedData?.importStatus || item.status}</td>
                    <td>{item.warnings?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pdf-review-editor">
            {activeItem ? (
              <>
                <div className="chart-card compact-chart-card">
                  <h3>{activeItem.title}</h3>
                  <div className="summary-chip-row">
                    <span className="badge">{activeItem.extractedData?.importStatus || 'Draft'}</span>
                    <span className="badge">{activeItem.warnings?.length || 0} warning(s)</span>
                  </div>
                  {activeItem.warnings?.length ? (
                    <div className="form-error" style={{ marginTop: 12 }}>
                      {activeItem.warnings.join(' ')}
                    </div>
                  ) : null}
                  {activeItem.duplicateMatches?.length ? (
                    <div className="chart-card compact-chart-card" style={{ marginTop: 12 }}>
                      <h3>Duplicate detection</h3>
                      <div className="summary-chip-row">
                        {activeItem.duplicateMatches.map((match) => (
                          <span key={match.id} className="badge">
                            {match.employeeNumber || match.contractNumber || match.name}:{' '}
                            {match.reasons.join(', ')}
                          </span>
                        ))}
                      </div>
                      {activeItem.duplicateAnalysis?.hasBlockingDuplicate ? (
                        <div className="form-error" style={{ marginTop: 12 }}>
                          Exact duplicate imports are blocked. Keep this item for review or skip it.
                        </div>
                      ) : null}
                      {activeItem.duplicateAnalysis?.requiresDecision ? (
                        <div className="field" style={{ marginTop: 12 }}>
                          <label>Version decision</label>
                          <select
                            value={activeItem.importDecision || ''}
                            onChange={(event) => handleImportDecisionChange(event.target.value)}
                          >
                            <option value="">Select action</option>
                            <option value="import_new_version">Import as new version</option>
                            <option value="replace_existing">Replace existing version</option>
                            <option value="cancel">Cancel</option>
                          </select>
                          <div className="form-help">
                            Same employee and contract number found. Choose how this imported
                            contract should be handled.
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="employee-form-grid pdf-review-form">
                  {employeeFieldOrder.map((field) => (
                    <div key={field} className="field">
                      <label>{employeeFieldConfig[field].label}</label>
                      {renderField(
                        field,
                        activeItem.extractedData?.[field] || '',
                        handleFieldChange
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state-card">
                <strong>No review items</strong>
                <span>Import a contract PDF to populate the local review queue.</span>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={handleSkipCurrent}
            disabled={!activeItem || isSaving}
          >
            Skip Current
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSaveCurrent}
            disabled={!activeItem || isSaving}
          >
            Save Review
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleConfirmCurrent}
            disabled={confirmDisabled}
          >
            {isSaving ? 'Confirming...' : 'Confirm Current'}
          </button>
        </div>
      </div>
    </div>
  );
}
