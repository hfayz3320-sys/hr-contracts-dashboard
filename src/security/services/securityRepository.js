import { roleRegistry } from '../config/roles';
import { seedUsers } from '../seeds/securitySeeds';
import { createPasswordRecord } from '../utils/passwords';
import { mergePermissionSets, normalizePermissionSet } from '../utils/permissions';

const STORAGE_KEY = 'hr-security-state-v1';
const STORAGE_VERSION = 1;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function loadRawState() {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn('Failed to parse security state, reseeding mock data.', error);
    return null;
  }
}

function saveRawState(state) {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function normalizeUser(user) {
  return {
    id: user.id,
    username: String(user.username || '').trim(),
    email: String(user.email || '').trim().toLowerCase(),
    displayName: String(user.displayName || '').trim(),
    roleIds: Array.from(new Set(user.roleIds || [])),
    isActive: user.isActive !== false,
    password: user.password || null,
    lastLoginAt: user.lastLoginAt || null,
    lastPasswordResetAt: user.lastPasswordResetAt || null,
    createdAt: user.createdAt || now(),
    updatedAt: user.updatedAt || now(),
    permissionOverrides: normalizePermissionSet(user.permissionOverrides),
  };
}

function normalizeRoles(rawRoles = []) {
  const seedRolesById = new Map(roleRegistry.map((role) => [role.id, role]));

  rawRoles.forEach((rawRole) => {
    const seededRole = seedRolesById.get(rawRole.id);
    if (seededRole) {
      seedRolesById.set(rawRole.id, {
        ...seededRole,
        ...rawRole,
        permissions: mergePermissionSets(
          seededRole.permissions,
          rawRole.permissions || {}
        ),
      });
      return;
    }

    seedRolesById.set(rawRole.id, {
      ...rawRole,
      permissions: normalizePermissionSet(rawRole.permissions),
    });
  });

  return Array.from(seedRolesById.values());
}

function normalizeState(rawState) {
  return {
    version: STORAGE_VERSION,
    roles: normalizeRoles(rawState.roles || []),
    users: Array.isArray(rawState.users) ? rawState.users.map(normalizeUser) : [],
    meta: {
      seededAt: rawState.meta?.seededAt || now(),
      updatedAt: rawState.meta?.updatedAt || now(),
    },
  };
}

async function buildSeedState() {
  const seededAt = now();

  const users = await Promise.all(
    seedUsers.map(async (seedUser) => ({
      id: seedUser.id,
      username: seedUser.username,
      email: seedUser.email,
      displayName: seedUser.displayName,
      roleIds: seedUser.roleIds,
      isActive: seedUser.isActive,
      password: await createPasswordRecord(seedUser.plainTextPassword),
      lastLoginAt: null,
      lastPasswordResetAt: seededAt,
      createdAt: seededAt,
      updatedAt: seededAt,
      permissionOverrides: normalizePermissionSet(),
    }))
  );

  return {
    version: STORAGE_VERSION,
    roles: normalizeRoles(roleRegistry),
    users,
    meta: {
      seededAt,
      updatedAt: seededAt,
    },
  };
}

export async function ensureSecurityState() {
  const existingState = loadRawState();
  if (existingState?.version === STORAGE_VERSION) {
    const normalizedState = normalizeState(existingState);
    saveRawState(normalizedState);
    return deepClone(normalizedState);
  }

  const seedState = await buildSeedState();
  saveRawState(seedState);
  return deepClone(seedState);
}

export async function readSecurityState() {
  return ensureSecurityState();
}

export async function writeSecurityState(updater) {
  const currentState = await ensureSecurityState();
  const nextCandidate =
    typeof updater === 'function' ? await updater(deepClone(currentState)) : updater;
  const nextState = normalizeState({
    ...nextCandidate,
    version: STORAGE_VERSION,
    meta: {
      ...(currentState.meta || {}),
      ...(nextCandidate.meta || {}),
      updatedAt: now(),
    },
  });

  saveRawState(nextState);
  return deepClone(nextState);
}
