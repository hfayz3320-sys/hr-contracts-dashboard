/**
 * Pure route-parent rule table — Phase 9.
 *
 * Split from the PathBackButton component file so react-refresh doesn't
 * complain about a non-component export and so it can be imported by
 * tests / other helpers without pulling React.
 *
 * Rules:
 *   /admin                         → null (top of admin module)
 *   /admin/<anything>              → /admin
 *   /employees/<id> (any segments) → /employees
 *   anything else                  → null
 *
 * Add a new admin sub-route? Nothing to change — the prefix rule covers it.
 */
import { routes } from './routes';

export function parentPathFor(pathname: string): string | null {
  if (pathname === routes.admin) return null;
  if (pathname.startsWith(routes.admin + '/')) return routes.admin;
  if (
    pathname.startsWith(routes.employees + '/') &&
    pathname !== routes.employees
  ) {
    return routes.employees;
  }
  return null;
}
