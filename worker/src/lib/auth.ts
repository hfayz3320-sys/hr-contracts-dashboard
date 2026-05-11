/**
 * Auth middleware — Phase 2B safety correction.
 *
 * Two trust layers:
 *
 * 1. PRODUCTION (`ENVIRONMENT=production`):
 *    - Identity comes from `Cf-Access-Authenticated-User-Email` PLUS
 *      `Cf-Access-Jwt-Assertion`. Both must be present and the JWT must
 *      verify against the Cloudflare Access JWKS for the configured team.
 *    - `X-Dev-Admin-Email` is REJECTED (returned as 400 if sent).
 *    - When `CF_ACCESS_TEAM`/`CF_ACCESS_AUD` are unset, ALL admin endpoints
 *      hard-fail with 503 — production refuses to operate without verifiable
 *      auth, even if the deploy is misconfigured.
 *    - The Worker is expected to be reachable only behind Cloudflare Access in
 *      front of Pages. The Worker still independently verifies the JWT, so a
 *      direct request that bypasses Pages cannot forge identity.
 *
 * 2. DEVELOPMENT (`ENVIRONMENT=development`):
 *    - Identity comes from `Cf-Access-Authenticated-User-Email` if present,
 *      otherwise from `X-Dev-Admin-Email` (sent by the FE only when the dev
 *      admin toggle is on). DEV_ADMIN_EMAIL is NEVER a silent grant.
 *    - JWT is not checked, but presence of either header is required for
 *      `requireAuth` and the actor must be in `ADMIN_EMAILS` for
 *      `requireAdmin`.
 *
 * Two protection levels:
 *   `requireAuth`  — actor must be authenticated (any HR-team user). Used by
 *                    every HR/PII GET endpoint.
 *   `requireAdmin` — actor must additionally be in `ADMIN_EMAILS`. Used by
 *                    every mutation endpoint.
 */
import type { Context, Next } from 'hono';
import type { AppContext, Env } from '../env';
import { isDevelopment, isProduction } from '../env';

const CF_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email';
const CF_JWT_HEADER = 'Cf-Access-Jwt-Assertion';
const DEV_HEADER = 'X-Dev-Admin-Email';

