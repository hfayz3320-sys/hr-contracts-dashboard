import React, { useEffect, useMemo, useRef, useState } from 'react';
import PermissionGate from '../security/components/PermissionGate';
import PermissionMatrix from '../components/auth/PermissionMatrix';
import UserFormModal from '../components/auth/UserFormModal';
import { useAuthStore } from '../auth/useAuthStore';
import { MODULES, moduleRegistry } from '../security/config/modules';
import { PAGE_KEYS, pageRegistry } from '../security/config/pages';
import { permissionService } from '../security/services/permissionService';
import { localDataService } from '../services/storage/localDataService';

const modalStateDefaults = {
  open: false,
  mode: 'create',
  user: null,
};

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function createMessageState() {
  return {
    error: '',
    success: '',
  };
}

export default function AdminPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);
  const users = useAuthStore((state) => state.users);
  const createUser = useAuthStore((state) => state.createUser);
  const updateUser = useAuthStore((state) => state.updateUser);
  const setUserActive = useAuthStore((state) => state.setUserActive);
  const resetUserPassword = useAuthStore((state) => state.resetUserPassword);
  const saveRolePermissions = useAuthStore((state) => state.saveRolePermissions);

  const [modalState, setModalState] = useState(modalStateDefaults);
  const [modalError, setModalError] = useState('');
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [roleState, setRoleState] = useState({
    selectedRoleId: '',
    draftPermissions: permissionService.normalizePermissionSet(),
  });
  const [roleNotice, setRoleNotice] = useState(createMessageState());
  const [userNotice, setUserNotice] = useState(createMessageState());
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [storageNotice, setStorageNotice] = useState(createMessageState());
  const [isStorageBusy, setIsStorageBusy] = useState(false);
  const backupImportRef = useRef(null);

  const currentAccess = useMemo(
    () => permissionService.resolveUserAccess(currentUser, roles),
    [currentUser, roles]
  );

  const manageableRoles = useMemo(
    () => permissionService.getManageableRolesForActor(currentUser, roles),
    [currentUser, roles]
  );

  const visibleUsers = useMemo(
    () => permissionService.getVisibleUsersForActor(currentUser, users, roles),
    [currentUser, roles, users]
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === roleState.selectedRoleId) || roles[0] || null,
    [roleState.selectedRoleId, roles]
  );

  useEffect(() => {
    if (!selectedRole && roles.length > 0) {
      setRoleState((current) => ({
        ...current,
        selectedRoleId: roles[0].id,
      }));
      return;
    }

    if (selectedRole) {
      setRoleState((current) => ({
        ...current,
        selectedRoleId: selectedRole.id,
        draftPermissions: permissionService.normalizePermissionSet(selectedRole.permissions),
      }));
    }
  }, [selectedRole, roles]);

  const roleNameById = useMemo(
    () => new Map(roles.map((role) => [role.id, role.name])),
    [roles]
  );

  const modules = useMemo(
    () =>
      Object.values(moduleRegistry).sort((left, right) => left.order - right.order),
    []
  );

  const canManageUsers = permissionService.canManageUsers(currentAccess);
  const canManageRoles = permissionService.canManageRoles(currentAccess);
  const isSuperAdmin = currentUser?.roleIds?.includes('SuperAdmin');

  const openModal = (mode, user = null) => {
    setModalError('');
    setModalState({
      open: true,
      mode,
      user,
    });
  };

  const closeModal = () => {
    setModalError('');
    setModalState(modalStateDefaults);
  };

  const handleUserSubmit = async (formState, setValidationErrors) => {
    setIsSavingModal(true);
    setModalError('');
    setUserNotice(createMessageState());

    try {
      if (modalState.mode === 'create') {
        await createUser(formState);
        setUserNotice({
          error: '',
          success: `User ${formState.username} created successfully.`,
        });
      } else if (modalState.mode === 'edit' && modalState.user) {
        await updateUser(modalState.user.id, formState);
        setUserNotice({
          error: '',
          success: `User ${formState.username} updated successfully.`,
        });
      } else if (modalState.mode === 'reset' && modalState.user) {
        await resetUserPassword(modalState.user.id, formState.password);
        setUserNotice({
          error: '',
          success: `Password reset for ${modalState.user.username}.`,
        });
      }

      closeModal();
    } catch (error) {
      if (error.validation) {
        setValidationErrors(error.validation);
      }
      setModalError(error.message || 'Unable to save changes.');
    } finally {
      setIsSavingModal(false);
    }
  };

  const handleUserActivation = async (user, isActive) => {
    setUserNotice(createMessageState());

    try {
      await setUserActive(user.id, isActive);
      setUserNotice({
        error: '',
        success: `${user.username} ${isActive ? 'reactivated' : 'deactivated'} successfully.`,
      });
    } catch (error) {
      setUserNotice({
        error: error.message || 'Unable to update user status.',
        success: '',
      });
    }
  };

  const handleToggleModule = (moduleKey, checked) => {
    setRoleState((current) => {
      const nextPermissions = permissionService.normalizePermissionSet(current.draftPermissions);
      nextPermissions.modules[moduleKey].access = checked;

      Object.values(pageRegistry)
        .filter((page) => page.moduleKey === moduleKey)
        .forEach((page) => {
          if (!checked) {
            Object.keys(nextPermissions.pages[page.key]).forEach((action) => {
              nextPermissions.pages[page.key][action] = false;
            });
          }
        });

      if (moduleKey === MODULES.SYSTEM_MODULE && !checked) {
        nextPermissions.adminScopes.canManageUsers = false;
        nextPermissions.adminScopes.canManageRoles = false;
        nextPermissions.adminScopes.manageableRoleIds = [];
        nextPermissions.pages[PAGE_KEYS.ADMIN].view = false;
      }

      return {
        ...current,
        draftPermissions: nextPermissions,
      };
    });
  };

  const handleTogglePageAction = (pageKey, action, checked) => {
    setRoleState((current) => {
      const nextPermissions = permissionService.normalizePermissionSet(current.draftPermissions);
      nextPermissions.pages[pageKey][action] = checked;

      const page = pageRegistry[pageKey];
      if (checked && page) {
        nextPermissions.modules[page.moduleKey].access = true;
      }

      if (pageKey === PAGE_KEYS.ADMIN && !checked && action === 'view') {
        nextPermissions.adminScopes.canManageUsers = false;
        nextPermissions.adminScopes.canManageRoles = false;
        nextPermissions.adminScopes.manageableRoleIds = [];
      }

      return {
        ...current,
        draftPermissions: nextPermissions,
      };
    });
  };

  const handleAdminScopeToggle = (field, checked) => {
    setRoleState((current) => ({
      ...current,
      draftPermissions: {
        ...current.draftPermissions,
        adminScopes: {
          ...current.draftPermissions.adminScopes,
          [field]: checked,
        },
      },
    }));
  };

  const handleManageableRoleToggle = (roleId) => {
    setRoleState((current) => {
      const manageableRoleIds = new Set(current.draftPermissions.adminScopes.manageableRoleIds);
      if (manageableRoleIds.has(roleId)) {
        manageableRoleIds.delete(roleId);
      } else {
        manageableRoleIds.add(roleId);
      }

      return {
        ...current,
        draftPermissions: {
          ...current.draftPermissions,
          adminScopes: {
            ...current.draftPermissions.adminScopes,
            manageableRoleIds: Array.from(manageableRoleIds),
          },
        },
      };
    });
  };

  const handleSaveRole = async () => {
    if (!selectedRole) {
      return;
    }

    setIsSavingRole(true);
    setRoleNotice(createMessageState());

    try {
      await saveRolePermissions(selectedRole.id, roleState.draftPermissions);
      setRoleNotice({
        error: '',
        success: `${selectedRole.name} permissions updated successfully.`,
      });
    } catch (error) {
      setRoleNotice({
        error: error.message || 'Unable to save role permissions.',
        success: '',
      });
    } finally {
      setIsSavingRole(false);
    }
  };

  const downloadBackup = async () => {
    setIsStorageBusy(true);
    setStorageNotice(createMessageState());

    try {
      const backup = await localDataService.exportFullLocalData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'hr-dashboard-local-backup.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStorageNotice({
        error: '',
        success: 'Local backup exported successfully.',
      });
    } catch (error) {
      setStorageNotice({
        error: error.message || 'Unable to export local backup.',
        success: '',
      });
    } finally {
      setIsStorageBusy(false);
    }
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsStorageBusy(true);
    setStorageNotice(createMessageState());

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await localDataService.importFullLocalData(payload);
      setStorageNotice({
        error: '',
        success: 'Local backup imported successfully.',
      });
    } catch (error) {
      setStorageNotice({
        error: error.message || 'Unable to import local backup.',
        success: '',
      });
    } finally {
      setIsStorageBusy(false);
    }
  };

  const handleClearLocalData = async () => {
    if (!isSuperAdmin) {
      return;
    }
    if (!window.confirm('Clear all locally persisted employee, contract, insurance, PDF, and review data?')) {
      return;
    }

    setIsStorageBusy(true);
    setStorageNotice(createMessageState());

    try {
      await localDataService.reseedDefaultData();
      setStorageNotice({
        error: '',
        success: 'Local business data reset and default seed restored.',
      });
    } catch (error) {
      setStorageNotice({
        error: error.message || 'Unable to clear local data.',
        success: '',
      });
    } finally {
      setIsStorageBusy(false);
    }
  };

  return (
    <div className="content-wrap admin-shell">
      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>System Administration</h1>
            <p>
              Manage users, role assignments, module permissions, and scalable RBAC for
              future modules.
            </p>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-top">
              <span>Visible users</span>
            </div>
            <div className="kpi-value">{visibleUsers.length}</div>
            <div className="kpi-note">Scoped to what {currentUser?.displayName} can manage</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span>Active users</span>
            </div>
            <div className="kpi-value">{visibleUsers.filter((user) => user.isActive).length}</div>
            <div className="kpi-note">Current operational accounts</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span>Roles</span>
            </div>
            <div className="kpi-value">{roles.length}</div>
            <div className="kpi-note">Security roles available in the local RBAC store</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span>Modules</span>
            </div>
            <div className="kpi-value">{modules.length}</div>
            <div className="kpi-note">HR is the first registered business module</div>
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>Users</h1>
            <p>Create, edit, activate, deactivate, and reset passwords for managed users.</p>
          </div>

          <PermissionGate
            pageKey={PAGE_KEYS.ADMIN}
            fallback={null}
            condition={(access) => permissionService.canManageUsers(access)}
          >
            <button type="button" className="btn primary" onClick={() => openModal('create')}>
              Add user
            </button>
          </PermissionGate>
        </div>

        {userNotice.error ? <div className="form-error">{userNotice.error}</div> : null}
        {userNotice.success ? <div className="form-success">{userNotice.success}</div> : null}

        {!canManageUsers ? (
          <div className="empty-state-card">
            <strong>Read-only access</strong>
            <span>Your account can view this page but cannot manage users.</span>
          </div>
        ) : null}

        <div className="table-wrap" style={{ maxHeight: 'min(480px, 56vh)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Identity</th>
                <th>Roles</th>
                <th>Modules</th>
                <th>Status</th>
                <th>Last sign in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => {
                const userAccess = permissionService.resolveUserAccess(user, roles);
                const manageable = permissionService.canManageTargetUser(
                  currentAccess,
                  currentUser.id,
                  user
                );

                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                    </td>
                    <td>
                      <div>{user.username}</div>
                      <div className="table-subtext">{user.email}</div>
                    </td>
                    <td>
                      <div className="summary-chip-row">
                        {user.roleIds.map((roleId) => (
                          <span key={roleId} className="badge">
                            {roleNameById.get(roleId) || roleId}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="summary-chip-row">
                        {permissionService.getAccessibleModules(userAccess).map((module) => (
                          <span key={module.key} className="badge">
                            {module.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${user.isActive ? 'pill-ok' : 'pill-danger'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDateTime(user.lastLoginAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => openModal('edit', user)}
                          disabled={!manageable}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => openModal('reset', user)}
                          disabled={!manageable}
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => handleUserActivation(user, !user.isActive)}
                          disabled={!manageable}
                        >
                          {user.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>Role permissions</h1>
            <p>Map roles to modules, pages, and action permissions for future module growth.</p>
          </div>
        </div>

        {roleNotice.error ? <div className="form-error">{roleNotice.error}</div> : null}
        {roleNotice.success ? <div className="form-success">{roleNotice.success}</div> : null}

        <div className="admin-toolbar">
          <div className="field">
            <label htmlFor="roleSelect">Selected role</label>
            <select
              id="roleSelect"
              value={selectedRole?.id || ''}
              onChange={(event) =>
                setRoleState((current) => ({
                  ...current,
                  selectedRoleId: event.target.value,
                }))
              }
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="empty-state-card compact">
            <strong>{selectedRole?.name || 'Role'}</strong>
            <span>{selectedRole?.description || 'Select a role to inspect its grants.'}</span>
          </div>
        </div>

        {!canManageRoles ? (
          <div className="empty-state-card">
            <strong>Role editor is read-only</strong>
            <span>Only `SuperAdmin` can modify role-to-permission mappings.</span>
          </div>
        ) : null}

        <PermissionMatrix
          modules={modules}
          permissions={roleState.draftPermissions}
          onToggleModule={handleToggleModule}
          onTogglePageAction={handleTogglePageAction}
          readOnly={!canManageRoles}
        />

        <div className="permission-module-card">
          <div className="permission-module-row">
            <div>
              <h3>Administrative scope</h3>
              <p>Controls which users this role can manage and whether it can edit roles.</p>
            </div>
          </div>

          <div className="check-grid">
            <label className="check-option">
              <input
                type="checkbox"
                checked={roleState.draftPermissions.adminScopes.canManageUsers}
                onChange={(event) =>
                  handleAdminScopeToggle('canManageUsers', event.target.checked)
                }
                disabled={
                  !canManageRoles ||
                  !roleState.draftPermissions.modules[MODULES.SYSTEM_MODULE].access ||
                  !roleState.draftPermissions.pages[PAGE_KEYS.ADMIN].view
                }
              />
              <span>
                <strong>Can manage users</strong>
                <small>Allows create, edit, deactivate, reactivate, and password reset flows.</small>
              </span>
            </label>

            <label className="check-option">
              <input
                type="checkbox"
                checked={roleState.draftPermissions.adminScopes.canManageRoles}
                onChange={(event) =>
                  handleAdminScopeToggle('canManageRoles', event.target.checked)
                }
                disabled={
                  !canManageRoles ||
                  !roleState.draftPermissions.modules[MODULES.SYSTEM_MODULE].access ||
                  !roleState.draftPermissions.pages[PAGE_KEYS.ADMIN].view
                }
              />
              <span>
                <strong>Can manage role permissions</strong>
                <small>Allows editing module and page grants for roles.</small>
              </span>
            </label>
          </div>

          <div className="field field-span-2">
            <label>Manageable roles for user administration</label>
            <div className="check-grid">
              {manageableRoles.map((role) => (
                <label key={role.id} className="check-option">
                  <input
                    type="checkbox"
                    checked={roleState.draftPermissions.adminScopes.manageableRoleIds.includes(
                      role.id
                    )}
                    onChange={() => handleManageableRoleToggle(role.id)}
                    disabled={!canManageRoles || !roleState.draftPermissions.adminScopes.canManageUsers}
                  />
                  <span>
                    <strong>{role.name}</strong>
                    <small>{role.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setRoleState((current) => ({
                ...current,
                draftPermissions: permissionService.normalizePermissionSet(
                  selectedRole?.permissions
                ),
              }))
            }
          >
            Reset changes
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSaveRole}
            disabled={!canManageRoles || isSavingRole}
          >
            {isSavingRole ? 'Saving role...' : 'Save role permissions'}
          </button>
        </div>
      </div>

      <div className="page-card">
        <div className="page-header">
          <div>
            <h1>Local Data Operations</h1>
            <p>
              IndexedDB backup, restore, and local data reset for browser-persisted HR
              records. PDFs are included in backup files.
            </p>
          </div>
        </div>

        {storageNotice.error ? <div className="form-error">{storageNotice.error}</div> : null}
        {storageNotice.success ? <div className="form-success">{storageNotice.success}</div> : null}

        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={downloadBackup}
            disabled={isStorageBusy}
          >
            Export Full Local Data JSON
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => backupImportRef.current?.click()}
            disabled={isStorageBusy}
          >
            Import Full Local Data JSON
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={handleClearLocalData}
            disabled={!isSuperAdmin || isStorageBusy}
          >
            Clear Local Data
          </button>
        </div>

        {!isSuperAdmin ? (
          <div className="empty-state-card" style={{ marginTop: 12 }}>
            <strong>Restricted action</strong>
            <span>Only `SuperAdmin` can clear all locally persisted business data.</span>
          </div>
        ) : null}

        <input
          ref={backupImportRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportBackup}
        />
      </div>

      <UserFormModal
        open={modalState.open}
        mode={modalState.mode}
        initialUser={modalState.user}
        roles={canManageRoles ? roles : manageableRoles}
        onClose={closeModal}
        onSubmit={handleUserSubmit}
        submitError={modalError}
        isSaving={isSavingModal}
      />
    </div>
  );
}
