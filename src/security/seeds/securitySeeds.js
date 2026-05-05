export const seedUsers = [
  {
    id: 'user-superadmin',
    username: 'superadmin',
    email: 'superadmin@midarabia.local',
    displayName: 'System Super Admin',
    roleIds: ['SuperAdmin'],
    isActive: true,
    plainTextPassword: 'Admin@123',
  },
  {
    id: 'user-hradmin',
    username: 'hradmin',
    email: 'hradmin@midarabia.local',
    displayName: 'HR Module Admin',
    roleIds: ['HRAdmin'],
    isActive: true,
    plainTextPassword: 'HrAdmin@123',
  },
  {
    id: 'user-hruser',
    username: 'hruser',
    email: 'hruser@midarabia.local',
    displayName: 'HR Module User',
    roleIds: ['HRUser'],
    isActive: true,
    plainTextPassword: 'HrUser@123',
  },
];
