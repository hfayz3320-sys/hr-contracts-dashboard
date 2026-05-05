import { PERMISSION_ACTIONS } from './actions';
import { MODULES } from './modules';
import { PAGE_KEYS, pageRegistry } from './pages';

function allow(actions) {
  return PERMISSION_ACTIONS.reduce((accumulator, action) => {
    accumulator[action] = actions.includes(action);
    return accumulator;
  }, {});
}

function createPagePermissions(definitions) {
  return Object.keys(pageRegistry).reduce((accumulator, pageKey) => {
    accumulator[pageKey] = allow(definitions[pageKey] || []);
    return accumulator;
  }, {});
}

function createModuleAccess(definitions) {
  return Object.values(MODULES).reduce((accumulator, moduleKey) => {
    accumulator[moduleKey] = {
      access: Boolean(definitions[moduleKey]),
    };
    return accumulator;
  }, {});
}

export const roleRegistry = [
  {
    id: 'SuperAdmin',
    name: 'SuperAdmin',
    description: 'Full system-wide administration across modules, roles, pages, and users.',
    permissions: {
      modules: createModuleAccess({
        [MODULES.SYSTEM_MODULE]: true,
        [MODULES.HR_MODULE]: true,
      }),
      pages: createPagePermissions(
        Object.keys(pageRegistry).reduce((accumulator, pageKey) => {
          accumulator[pageKey] = PERMISSION_ACTIONS;
          return accumulator;
        }, {})
      ),
      adminScopes: {
        canManageUsers: true,
        canManageRoles: true,
        manageableRoleIds: ['SuperAdmin', 'HRAdmin', 'HRUser'],
        moduleKeys: [MODULES.SYSTEM_MODULE, MODULES.HR_MODULE],
      },
    },
  },
  {
    id: 'HRAdmin',
    name: 'HRAdmin',
    description: 'HR module administrator with user management limited to HR users.',
    permissions: {
      modules: createModuleAccess({
        [MODULES.SYSTEM_MODULE]: true,
        [MODULES.HR_MODULE]: true,
      }),
      pages: createPagePermissions({
        [PAGE_KEYS.ADMIN]: ['view'],
        [PAGE_KEYS.EXECUTIVE]: ['view', 'export'],
        [PAGE_KEYS.TALENT]: ['view', 'export'],
        [PAGE_KEYS.RISK]: ['view', 'export'],
        [PAGE_KEYS.COMPENSATION]: ['view', 'export'],
        [PAGE_KEYS.DATA_QUALITY]: ['view', 'export'],
        [PAGE_KEYS.EMPLOYEES]: ['view', 'create', 'edit', 'delete', 'export', 'import', 'review'],
        [PAGE_KEYS.INSURANCE]: ['view', 'edit', 'export', 'import', 'review'],
      }),
      adminScopes: {
        canManageUsers: true,
        canManageRoles: false,
        manageableRoleIds: ['HRUser'],
        moduleKeys: [MODULES.HR_MODULE],
      },
    },
  },
  {
    id: 'HRUser',
    name: 'HRUser',
    description: 'Standard HR analyst with limited access to approved HR pages.',
    permissions: {
      modules: createModuleAccess({
        [MODULES.HR_MODULE]: true,
      }),
      pages: createPagePermissions({
        [PAGE_KEYS.EXECUTIVE]: ['view'],
        [PAGE_KEYS.TALENT]: ['view'],
        [PAGE_KEYS.EMPLOYEES]: ['view', 'export'],
        [PAGE_KEYS.INSURANCE]: ['view'],
      }),
      adminScopes: {
        canManageUsers: false,
        canManageRoles: false,
        manageableRoleIds: [],
        moduleKeys: [],
      },
    },
  },
];