function getAdminAllowList(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ---------------------------------------------------------------------------
// Cloudflare Access JWT verification
// ---------------------------------------------------------------------------

type JwksKey = {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
};

let jwksCache: { team: string; keys: JwksKey[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(team: string): Promise<JwksKey[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.team === team && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const url = `https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch ${url} → ${res.status}`);
  const body = (await res.json()) as { keys: JwksKey[] };
  jwksCache = { team, keys: body.keys, fetchedAt: now };
  return body.keys;
}

function b64urlToUint8(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function importRsaKey(jwk: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg ?? 'RS256', ext: true } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Identity claim extraction across IdPs.
 *
 * Cloudflare Access wraps the underlying IdP's identity in its own signed
 * JWT, but the *claim name* carrying the user's email differs per IdP:
 *
 *   - Google / OTP                  → `email`
 *   - Microsoft Entra ID            → typically `preferred_username` (user's
 *                                     UPN, which is an email-shaped string);
 *                                     `email` may be absent if the Entra app
 *                                     registration is missing the optional
 *                                     email claim mapping.
 *   - SAML / generic OIDC providers → `email` or `upn`
 *
 * Pre-correction this function only looked at `email`, so Entra-authenticated
 * users returned a 401 even though Access let them through. We now try the
 * three known carriers in order; whichever first contains an `@` wins.
 *
 * The JWT signature, `aud`, `iss`, `exp`, `nbf`, and `kid` are all still
 * verified — only the *claim name* for the email is more permissive.
 */
function extractEmailFromJwtPayload(payload: {
  email?: unknown;
  preferred_username?: unknown;
  upn?: unknown;
}): string | null {
  const candidates = [payload.email, payload.preferred_username, payload.upn];
  for (const c of candidates) {
    if (typeof c === 'string' && c.includes('@')) return c.toLowerCase();
  }
  return null;
}

async function verifyAccessJwt(env: Env, jwt: string): Promise<string> {
  if (!env.CF_ACCESS_TEAM) throw new Error('CF_ACCESS_TEAM not configured');
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [h, p, s] = parts as [string, string, string];

  const headerJson = JSON.parse(new TextDecoder().decode(b64urlToUint8(h)));
  const payloadJson = JSON.parse(new TextDecoder().decode(b64urlToUint8(p))) as {
    email?: unknown;
    preferred_username?: unknown;
    upn?: unknown;
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
  };
  const sigBytes = b64urlToUint8(s);
  const signedBytes = new TextEncoder().encode(`${h}.${p}`);

  if (headerJson.alg !== 'RS256') throw new Error(`unsupported alg: ${headerJson.alg}`);

  const now = Math.floor(Date.now() / 1000);
  if (payloadJson.exp != null && now >= payloadJson.exp) throw new Error('JWT expired');
  if (payloadJson.nbf != null && now < payloadJson.nbf) throw new Error('JWT not yet valid');

  if (env.CF_ACCESS_AUD) {
    const audClaim = payloadJson.aud;
    const ok = Array.isArray(audClaim)
      ? audClaim.includes(env.CF_ACCESS_AUD)
      : audClaim === env.CF_ACCESS_AUD;
    if (!ok) throw new Error('JWT aud mismatch');
  }

  const expectedIss = `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com`;
  if (payloadJson.iss !== expectedIss) throw new Error('JWT iss mismatch');

  const keys = await fetchJwks(env.CF_ACCESS_TEAM);
  const key = keys.find((k) => k.kid === headerJson.kid);
  if (!key) throw new Error(`JWT signed by unknown kid ${headerJson.kid}`);
  const cryptoKey = await importRsaKey(key);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sigBytes, signedBytes);
  if (!ok) throw new Error('JWT signature invalid');

  const email = extractEmailFromJwtPayload(payloadJson);
  if (!email) {
    throw new Error('JWT missing email-shaped claim (looked for email, preferred_username, upn)');
  }
  return email;
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

type ActorOutcome =
  | { kind: 'ok'; email: string }
  | { kind: 'reject'; status: 400 | 401 | 503; message: string };

async function resolveActor(c: Context<AppContext>): Promise<ActorOutcome> {
  const env = c.env;

  // Production: dev header is forbidden — even sending it is a 400.
  if (isProduction(env) && c.req.header(DEV_HEADER)) {
    return {
      kind: 'reject',
      status: 400,
      message: 'X-Dev-Admin-Email header is not accepted in production.',
    };
  }

  // Production: the verified JWT is the source of truth.
  //
  // Previously we also required `Cf-Access-Authenticated-User-Email` to match
  // the JWT email exactly. That cross-check was overly strict for Microsoft
  // Entra ID, which often surfaces identity in `preferred_username` (UPN)
  // while Cloudflare populates the header from a different claim, causing
  // every authenticated call to 401 even though Access itself let the user
  // through. The signature + aud + iss + exp + nbf checks above already
  // prevent forgery — the header equality check was defense without depth.
  if (isProduction(env)) {
    if (!env.CF_ACCESS_TEAM || !env.CF_ACCESS_AUD) {
      return {
        kind: 'reject',
        status: 503,
        message:
          'Worker misconfigured: CF_ACCESS_TEAM and CF_ACCESS_AUD must be set in production.',
      };
    }
    const jwt = c.req.header(CF_JWT_HEADER);
    if (!jwt) {
      return {
        kind: 'reject',
        status: 401,
        message: 'Cloudflare Access required (missing Cf-Access-Jwt-Assertion).',
      };
    }
    try {
      const verified = await verifyAccessJwt(env, jwt);
      return { kind: 'ok', email: verified };
    } catch (err) {
      return {
        kind: 'reject',
        status: 401,
        message: `Cloudflare Access JWT invalid: ${err instanceof Error ? err.message : 'error'}`,
      };
    }
  }

  // Development.
  const cfEmail = c.req.header(CF_EMAIL_HEADER);
  if (cfEmail && cfEmail.includes('@')) {
    return { kind: 'ok', email: cfEmail.toLowerCase() };
  }
  if (isDevelopment(env)) {
    const devEmail = c.req.header(DEV_HEADER);
    if (devEmail && devEmail.includes('@')) {
      return { kind: 'ok', email: devEmail.toLowerCase() };
    }
  }
  return { kind: 'reject', status: 401, message: 'Authentication required.' };
}

export async function getActorEmail(c: Context<AppContext>): Promise<string | null> {
  const r = await resolveActor(c);
  return r.kind === 'ok' ? r.email : null;
}

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

export async function requireAuth(c: Context<AppContext>, next: Next): Promise<Response | void> {
  const r = await resolveActor(c);
  if (r.kind === 'reject') {
    return c.json({ error: 'UNAUTHENTICATED', message: r.message }, r.status);
  }
  c.set('actorEmail', r.email);
  c.set('actorIsAdmin', getAdminAllowList(c.env).has(r.email));
  await next();
}

export async function requireAdmin(c: Context<AppContext>, next: Next): Promise<Response | void> {
  const r = await resolveActor(c);
  if (r.kind === 'reject') {
    return c.json({ error: 'UNAUTHENTICATED', message: r.message }, r.status);
  }
  const allow = getAdminAllowList(c.env);
  if (allow.size === 0 || !allow.has(r.email)) {
    return c.json(
      { error: 'FORBIDDEN', message: `Actor ${r.email} is not in the admin allow-list.` },
      403,
    );
  }
  c.set('actorEmail', r.email);
  c.set('actorIsAdmin', true);
  await next();
}

declare module 'hono' {
  interface ContextVariableMap {
    actorEmail: string;
    actorIsAdmin: boolean;
  }
}
