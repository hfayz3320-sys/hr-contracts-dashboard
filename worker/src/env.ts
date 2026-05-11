/**
 * Cloudflare Worker bindings. Declared by `wrangler.toml`.
 *
 * Auth-related vars:
 *   ADMIN_EMAILS    — comma-separated allow-list (production must set)
 *   DEV_ADMIN_EMAIL — hint to the FE which email to suggest in the dev toggle.
 *                     The server NEVER falls back to it as an auth identity.
 *                     Must NOT be set in production [vars].
 *   CF_ACCESS_TEAM  — Cloudflare Access team domain (e.g. "myteam"); used to
 *                     fetch JWKS at https://${TEAM}.cloudflareaccess.com/...
 *   CF_ACCESS_AUD   — Application audience tag from CF Access; checked in JWT.
 *
 * R2 binding (raw uploaded files):
 *   RAW_FILES       — private R2 bucket for source PDFs/XLSX. In production,
 *                     committed rows MUST trace back to an object in this
 *                     bucket.
 */
export type Env = {
  DB: D1Database;
  RAW_FILES: R2Bucket;

  ENVIRONMENT: string;
  ALLOW_ORIGIN: string;

  ADMIN_EMAILS?: string;
  DEV_ADMIN_EMAIL?: string;
  CF_ACCESS_TEAM?: string;
  CF_ACCESS_AUD?: string;
};

export type AppContext = {
  Bindings: Env;
  Variables: {
    actorEmail?: string;
    actorIsAdmin?: boolean;
  };
};

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}

export function isDevelopment(env: Env): boolean {
  return env.ENVIRONMENT === 'development';
}
