import React from 'react';
import { useAuthStore } from '../../auth/useAuthStore';
import { permissionService } from '../services/permissionService';

export default function PermissionGate({
  children,
  fallback = null,
  moduleKey,
  pageKey,
  action = 'view',
  condition,
}) {
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);

  if (!currentUser) {
    return fallback;
  }

  const access = permissionService.resolveUserAccess(currentUser, roles);

  if (typeof condition === 'function' && !condition(access, currentUser, roles)) {
    return fallback;
  }

  if (moduleKey && !permissionService.canAccessModule(access, moduleKey)) {
    return fallback;
  }

  if (pageKey && !permissionService.canAccessPage(access, pageKey, action)) {
    return fallback;
  }

  return children;
}
