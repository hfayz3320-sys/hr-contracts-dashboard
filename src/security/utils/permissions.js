import { PERMISSION_ACTIONS } from '../config/actions';
import { moduleRegistry, MODULES } from '../config/modules';
import { PAGE_KEYS, getPagesByModule, pageRegistry } from '../config/pages';

export function createEmptyActionGrant() {
  return PERMISSION_ACTIONS.reduce((accumulator, action) => {
    accumulator[action] = false;
    return accumulator;
  }, {});
}

export function normalizePermissionSet(permissionSet = {}) {
  const modules = Object.keys(moduleRegistry).reduce((accumulator, moduleKey) => {
    const moduleValue = permissionSet.modules?.[moduleKey];
    accumulator[moduleKey] = {
      access: Boolean(
        typeof moduleValue === 'object' ? moduleValue?.access : moduleValue
      ),
    };
    return accumulator;
  }, {});

  const pages = Object.keys(pageRegistry).reduce((accumulator, pageKey) => {
    const pageValue = permissionSet.pages?.[pageKey];
    accumulator[pageKey] = PERMISSION_ACTIONS.reduce((grant, action) => {
      grant[action] = Boolean(pageValue?.[action]);
      return grant;
    }, {});
    return accumulator;
  }, {});

  return {
    modules,
    pages,
    adminScopes: {
      canManageUsers: Boolean(permissionSet.adminScopes?.canManageUsers),
      canManageRoles: Boolean(permissionSet.adminScopes?.canManageRoles),
      manageableRoleIds: Array.from(
        new Set(permissionSet.adminScopes?.manageableRoleIds || [])
      ),
      moduleKeys: Array.from(new Set(permissionSet.adminScopes?.moduleKeys || [])),
    },
  };
}

export function mergePermissionSets(...permissionSets) {
  const merged = normalizePermissionSet();

  permissionSets
    .filter(Boolean)
    .map((permissionSet) => normalizePermissionSet(permissionSet))
    .forEach((permissionSet) => {
      Object.keys(permissionSet.modules).forEach((moduleKey) => {
        merged.modules[moduleKey].access =
          merged.modules[moduleKey].access || permissionSet.modules[moduleKey].access;
      });

      Object.keys(permissionSet.pages).forEach((pageKey) => {
        PERMISSION_ACTIONS.forEach((action) => {
          merged.pages[pageKey][action] =
            merged.pages[pageKey][action] || permissionSet.pages[pageKey][action];
        });
      });

      merged.adminScopes.canManageUsers =
        merged.adminScopes.canManageUsers || permissionSet.adminScopes.canManageUsers;
      merged.adminScopes.canManageRoles =
        merged.adminScopes.canManageRoles || permissionSet.adminScopes.canManageRoles;
      merged.adminScopes.manageableRoleIds = Array.from(
        new Set([
          ...merged.adminScopes.manageableRoleIds,
          ...permissionSet.adminScopes.manageableRoleIds,
        ])
      );
      merged.adminScopes.moduleKeys = Array.from(
        new Set([
          ...merged.adminScopes.moduleKeys,
          ...permissionSet.adminScopes.moduleKeys,
        ])
      );
    });

  return merged;
}

export function resolveUserPermissions(user, roles = []) {
  if (!user) {
    return normalizePermissionSet();
  }

  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const rolePermissions = (user.roleIds || [])
    .map((roleId) => rolesById.get(roleId)?.permissions)
    .filter(Boolean);

  return mergePermissionSets(...rolePermissions, user.permissionOverrides);
}

export function hasModuleAccess(access, moduleKey) {
  return Boolean(access?.modules?.[moduleKey]?.access);
}

export function hasPagePermission(access, pageKey, action = 'view') {
  const pageDefinition = pageRegistry[pageKey];
  if (!pageDefinition) {
    return false;
  }

  return (
    hasModuleAccess(access, pageDefinition.moduleKey) &&
    Boolean(access?.pages?.[pageKey]?.[action])
  );
}

export function getAccessiblePages(access, moduleKey) {
  return getPagesByModule(moduleKey).filter((page) =>
    hasPagePermission(access, page.key, 'view')
  );
}

export function getDefaultRouteForAccess(access) {
  const accessibleHrPages = getAccessiblePages(access, MODULES.HR_MODULE);
  if (accessibleHrPages.length > 0) {
    return accessibleHrPages[0].route;
  }

  if (hasPagePermission(access, PAGE_KEYS.ADMIN, 'view')) {
    return pageRegistry[PAGE_KEYS.ADMIN].route;
  }

  return '/forbidden';
}

export function canManageUsers(access) {
  return Boolean(
    access?.adminScopes?.canManageUsers && hasPagePermission(access, PAGE_KEYS.ADMIN, 'view')
  );
}

export function canManageRoles(access) {
  return Boolean(
    access?.adminScopes?.canManageRoles && hasPagePermission(access, PAGE_KEYS.ADMIN, 'view')
  );
}

export function getManageableRoleIds(access) {
  return access?.adminScopes?.manageableRoleIds || [];
}

export function canAssignRoleIds(access, roleIds) {
  const manageableRoleIds = new Set(getManageableRoleIds(access));
  return roleIds.every((roleId) => manageableRoleIds.has(roleId));
}

export function canManageTargetUser(access, actorUserId, targetUser) {
  if (!targetUser || !canManageUsers(access) || targetUser.id === actorUserId) {
    return false;
  }

  return canAssignRoleIds(access, targetUser.roleIds || []);
}

export function getVisibleUsersForActor(actor, users = [], roles = []) {
  if (!actor) {
    return [];
  }

  const access = resolveUserPermissions(actor, roles);
  if (canManageRoles(access)) {
    return users;
  }

  const manageableRoleIds = new Set(getManageableRoleIds(access));
  return users.filter(
    (user) =>
      user.id === actor.id ||
      (user.roleIds || []).every((roleId) => manageableRoleIds.has(roleId))
  );
}

export function getManageableRolesForActor(actor, roles = []) {
  if (!actor) {
    return [];
  }

  const access = resolveUserPermissions(actor, roles);
  if (canManageRoles(access)) {
    return roles;
  }

  const manageableRoleIds = new Set(getManageableRoleIds(access));
  return roles.filter((role) => manageableRoleIds.has(role.id));
}

export function getAccessibleModules(access) {
  return Object.keys(moduleRegistry)
    .filter((moduleKey) => hasModuleAccess(access, moduleKey))
    .map((moduleKey) => moduleRegistry[moduleKey]);
}
