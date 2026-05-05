import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { permissionService } from '../security/services/permissionService';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);
  const logout = useAuthStore((state) => state.logout);
  const access = permissionService.resolveUserAccess(currentUser, roles);

  return (
    <div className="forbidden-shell">
      <div className="forbidden-card">
        <img src="/assets/logo.png" alt="Mid Arabia logo" />
        <h1>Access denied</h1>
        <p>
          Your account is authenticated, but it does not have permission to access this
          page or action.
        </p>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn primary"
            onClick={() => navigate(permissionService.getDefaultRoute(access), { replace: true })}
          >
            Go to my dashboard
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
