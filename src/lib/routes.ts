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
  // Phase 8 — Admin module sub-routes. All gated by AdminGuard (admin or
  // hr_manager only). Legacy /imports, /review, /users keep working for
  // backward compatibility; nav points at the /admin/* variants.
  adminImport: '/admin/import',
  adminReview: '/admin/review',
  adminImportHistory: '/admin/import-history',
  adminUsers: '/admin/users',
  adminConfig: '/admin/config',
  adminDataQuality: '/admin/data-quality',
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
