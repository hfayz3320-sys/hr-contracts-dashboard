/**
 * Admin identity helper.
 *
 * Production:
 *   - Identity comes from Cloudflare Access (set automatically by CF before
 *     the request reaches Pages/Worker). The FE does not send any identity
 *     headers. `getDevAdminEmail` and `setDevAdminEmail` are NO-OPS in prod.
 *   - `X-Dev-Admin-Email` is NEVER attached to admin requests, even if
 *     localStorage has a stale value from a previous dev session.
 *   - Admin UI affordances are shown by default; the server enforces gates.
 *
 * Development:
 *   - The dev admin toggle in `UserMenu` writes a chosen email to
 *     localStorage. The FE then attaches it as `X-Dev-Admin-Email` to admin
 *     requests so the Worker's auth middleware grants admin without a CF
 *     Access session.
 *   - When no dev admin email is set, admin UI is hidden — guests can read
 *     but not commit.
 */
import { isDev, isProd } from '@/lib/env';

const KEY = 'dev-admin-email';

export function getDevAdminEmail(): string | null {
  if (typeof window === 'undefined') return null;
  if (isProd) return null; // hard guard — never read this in production
  return window.localStorage.getItem(KEY);
}

export function setDevAdminEmail(email: string | null): void {
  if (typeof window === 'undefined') return;
  if (isProd) return; // hard guard — never persist this in production
  if (!email) {
    window.localStorage.removeItem(KEY);
  } else {
    window.localStorage.setItem(KEY, email);
  }
}

/**
 * Headers to attach to admin-only requests.
 * In production: NEVER send `X-Dev-Admin-Email` (the worker rejects it anyway,
 * but we belt-and-braces from the client side).
 * In development: send it when the dev admin toggle is set.
 */
export function adminHeaders(): Record<string, string> {
  if (!isDev) return {};
  const email = getDevAdminEmail();
  return email ? { 'X-Dev-Admin-Email': email } : {};
}

/**
 * Whether the FE should show admin-only UI (commit, resolve buttons).
 * Production: always true (server enforces; CF Access handles identity).
 * Development: only when a dev admin email is set (so guests can't commit
 * by accident and bypass the auth gate).
 */
export function isAdminUiEnabled(): boolean {
  if (!isDev) return true;
  return !!getDevAdminEmail();
}
