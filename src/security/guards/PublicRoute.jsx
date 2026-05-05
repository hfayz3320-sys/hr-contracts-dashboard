import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../auth/useAuthStore';
import { permissionService } from '../services/permissionService';

export default function PublicRoute({ children }) {
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);

  if (!currentUser) {
    return children;
  }

  const access = permissionService.resolveUserAccess(currentUser, roles);
  return <Navigate to={permissionService.getDefaultRoute(access)} replace />;
}
