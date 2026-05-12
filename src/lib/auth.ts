/**
 * FE-side role helpers.
 *
 * Authoritative auth is the Worker (CF Access JWT + app_users lookup). The
 * FE only uses these helpers to hide nav and route into a friendly 403
 * surface before the network call is even made — the server enforces the
 * actual rules.
 *
 * Permission policy (canonical for the whole app):
 * ------------------------------------------------
 *   role        | reads (employee, contracts, ...)        | writes (mutations)
 *   ------------+------------------------------------------+-------------------
 *   admin       | yes                                      | YES — all
 *   hr_manager  | yes — INCLUDING admin module pages       | NO  — read-only
 *   viewer      | basic reads only (no admin pages, no DQ) | NO
 *   disabled    | no                                       | NO
 *
 * `admin` is the ONLY role that passes the Worker's `requireAdmin`
 * middleware (which checks the `ADMIN_EMAILS` env allow-list — and the
 * /api/me bootstrap auto-creates those rows as role='admin'). Every
 * write endpoint, including the eight Employee 360 actions, is behind
 * `requireAdmin`. hr_manager users see disabled write buttons with a
 * tooltip; the UI never lies about what the server will accept.
 *
 * Phase 8 admin module:
 *   `admin` and `hr_manager` are the two roles allowed into /admin/*.
 *   Everyone else (viewer / disabled / unauthenticated) sees the
 *   ForbiddenPage and never reaches the wizard or any mutation.
 */
import type { MeResponse } from '@shared/api-contract';

export type AppRole = MeResponse['role'];

/** True iff the user can enter the admin module. */
export function canAccessAdmin(me: Pick<MeResponse, 'role' | 'isAdmin' | 'status'> | undefined | null): boolean {
  if (!me) return false;
  if (me.status !== 'active') return false;
  if (me.isAdmin) return true;
  return me.role === 'hr_manager';
}

/** True iff the user can perform admin-only mutations (write actions). */
export function canPerformAdminWrites(me: Pick<MeResponse, 'role' | 'isAdmin' | 'status'> | undefined | null): boolean {
  if (!me) return false;
  if (me.status !== 'active') return false;
  // Admin-only on the server; hr_manager has read but not write.
  return me.isAdmin === true;
}
