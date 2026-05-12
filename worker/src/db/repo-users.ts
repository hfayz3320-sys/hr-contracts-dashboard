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
  // Phase 10 — FK to employees(id). Null when the user is not linked to
  // an employee record (e.g. external admin).
  employeeId: string | null;
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
  // Migration 0007 added this column. Older D1 dumps (pre-0007) will
  // simply not return it; we coalesce to null in `rowToUser`.
  employee_id?: string | null;
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
    employeeId: r.employee_id ?? null,
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
  // Phase 10 — optional FK to employees(id). When set, the app_users row
  // becomes the canonical "login for this employee" link.
  employeeId?: string | null;
  createdBy: string;
};

export async function insertAppUser(env: Env, input: CreateAppUserInput): Promise<AppUser> {
  await env.DB
    .prepare(
      `INSERT INTO app_users
         (id, email, display_name, role, status, employee_id, created_by, updated_by)
       VALUES (?, LOWER(?), ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.email,
      input.displayName ?? null,
      input.role,
      input.status ?? 'active',
      input.employeeId ?? null,
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
  patch: Partial<{
    displayName: string | null;
    role: AppUserRole;
    status: AppUserStatus;
    employeeId: string | null;
  }>,
  updatedBy: string,
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.displayName !== undefined) { sets.push('display_name = ?'); binds.push(patch.displayName); }
  if (patch.role !== undefined)        { sets.push('role = ?');         binds.push(patch.role); }
  if (patch.status !== undefined)      { sets.push('status = ?');       binds.push(patch.status); }
  if (patch.employeeId !== undefined)  { sets.push('employee_id = ?');  binds.push(patch.employeeId); }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  sets.push('updated_by = ?');
  binds.push(updatedBy, id);
  await env.DB
    .prepare(`UPDATE app_users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
}

/**
 * Phase 10 — find the app_users row linked to a specific employee, if any.
 * Returns null if no app_user has employee_id = :employeeId. Used by the
 * Employee 360 endpoint to surface "Linked user" status.
 */
export async function findAppUserByEmployeeId(
  env: Env,
  employeeId: string,
): Promise<AppUser | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM app_users WHERE employee_id = ? LIMIT 1`)
    .bind(employeeId)
    .first<AppUserRow>();
  return r ? rowToUser(r) : null;
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
