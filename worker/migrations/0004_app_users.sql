-- 0004_app_users.sql — Phase 2C: in-app role management.
--
-- Cloudflare Access controls *who* can enter the app (gated at the edge by
-- IdP + Access policy). This table controls *what* they can do once inside.
-- The two are deliberately separate: revoking app access by setting a user
-- to 'disabled' here does NOT require touching the Access policy, and the
-- Access policy can include emails who do not yet exist in app_users (they
-- are auto-bootstrapped by GET /api/me on first authenticated call).
--
-- Match key is lowercase(email). The verified JWT email is always
-- lowercased before lookup.
--
-- Roles:
--   admin      — full access; imports/commits/user management/audit
--   hr_manager — view employees/contracts/insurance; dry-run only
--   viewer     — read-only
--   disabled   — authenticated by Access but rejected by the app (403)
--
-- created_by / updated_by store the actor email at the time of the change.
-- Bootstrap rows (created from ADMIN_EMAILS on first /api/me hit) have
-- created_by = 'system:bootstrap' so the provenance is auditable.

CREATE TABLE IF NOT EXISTS app_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin','hr_manager','viewer','disabled')) DEFAULT 'viewer',
  status        TEXT NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active',
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON app_users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_app_users_role   ON app_users (role);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users (status);
