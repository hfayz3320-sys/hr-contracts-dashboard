import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { authService } from './services/authService';
import { roleService } from '../security/services/roleService';
import { userService } from '../security/services/userService';

const initialState = {
  initialized: false,
  bootstrapping: false,
  session: null,
  currentUser: null,
  users: [],
  roles: [],
  error: null,
};

export const useAuthStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      bootstrap: async () => {
        if (get().bootstrapping) {
          return;
        }

        set({ bootstrapping: true, error: null });

        try {
          const snapshot = await authService.bootstrapSession(get().session);
          set({
            initialized: true,
            bootstrapping: false,
            session: snapshot.session,
            currentUser: snapshot.currentUser,
            users: snapshot.users,
            roles: snapshot.roles,
          });
        } catch (error) {
          set({
            initialized: true,
            bootstrapping: false,
            session: null,
            currentUser: null,
            error: error.message,
          });
        }
      },

      refreshSecurity: async () => {
        const snapshot = await authService.refresh(get().session);
        set({
          initialized: true,
          session: snapshot.session,
          currentUser: snapshot.currentUser,
          users: snapshot.users,
          roles: snapshot.roles,
          error: null,
        });
        return snapshot;
      },

      login: async (credentials) => {
        const snapshot = await authService.login(credentials);
        set({
          initialized: true,
          session: snapshot.session,
          currentUser: snapshot.currentUser,
          users: snapshot.users,
          roles: snapshot.roles,
          error: null,
        });
        return snapshot;
      },

      logout: () => {
        set({
          session: null,
          currentUser: null,
          error: null,
        });
      },

      createUser: async (payload) => {
        await userService.createUser(get().currentUser, payload);
        return get().refreshSecurity();
      },

      updateUser: async (userId, payload) => {
        await userService.updateUser(get().currentUser, userId, payload);
        return get().refreshSecurity();
      },

      setUserActive: async (userId, isActive) => {
        await userService.setUserActive(get().currentUser, userId, isActive);
        return get().refreshSecurity();
      },

      resetUserPassword: async (userId, password) => {
        await userService.resetPassword(get().currentUser, userId, password);
        return get().refreshSecurity();
      },

      saveRolePermissions: async (roleId, permissions) => {
        await roleService.updateRolePermissions(get().currentUser, roleId, permissions);
        return get().refreshSecurity();
      },
    }),
    {
      name: 'hr-auth-session-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
      }),
    }
  )
);
