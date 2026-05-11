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

/**
 * Path builder for the Employee Profile page (A5.0 stub → A5.1 binding).
 * Use this everywhere instead of hard-coding the template, so future
 * changes to the URL shape are one-grep.
 */
export function employeeRoute(id: string): string {
  return `/employees/${encodeURIComponent(id)}`;
}
