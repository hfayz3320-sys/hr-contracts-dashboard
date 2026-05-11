/**
 * GET /api/me — the authenticated user, resolved from CF Access JWT.
 *
 * Auth model:
 *   1. `requireAuth` middleware verifies the CF Access JWT and sets
 *      `c.var.actorEmail` to the lowercase JWT email.
 *   2. We look that email up in `app_users`.
 *   3. Bootstrap rule: if the email is in `ADMIN_EMAILS` env but NOT in
 *      `app_users`, auto-create them as `admin` and write an audit row.
 *      This keeps the wrangler.toml ADMIN_EMAILS list authoritative for
 *      initial provisioning while letting day-2 management happen in the
 *      database without requiring a redeploy.
 *   4. If the user is in `app_users` with status='disabled', return 403 —
 *      Access let them in but the app says no.
 *   5. If the user is neither in `ADMIN_EMAILS` nor in `app_users`, return
 *      403 — Access let them in but no app role has been provisioned.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import { requireAuth } from '../lib/auth';
import {
  findAppUserByEmail,
  insertAppUser,
  touchLastLogin,
  type AppUserRole,
} from '../db/repo-users';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';

export const meRoutes = new Hono<AppContext>();

meRoutes.use('/api/me', requireAuth);

function isInAdminBootstrap(env: { ADMIN_EMAILS?: string }, email: string): boolean {
  const list = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

function deriveDisplayName(email: string): string {
  const local = email.split('@')[0] ?? email;
  // Best-effort: "hamza.f" → "Hamza F", "hfayz3320" → "Hfayz3320"
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

meRoutes.get('/api/me', async (c) => {
  const actorEmail = c.var.actorEmail;
  if (!actorEmail) {
    return c.json({ error: 'UNAUTHENTICATED', message: 'No actor email on context' }, 401);
  }

  let user = await findAppUserByEmail(c.env, actorEmail);

  // Auto-bootstrap admins listed in ADMIN_EMAILS.
  if (!user && isInAdminBootstrap(c.env, actorEmail)) {
    const displayName = deriveDisplayName(actorEmail);
    user = await insertAppUser(c.env, {
      id: newId('usr'),
      email: actorEmail,
      displayName,
      role: 'admin',
      status: 'active',
      createdBy: 'system:bootstrap',
    });
    await writeAudit(c.env, {
      actor: 'system:bootstrap',
      action: 'app_user.bootstrap',
      target: user.id,
      status: 'ok',
      details: `Auto-provisioned admin ${actorEmail} from ADMIN_EMAILS allow-list.`,
    });
  }

  // No app role provisioned → Access let them in but the app rejects them.
  if (!user) {
    await writeAudit(c.env, {
      actor: actorEmail,
      action: 'app_user.unprovisioned',
      target: actorEmail,
      status: 'warning',
      details: 'Authenticated by Access but no app_users row and not in ADMIN_EMAILS.',
    });
    return c.json(
      {
        error: 'FORBIDDEN',
        message:
          'You are authenticated but have not been granted any role in this app. ' +
          'Contact an administrator to be added.',
      },
      403,
    );
  }

  // Disabled in-app even though Access lets them through.
  if (user.status === 'disabled' || user.role === 'disabled') {
    return c.json(
      { error: 'FORBIDDEN', message: 'Your account has been disabled.' },
      403,
    );
  }

  // Touch last_login_at (best-effort, never blocks).
  await touchLastLogin(c.env, actorEmail).catch(() => undefined);

  const isAdmin: boolean = user.role === 'admin';
  const role: AppUserRole = user.role;

  return c.json({
    email: user.email,
    displayName: user.displayName ?? deriveDisplayName(user.email),
    role,
    isAdmin,
    status: user.status,
    authProvider: 'cloudflare_access' as const,
    lastLoginAt: user.lastLoginAt,
  });
});
