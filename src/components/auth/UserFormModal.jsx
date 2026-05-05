import React, { useEffect, useMemo, useState } from 'react';
import PasswordField from './PasswordField';
import { permissionService } from '../../security/services/permissionService';

const passwordRuleText =
  'Minimum 8 characters with upper, lower, number, and symbol.';

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
}

function buildInitialState(mode, initialUser) {
  if (mode === 'reset') {
    return {
      password: '',
      confirmPassword: '',
    };
  }

  return {
    displayName: initialUser?.displayName || '',
    username: initialUser?.username || '',
    email: initialUser?.email || '',
    roleIds: initialUser?.roleIds || [],
    isActive: initialUser?.isActive !== false,
    password: '',
    confirmPassword: '',
  };
}

export default function UserFormModal({
  open,
  mode,
  initialUser,
  roles,
  onClose,
  onSubmit,
  submitError,
  isSaving,
}) {
  const [formState, setFormState] = useState(buildInitialState(mode, initialUser));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setFormState(buildInitialState(mode, initialUser));
      setErrors({});
    }
  }, [initialUser, mode, open]);

  const selectedRoleObjects = useMemo(
    () => roles.filter((role) => formState.roleIds?.includes(role.id)),
    [formState.roleIds, roles]
  );

  const effectiveAccess = useMemo(
    () =>
      permissionService.resolveUserAccess(
        {
          id: initialUser?.id || 'draft-user',
          roleIds: formState.roleIds || [],
          permissionOverrides: {},
        },
        roles
      ),
    [formState.roleIds, initialUser?.id, roles]
  );

  if (!open) {
    return null;
  }

  const title =
    mode === 'create'
      ? 'Create user'
      : mode === 'edit'
        ? 'Edit user'
        : 'Reset password';

  const handleRoleToggle = (roleId) => {
    setFormState((current) => {
      const hasRole = current.roleIds.includes(roleId);
      return {
        ...current,
        roleIds: hasRole
          ? current.roleIds.filter((currentRoleId) => currentRoleId !== roleId)
          : [...current.roleIds, roleId],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};

    if (mode === 'reset') {
      if (!validatePassword(formState.password)) {
        nextErrors.password = passwordRuleText;
      }
      if (formState.password !== formState.confirmPassword) {
        nextErrors.confirmPassword = 'Passwords do not match.';
      }
    } else {
      if (!String(formState.displayName || '').trim()) {
        nextErrors.displayName = 'Display name is required.';
      }
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(String(formState.username || '').trim())) {
        nextErrors.username =
          'Use 3-30 letters, numbers, dots, underscores, or hyphens.';
      }
      if (!validateEmail(String(formState.email || '').trim())) {
        nextErrors.email = 'A valid email address is required.';
      }
      if (!Array.isArray(formState.roleIds) || formState.roleIds.length === 0) {
        nextErrors.roleIds = 'Select at least one role.';
      }

      if (mode === 'create') {
        if (!validatePassword(formState.password)) {
          nextErrors.password = passwordRuleText;
        }
        if (formState.password !== formState.confirmPassword) {
          nextErrors.confirmPassword = 'Passwords do not match.';
        }
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    await onSubmit(formState, setErrors);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal auth-modal">
        <div className="page-header">
          <div>
            <h1>{title}</h1>
            <p>
              {mode === 'reset'
                ? `Set a new temporary password for ${initialUser?.displayName || 'this user'}.`
                : 'Manage user identity, role assignment, and activation state.'}
            </p>
          </div>
        </div>

        {submitError ? <div className="form-error">{submitError}</div> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          {mode !== 'reset' ? (
            <>
              <div className="field">
                <label htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  value={formState.displayName}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
                {errors.displayName ? (
                  <span className="field-error">{errors.displayName}</span>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  value={formState.username}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                />
                {errors.username ? (
                  <span className="field-error">{errors.username}</span>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formState.email}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
                {errors.email ? <span className="field-error">{errors.email}</span> : null}
              </div>

              <div className="field">
                <label htmlFor="isActive">Status</label>
                <select
                  id="isActive"
                  value={formState.isActive ? 'active' : 'inactive'}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      isActive: event.target.value === 'active',
                    }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="field field-span-2">
                <label>Assigned roles</label>
                <div className="check-grid">
                  {roles.map((role) => (
                    <label key={role.id} className="check-option">
                      <input
                        type="checkbox"
                        checked={formState.roleIds.includes(role.id)}
                        onChange={() => handleRoleToggle(role.id)}
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <small>{role.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.roleIds ? <span className="field-error">{errors.roleIds}</span> : null}
              </div>

              <div className="field field-span-2">
                <label>Effective access summary</label>
                <div className="summary-chip-row">
                  {selectedRoleObjects.map((role) => (
                    <span key={role.id} className="badge">
                      Role: {role.name}
                    </span>
                  ))}
                  {permissionService.getAccessibleModules(effectiveAccess).map((module) => (
                    <span key={module.key} className="badge">
                      Module: {module.label}
                    </span>
                  ))}
                </div>
              </div>

              {mode === 'create' ? (
                <>
                  <PasswordField
                    id="password"
                    label="Temporary password"
                    value={formState.password}
                    onChange={(value) =>
                      setFormState((current) => ({
                        ...current,
                        password: value,
                      }))
                    }
                    error={errors.password}
                    placeholder="Enter a secure temporary password"
                    autoComplete="new-password"
                  />
                  <PasswordField
                    id="confirmPassword"
                    label="Confirm password"
                    value={formState.confirmPassword}
                    onChange={(value) =>
                      setFormState((current) => ({
                        ...current,
                        confirmPassword: value,
                      }))
                    }
                    error={errors.confirmPassword}
                    placeholder="Re-enter the password"
                    autoComplete="new-password"
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <PasswordField
                id="password"
                label="New password"
                value={formState.password}
                onChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    password: value,
                  }))
                }
                error={errors.password}
                placeholder="Enter the new password"
                autoComplete="new-password"
              />
              <PasswordField
                id="confirmPassword"
                label="Confirm password"
                value={formState.confirmPassword}
                onChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    confirmPassword: value,
                  }))
                }
                error={errors.confirmPassword}
                placeholder="Re-enter the new password"
                autoComplete="new-password"
              />
            </>
          )}

          <div className="form-help field-span-2">{passwordRuleText}</div>

          <div className="modal-actions field-span-2">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSaving}>
              {isSaving
                ? 'Saving...'
                : mode === 'reset'
                  ? 'Reset password'
                  : mode === 'edit'
                    ? 'Save changes'
                    : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
