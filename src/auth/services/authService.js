import { permissionService } from '../../security/services/permissionService';
import { readSecurityState, writeSecurityState } from '../../security/services/securityRepository';
import { verifyPassword } from '../../security/utils/passwords';

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveSessionUser(session, users) {
  if (!session?.userId) {
    return null;
  }

  const user = users.find((item) => item.id === session.userId);
  if (!user || user.isActive === false) {
    return null;
  }

  return user;
}

function buildSnapshot(state, session) {
  const currentUser = resolveSessionUser(session, state.users);

  return {
    session: currentUser ? session : null,
    currentUser,
    users: state.users,
    roles: state.roles,
    access: currentUser
      ? permissionService.resolveUserAccess(currentUser, state.roles)
      : permissionService.normalizePermissionSet(),
  };
}

export const authService = {
  async bootstrapSession(session) {
    const state = await readSecurityState();
    return buildSnapshot(state, session);
  },

  async login({ identifier, password }) {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    const state = await readSecurityState();

    const user = state.users.find(
      (candidate) =>
        normalizeIdentifier(candidate.username) === normalizedIdentifier ||
        normalizeIdentifier(candidate.email) === normalizedIdentifier
    );

    if (!user || !user.isActive) {
      throw new Error('Invalid credentials.');
    }

    const passwordValid = await verifyPassword(password, user.password);
    if (!passwordValid) {
      throw new Error('Invalid credentials.');
    }

    const lastLoginAt = new Date().toISOString();
    const updatedState = await writeSecurityState((currentState) => {
      currentState.users = currentState.users.map((candidate) =>
        candidate.id === user.id
          ? {
              ...candidate,
              lastLoginAt,
              updatedAt: lastLoginAt,
            }
          : candidate
      );

      return currentState;
    });

    const nextSession = {
      userId: user.id,
      issuedAt: lastLoginAt,
      sessionId: crypto.randomUUID(),
    };

    return buildSnapshot(updatedState, nextSession);
  },

  async refresh(session) {
    const state = await readSecurityState();
    return buildSnapshot(state, session);
  },
};
