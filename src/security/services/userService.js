import { permissionService } from './permissionService';
import { readSecurityState, writeSecurityState } from './securityRepository';
import { createPasswordRecord } from '../utils/passwords';

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
}

function assertUserManagementAccess(actor, roles) {
  const actorAccess = permissionService.resolveUserAccess(actor, roles);
  if (!permissionService.canManageUsers(actorAccess)) {
    throw new Error('You are not authorized to manage users.');
  }
  return actorAccess;
}

function validateUserPayload(payload, allowPasswordOptional = false) {
  const errors = {};

  if (!String(payload.displayName || '').trim()) {
    errors.displayName = 'Display name is required.';
  }

  if (!/^[A-Za-z0-9._-]{3,30}$/.test(String(payload.username || '').trim())) {
    errors.username =
      'Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens.';
  }

  if (!validateEmail(String(payload.email || '').trim())) {
    errors.email = 'A valid email address is required.';
  }

  if (!Array.isArray(payload.roleIds) || payload.roleIds.length === 0) {
    errors.roleIds = 'At least one role must be assigned.';
  }

  if (!allowPasswordOptional) {
    if (!validatePassword(String(payload.password || ''))) {
      errors.password =
        'Password must be at least 8 characters and include upper, lower, number, and symbol.';
    }
  }

  return errors;
}

export const userService = {
  async createUser(actor, payload) {
    const snapshot = await readSecurityState();
    const actorAccess = assertUserManagementAccess(actor, snapshot.roles);

    const validationErrors = validateUserPayload(payload);
    if (Object.keys(validationErrors).length > 0) {
      const error = new Error('Validation failed.');
      error.validation = validationErrors;
      throw error;
    }

    if (!permissionService.canAssignRoleIds(actorAccess, payload.roleIds)) {
      throw new Error('You are not allowed to assign one or more selected roles.');
    }

    const normalizedUsername = String(payload.username).trim();
    const normalizedEmail = normalizeIdentifier(payload.email);

    const usernameTaken = snapshot.users.some(
      (user) => normalizeIdentifier(user.username) === normalizeIdentifier(normalizedUsername)
    );
    if (usernameTaken) {
      const error = new Error('Username already exists.');
      error.validation = { username: 'Username already exists.' };
      throw error;
    }

    const emailTaken = snapshot.users.some(
      (user) => normalizeIdentifier(user.email) === normalizedEmail
    );
    if (emailTaken) {
      const error = new Error('Email already exists.');
      error.validation = { email: 'Email already exists.' };
      throw error;
    }

    await writeSecurityState(async (currentState) => {
      const createdAt = new Date().toISOString();
      currentState.users.push({
        id: crypto.randomUUID(),
        username: normalizedUsername,
        email: normalizedEmail,
        displayName: String(payload.displayName).trim(),
        roleIds: Array.from(new Set(payload.roleIds)),
        isActive: payload.isActive !== false,
        password: await createPasswordRecord(payload.password),
        lastLoginAt: null,
        lastPasswordResetAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        permissionOverrides: payload.permissionOverrides || {
          modules: {},
          pages: {},
          adminScopes: {
            canManageUsers: false,
            canManageRoles: false,
            manageableRoleIds: [],
            moduleKeys: [],
          },
        },
      });

      return currentState;
    });
  },

  async updateUser(actor, userId, payload) {
    const snapshot = await readSecurityState();
    const actorAccess = assertUserManagementAccess(actor, snapshot.roles);
    const targetUser = snapshot.users.find((user) => user.id === userId);

    if (!targetUser) {
      throw new Error('User not found.');
    }

    if (!permissionService.canManageTargetUser(actorAccess, actor.id, targetUser)) {
      throw new Error('You are not authorized to edit this user.');
    }

    const validationErrors = validateUserPayload(payload, true);
    if (Object.keys(validationErrors).length > 0) {
      const error = new Error('Validation failed.');
      error.validation = validationErrors;
      throw error;
    }

    if (!permissionService.canAssignRoleIds(actorAccess, payload.roleIds)) {
      throw new Error('You are not allowed to assign one or more selected roles.');
    }

    const normalizedUsername = String(payload.username).trim();
    const normalizedEmail = normalizeIdentifier(payload.email);

    const usernameTaken = snapshot.users.some(
      (user) =>
        user.id !== userId &&
        normalizeIdentifier(user.username) === normalizeIdentifier(normalizedUsername)
    );
    if (usernameTaken) {
      const error = new Error('Username already exists.');
      error.validation = { username: 'Username already exists.' };
      throw error;
    }

    const emailTaken = snapshot.users.some(
      (user) => user.id !== userId && normalizeIdentifier(user.email) === normalizedEmail
    );
    if (emailTaken) {
      const error = new Error('Email already exists.');
      error.validation = { email: 'Email already exists.' };
      throw error;
    }

    await writeSecurityState((currentState) => {
      currentState.users = currentState.users.map((user) => {
        if (user.id !== userId) {
          return user;
        }

        return {
          ...user,
          username: normalizedUsername,
          email: normalizedEmail,
          displayName: String(payload.displayName).trim(),
          roleIds: Array.from(new Set(payload.roleIds)),
          isActive: payload.isActive !== false,
          updatedAt: new Date().toISOString(),
        };
      });

      return currentState;
    });
  },

  async setUserActive(actor, userId, isActive) {
    const snapshot = await readSecurityState();
    const actorAccess = assertUserManagementAccess(actor, snapshot.roles);
    const targetUser = snapshot.users.find((user) => user.id === userId);

    if (!targetUser) {
      throw new Error('User not found.');
    }

    if (!permissionService.canManageTargetUser(actorAccess, actor.id, targetUser)) {
      throw new Error('You are not authorized to update this user.');
    }

    await writeSecurityState((currentState) => {
      currentState.users = currentState.users.map((user) =>
        user.id === userId
          ? {
              ...user,
              isActive,
              updatedAt: new Date().toISOString(),
            }
          : user
      );
      return currentState;
    });
  },

  async resetPassword(actor, userId, password) {
    const snapshot = await readSecurityState();
    const actorAccess = assertUserManagementAccess(actor, snapshot.roles);
    const targetUser = snapshot.users.find((user) => user.id === userId);

    if (!targetUser) {
      throw new Error('User not found.');
    }

    if (!permissionService.canManageTargetUser(actorAccess, actor.id, targetUser)) {
      throw new Error('You are not authorized to reset this password.');
    }

    if (!validatePassword(String(password || ''))) {
      const error = new Error('Validation failed.');
      error.validation = {
        password:
          'Password must be at least 8 characters and include upper, lower, number, and symbol.',
      };
      throw error;
    }

    await writeSecurityState(async (currentState) => {
      currentState.users = await Promise.all(
        currentState.users.map(async (user) =>
          user.id === userId
            ? {
                ...user,
                password: await createPasswordRecord(password),
                lastPasswordResetAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : user
        )
      );
      return currentState;
    });
  },
};
