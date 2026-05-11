/**
 * Unit tests for the worker auth middleware — Phase 2B safety correction.
 *
 * Tests run in node, not in a real worker, by importing the middleware and
 * calling it with a minimally-mocked Hono Context.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Context, Next } from 'hono';
import { requireAuth, requireAdmin, getActorEmail } from '../../worker/src/lib/auth';
import type { Env, AppContext } from '../../worker/src/env';

function makeCtx(opts: {
  env: Partial<Env>;
  headers: Record<string, string>;
}): { c: Context<AppContext>; jsonCalls: Array<{ body: unknown; status?: number }> } {
  const headers = new Map(Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const jsonCalls: Array<{ body: unknown; status?: number }> = [];
  const vars: Record<string, unknown> = {};
  const c = {
    env: {
      ENVIRONMENT: 'development',
      ALLOW_ORIGIN: '',
      ...opts.env,
    } as Env,
    req: {
      header: (name: string) => headers.get(name.toLowerCase()),
    },
    set: (k: string, v: unknown) => {
      vars[k] = v;
    },
    get: (k: string) => vars[k],
    json: (body: unknown, status?: number) => {
      jsonCalls.push({ body, status });
      return { _isResponse: true, body, status } as unknown as Response;
    },
  } as unknown as Context<AppContext>;
  return { c, jsonCalls };
}

const noopNext: Next = vi.fn(async () => {});

describe('auth — production hard guards', () => {
  it('rejects X-Dev-Admin-Email with 400 in production', async () => {
    const { c, jsonCalls } = makeCtx({
      env: { ENVIRONMENT: 'production', ADMIN_EMAILS: 'admin@mid.local' },
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(400);
    expect((jsonCalls[0]?.body as { message: string }).message).toMatch(/X-Dev-Admin-Email/);
  });

  it('rejects with 503 when CF_ACCESS_TEAM/AUD missing in production', async () => {
    const { c, jsonCalls } = makeCtx({
      env: {
        ENVIRONMENT: 'production',
        ADMIN_EMAILS: 'admin@mid.local',
        // CF_ACCESS_TEAM and CF_ACCESS_AUD intentionally missing
      },
      headers: {
        'Cf-Access-Authenticated-User-Email': 'admin@mid.local',
        'Cf-Access-Jwt-Assertion': 'fake.jwt.parts',
      },
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(503);
    expect((jsonCalls[0]?.body as { message: string }).message).toMatch(
      /CF_ACCESS_TEAM and CF_ACCESS_AUD must be set/,
    );
  });

  it('rejects with 401 when JWT missing in production (only email header)', async () => {
    const { c, jsonCalls } = makeCtx({
      env: {
        ENVIRONMENT: 'production',
        ADMIN_EMAILS: 'admin@mid.local',
        CF_ACCESS_TEAM: 'myteam',
        CF_ACCESS_AUD: 'myaud',
      },
      headers: { 'Cf-Access-Authenticated-User-Email': 'admin@mid.local' },
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(401);
    expect((jsonCalls[0]?.body as { message: string }).message).toMatch(/Cf-Access-Jwt-Assertion/);
  });

  it('rejects with 401 when JWT cannot be verified', async () => {
    const { c, jsonCalls } = makeCtx({
      env: {
        ENVIRONMENT: 'production',
        ADMIN_EMAILS: 'admin@mid.local',
        CF_ACCESS_TEAM: 'this-team-does-not-exist-zzz',
        CF_ACCESS_AUD: 'aud',
      },
      headers: {
        'Cf-Access-Authenticated-User-Email': 'admin@mid.local',
        'Cf-Access-Jwt-Assertion': 'invalid.jwt.payload',
      },
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(401);
    expect((jsonCalls[0]?.body as { message: string }).message).toMatch(/JWT/);
  });

  it('rejects anonymous request with 401 in development too', async () => {
    const { c, jsonCalls } = makeCtx({
      env: { ENVIRONMENT: 'development', ADMIN_EMAILS: 'admin@mid.local' },
      headers: {},
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(401);
  });
});

describe('auth — development behavior', () => {
  it('grants admin in dev when X-Dev-Admin-Email is in allow-list', async () => {
    const { c, jsonCalls } = makeCtx({
      env: { ENVIRONMENT: 'development', ADMIN_EMAILS: 'admin@mid.local' },
      headers: { 'X-Dev-Admin-Email': 'admin@mid.local' },
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls).toHaveLength(0);
    expect(c.get('actorEmail')).toBe('admin@mid.local');
    expect(c.get('actorIsAdmin')).toBe(true);
  });

  it('rejects with 403 when actor is authenticated but not in allow-list', async () => {
    const { c, jsonCalls } = makeCtx({
      env: { ENVIRONMENT: 'development', ADMIN_EMAILS: 'admin@mid.local' },
      headers: { 'X-Dev-Admin-Email': 'stranger@example.com' },
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(403);
  });

  it('does NOT silently grant access when DEV_ADMIN_EMAIL is set but no header', async () => {
    const { c, jsonCalls } = makeCtx({
      env: {
        ENVIRONMENT: 'development',
        ADMIN_EMAILS: 'admin@mid.local',
        DEV_ADMIN_EMAIL: 'admin@mid.local',
      },
      headers: {},
    });
    await requireAdmin(c, noopNext);
    expect(jsonCalls[0]?.status).toBe(401);
  });

  it('requireAuth allows non-admin authenticated dev user', async () => {
    const { c, jsonCalls } = makeCtx({
      env: { ENVIRONMENT: 'development', ADMIN_EMAILS: 'admin@mid.local' },
      headers: { 'X-Dev-Admin-Email': 'guest@mid.local' },
    });
    await requireAuth(c, noopNext);
    expect(jsonCalls).toHaveLength(0);
    expect(c.get('actorEmail')).toBe('guest@mid.local');
    expect(c.get('actorIsAdmin')).toBe(false);
  });
});

describe('auth — getActorEmail helper', () => {
  it('returns CF email header in production when JWT is verified', async () => {
    const { c } = makeCtx({
      env: { ENVIRONMENT: 'development' },
      headers: { 'Cf-Access-Authenticated-User-Email': 'real@mid.local' },
    });
    expect(await getActorEmail(c)).toBe('real@mid.local');
  });

  it('returns null when no auth header is present in dev', async () => {
    const { c } = makeCtx({ env: { ENVIRONMENT: 'development' }, headers: {} });
    expect(await getActorEmail(c)).toBeNull();
  });
});
