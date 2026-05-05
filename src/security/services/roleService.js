import { permissionService } from './permissionService';
import { readSecurityState, writeSecurityState } from './securityRepository';

export const roleService = {
  async updateRolePermissions(actor, roleId, permissions) {
    const snapshot = await readSecurityState();
    const actorAccess = permissionService.resolveUserAccess(actor, snapshot.roles);

    if (!permissionService.canManageRoles(actorAccess)) {
      throw new Error('You are not authorized to update role permissions.');
    }

    const targetRole = snapshot.roles.find((role) => role.id === roleId);
    if (!targetRole) {
      throw new Error('Role not found.');
    }

    const normalizedPermissions = permissionService.normalizePermissionSet(permissions);

    await writeSecurityState((currentState) => {
      currentState.roles = currentState.roles.map((role) =>
        role.id === roleId
          ? {
              ...role,
              permissions: normalizedPermissions,
            }
          : role
      );
      return currentState;
    });
  },
};
