/**
 * FE-side role helpers.
 *
 * Authoritative auth is the Worker (CF Access JWT + app_users lookup). The
 * FE only uses these helpers to hide nav and route into a friendly 403
 * surface before the network call is even made — the server enforces the
 * actual rules.
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
