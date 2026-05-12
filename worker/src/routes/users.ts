/**
 * Users / Admin CRUD routes.
 *
 * The app_users table sits BEHIND Cloudflare Access: only emails the Access
 * policy allows can even reach the worker. This module then determines what
 * those authenticated users can DO inside the app via the `role` column.
 *
 *   GET    /api/users                       — list (admin-only)
 *   POST   /api/users                       — create (admin-only)
 *   PATCH  /api/users/:id                   — update name/role/status (admin-only)
 *   POST   /api/users/:id/deactivate        — soft-disable (admin-only)
 *
 * Every mutation writes an audit_events row.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  listAppUsers,
  insertAppUser,
  updateAppUserFields,
  getAppUserById,
  findAppUserByEmail,
} from '../db/repo-users';
import { requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import {
  appUserCreateRequest,
  appUserPatchRequest,
  appUserDeactivateRequest,
} from '@shared/api-contract';

export const userRoutes = new Hono<AppContext>();

// Block self-lockout: an admin trying to demote/disable their own row needs
// a second admin to do it. This avoids the "I clicked the wrong thing and
// now nobody can manage users" scenario.
async function preventSelfChange(c: import('hono').Context<AppContext>, targetId: string): Promise<Response | null> {
  const actorEmail = (await getActorEmail(c)) ?? '';
  const target = await getAppUserById(c.env, targetId);
  if (target && target.email.toLowerCase() === actorEmail.toLowerCase()) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Admins cannot change or deactivate their own user row. Ask another admin.' },
      400,
    );
  }
  return null;
}

userRoutes.get('/api/users', requireAdmin, async (c) => {
  const items = await listAppUsers(c.env);
  return c.json({ items, total: items.length });
});

userRoutes.post('/api/users', requireAdmin, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = appUserCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid create payload', issues: parsed.error.issues }, 400);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const existing = await findAppUserByEmail(c.env, parsed.data.email);
  if (existing) {
    return c.json({ error: 'CONFLICT', message: `User ${parsed.data.email} already exists` }, 409);
  }
  const user = await insertAppUser(c.env, {
    id: newId('usr'),
    email: parsed.data.email.toLowerCase(),
    displayName: parsed.data.displayName ?? null,
    role: parsed.data.role,
    status: 'active',
    // Phase 10 — link to an employee record when supplied. Worker writes
    // it to app_users.employee_id; the row becomes queryable via
    // findAppUserByEmployeeId.
    employeeId: parsed.data.employeeId ?? null,
    createdBy: actor,
  });
  await writeAudit(c.env, {
    actor,
    action: 'user.created',
    target: user.id,
    status: 'ok',
    details:
      `Created ${user.email} as ${user.role}` +
      (parsed.data.employeeId ? ` (linked to employee ${parsed.data.employeeId})` : ''),
  });
  return c.json({ ok: true as const, user });
});

userRoutes.patch('/api/users/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const raw = await c.req.json().catch(() => null);
  const parsed = appUserPatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid patch payload', issues: parsed.error.issues }, 400);
  }
  // Self-change prevention only applies to role/status changes — display
  // name updates of own row are harmless.
  if (parsed.data.role !== undefined || parsed.data.status !== undefined) {
    const block = await preventSelfChange(c, id);
    if (block) return block;
  }
  const before = await getAppUserById(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: `User ${id} not found` }, 404);
  const actor = (await getActorEmail(c)) ?? 'unknown';

  await updateAppUserFields(c.env, id, parsed.data, actor);
  const after = await getAppUserById(c.env, id);
  if (!after) {
    return c.json({ error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' }, 500);
  }

  // Specialized audit actions for role + status changes.
  if (parsed.data.role && parsed.data.role !== before.role) {
    await writeAudit(c.env, {
      actor,
      action: 'user.role_changed',
      target: id,
      status: 'ok',
      details: `${before.email}: ${before.role} → ${after.role}`,
    });
  }
  if (parsed.data.status && parsed.data.status !== before.status) {
    await writeAudit(c.env, {
      actor,
      action: parsed.data.status === 'disabled' ? 'user.deactivated' : 'user.reactivated',
      target: id,
      status: 'ok',
      details: `${before.email}: ${before.status} → ${after.status}`,
    });
  }
  if (parsed.data.displayName !== undefined && parsed.data.displayName !== before.displayName) {
    await writeAudit(c.env, {
      actor,
      action: 'user.updated',
      target: id,
      status: 'ok',
      details: `${before.email}: displayName updated`,
    });
  }

  return c.json({ ok: true as const, user: after });
});

userRoutes.post('/api/users/:id/deactivate', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = appUserDeactivateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid deactivate payload' }, 400);
  }
  const block = await preventSelfChange(c, id);
  if (block) return block;
  const before = await getAppUserById(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: `User ${id} not found` }, 404);
  const actor = (await getActorEmail(c)) ?? 'unknown';

  await updateAppUserFields(c.env, id, { status: 'disabled' }, actor);
  const after = await getAppUserById(c.env, id);
  await writeAudit(c.env, {
    actor,
    action: 'user.deactivated',
    target: id,
    status: 'ok',
    details: `${before.email} deactivated${parsed.data.reason ? ` · reason: ${parsed.data.reason}` : ''}`,
  });
  return c.json({ ok: true as const, user: after });
});
