import React, { useEffect, useState } from 'react';
import {
  createEmployeeFormState,
  employeeFieldConfig,
  employeeFieldOrder,
  normalizeEmployeeForm,
  validateEmployeeForm,
} from '../../services/employees/employeeFormService';

function renderField(field, value, onChange, error) {
  const config = employeeFieldConfig[field];
  if (!config) {
    return null;
  }

  if (config.type === 'select') {
    return (
      <>
        <select value={value} onChange={(event) => onChange(field, event.target.value)}>
          {config.options.map((option) => (
            <option key={option} value={option}>
              {option || 'Select'}
            </option>
          ))}
        </select>
        {error ? <span className="field-error">{error}</span> : null}
      </>
    );
  }

  return (
    <>
      <input
        type={config.type}
        step={config.step}
        value={value}
        placeholder={config.placeholder}
        onChange={(event) => onChange(field, event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </>
  );
}

export default function EmployeeFormModal({
  open,
  mode,
  initialEmployee,
  onClose,
  onSubmit,
  submitError,
  isSaving = false,
}) {
  const [formState, setFormState] = useState(createEmployeeFormState(initialEmployee));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setFormState(createEmployeeFormState(initialEmployee));
      setErrors({});
    }
  }, [initialEmployee, open]);

  if (!open) {
    return null;
  }

  const handleChange = (field, value) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateEmployeeForm(formState);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      await onSubmit({
        ...initialEmployee,
        ...normalizeEmployeeForm(formState),
      });
    } catch (error) {
      return;
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal auth-modal">
        <div className="page-header">
          <div>
            <h1>{mode === 'edit' ? 'Edit Employee' : 'Create Employee'}</h1>
            <p>Uses the same employee/contract field order as the current dashboard data model.</p>
          </div>
        </div>

        {submitError ? <div className="form-error">{submitError}</div> : null}

        <form className="employee-form-grid" onSubmit={handleSubmit}>
          {employeeFieldOrder.map((field) => (
            <div key={field} className="field">
              <label>{employeeFieldConfig[field].label}</label>
              {renderField(field, formState[field] || '', handleChange, errors[field])}
            </div>
          ))}

          <div className="modal-actions field-span-2">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : mode === 'edit' ? 'Save Employee' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
