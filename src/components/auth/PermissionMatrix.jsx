import React from 'react';
import { ACTION_LABELS, PERMISSION_ACTIONS } from '../../security/config/actions';
import { getPagesByModule } from '../../security/config/pages';

export default function PermissionMatrix({
  modules,
  permissions,
  onToggleModule,
  onTogglePageAction,
  readOnly,
}) {
  return (
    <div className="permission-matrix">
      {modules.map((module) => {
        const pages = getPagesByModule(module.key);
        const hasModuleAccess = Boolean(permissions.modules?.[module.key]?.access);

        return (
          <section key={module.key} className="permission-module-card">
            <div className="permission-module-row">
              <div>
                <h3>{module.label}</h3>
                <p>{module.description}</p>
              </div>

              <label className="permission-toggle">
                <input
                  type="checkbox"
                  checked={hasModuleAccess}
                  onChange={(event) => onToggleModule(module.key, event.target.checked)}
                  disabled={readOnly}
                />
                <span>Module access</span>
              </label>
            </div>

            <div className="table-wrap">
              <table className="table permission-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    {PERMISSION_ACTIONS.map((action) => (
                      <th key={action}>{ACTION_LABELS[action]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.key}>
                      <td>{page.title}</td>
                      {PERMISSION_ACTIONS.map((action) => (
                        <td key={`${page.key}-${action}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(permissions.pages?.[page.key]?.[action])}
                            onChange={(event) =>
                              onTogglePageAction(page.key, action, event.target.checked)
                            }
                            disabled={readOnly || !hasModuleAccess}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
