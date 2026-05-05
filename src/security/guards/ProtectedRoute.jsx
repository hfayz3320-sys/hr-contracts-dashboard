import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../auth/useAuthStore';
import { permissionService } from '../services/permissionService';

export default function ProtectedRoute({
  children,
  moduleKey,
  pageKey,
  action = 'view',
}) {
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const access = permissionService.resolveUserAccess(currentUser, roles);

  if (moduleKey && !permissionService.canAccessModule(access, moduleKey)) {
    return <Navigate to="/forbidden" replace state={{ from: location }} />;
  }

  if (pageKey && !permissionService.canAccessPage(access, pageKey, action)) {
    return <Navigate to="/forbidden" replace state={{ from: location }} />;
  }

  return children;
}
