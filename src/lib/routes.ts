export const routes = {
  dashboard: '/dashboard',
  employees: '/employees',
  contracts: '/contracts',
  insurance: '/insurance',
  imports: '/imports',
  importsNew: '/imports/new',
  review: '/review',
  users: '/users',
  admin: '/admin',
  settings: '/settings',
} as const;

export type RouteKey = keyof typeof routes;
