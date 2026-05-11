/**
 * app_users repository — in-app role & status, separate from Access edge.
 *
 * Match key is always lowercase(email). The JWT-verified email is the source
 * of truth; this repo never accepts an unvalidated header.
 */
import type { Env } from '../env';

export type AppUserRole = 'admin' | 'hr_manager' | 'viewer' | 'disabled';
export type AppUserStatus = 'active' | 'disabled';

export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: AppUserRole;
  status: AppUserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

type AppUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: AppUserRole;
  status: AppUserStatus;
  last_login_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};

function rowToUser(r: AppUserRow): AppUser {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    status: r.status,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function findAppUserByEmail(env: Env, email: string): Promise<AppUser | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM app_users WHERE LOWER(email) = LOWER(?)`)
    .bind(email)
    .first<AppUserRow>();
  return r ? rowToUser(r) : null;
}

export async function getAppUserById(env: Env, id: string): Promise<AppUser | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM app_users WHERE id = ?`)
    .bind(id)
    .first<AppUserRow>();
  return r ? rowToUser(r) : null;
}

export async function listAppUsers(env: Env): Promise<AppUser[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM app_users ORDER BY email ASC`)
    .all<AppUserRow>();
  return (rows.results ?? []).map(rowToUser);
}

export type CreateAppUserInput = {
  id: string;
  email: string;
  displayName?: string | null;
  role: AppUserRole;
  status?: AppUserStatus;
  createdBy: string;
};

export async function insertAppUser(env: Env, input: CreateAppUserInput): Promise<AppUser> {
  await env.DB
    .prepare(
      `INSERT INTO app_users
         (id, email, display_name, role, status, created_by, updated_by)
       VALUES (?, LOWER(?), ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.email,
      input.displayName ?? null,
      input.role,
      input.status ?? 'active',
      input.createdBy,
      input.createdBy,
    )
    .run();
  const created = await findAppUserByEmail(env, input.email);
  if (!created) throw new Error(`Failed to insert app_user ${input.email}`);
  return created;
}

export async function updateAppUserFields(
  env: Env,
  id: string,
  patch: Partial<{ displayName: string | null; role: AppUserRole; status: AppUserStatus }>,
  updatedBy: string,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.displayName !== undefined) { sets.push('display_name = ?'); binds.push(patch.displayName); }
  if (patch.role !== undefined)        { sets.push('role = ?');         binds.push(patch.role); }
  if (patch.status !== undefined)      { sets.push('status = ?');       binds.push(patch.status); }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  sets.push('updated_by = ?');
  binds.push(updatedBy, id);
  await env.DB
    .prepare(`UPDATE app_users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

export async function touchLastLogin(env: Env, email: string): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE app_users
       SET last_login_at = datetime('now')
       WHERE LOWER(email) = LOWER(?)`,
    )
    .bind(email)
    .run();
}
