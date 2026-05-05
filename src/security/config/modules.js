export const MODULES = {
  SYSTEM_MODULE: 'SYSTEM_MODULE',
  HR_MODULE: 'HR_MODULE',
};

export const moduleRegistry = {
  [MODULES.SYSTEM_MODULE]: {
    key: MODULES.SYSTEM_MODULE,
    label: 'System Administration',
    navLabel: 'Administration',
    description: 'Core access control, users, roles, and security management.',
    order: 0,
  },
  [MODULES.HR_MODULE]: {
    key: MODULES.HR_MODULE,
    label: 'HR Module',
    navLabel: 'HR Module',
    description: 'HR contracts analytics, operational dashboards, and employee records.',
    order: 10,
  },
};
