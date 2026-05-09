// -*- coding: utf-8 -*-
/**
 * functions/lib/requireAdmin.js
 *
 * Admin-token gate for write endpoints (dry-run, commit, rollback).
 *
 * Authentication is layered to support both deployment styles:
 *
 *   1. Cloudflare Access in front of /api/hr/import/*
 *      → CF Access injects `Cf-Access-Authenticated-User-Email`. We check
 *        that the email is on the env.ADMIN_EMAILS allowlist (comma-sep).
 *
 *   2. Bearer token (for CI / scripted imports / pre-Access setups)
 *      → caller sends `Authorization: Bearer <token>`. We compare to
 *        env.ADMIN_TOKEN with a constant-time comparison.
 *
 * Either path satisfies the gate. If neither produces a verified admin,
 * we return 401 (no credentials) or 403 (credentials present but not admin).
 *
 * If env.ADMIN_TOKEN is unset AND env.ADMIN_EMAILS is unset, the gate
 * FAILS CLOSED with 503 — there is no safe default for "no auth required"
 * on a write endpoint.
 */

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Returns null if authorised. Returns a Response (401/403/503) if not.
 *
 *   const denied = requireAdmin(request, env);
 *   if (denied) return denied;
 */
export function requireAdmin(request, env) {
  const adminToken  = env.ADMIN_TOKEN  || '';
  const adminEmails = (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

  if (!adminToken && adminEmails.length === 0) {
    return jsonError(503,
      'API admin auth not configured. Set ADMIN_TOKEN and/or ADMIN_EMAILS in the Pages environment.');
  }

  // 1) Cloudflare Access path
  const cfEmail = (request.headers.get('cf-access-authenticated-user-email') || '').toLowerCase();
  if (cfEmail && adminEmails.includes(cfEmail)) {
    return null; // ✓ admin via CF Access
  }
  if (cfEmail && adminEmails.length && !adminEmails.includes(cfEmail)) {
    return jsonError(403, `User ${cfEmail} is authenticated but not on the admin allowlist`);
  }

  // 2) Bearer token path
  const authHeader = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) {
    return jsonError(401, 'Missing or malformed Authorization header. Expected: "Authorization: Bearer <token>"');
  }
  if (!adminToken) {
    return jsonError(403, 'Bearer token presented but ADMIN_TOKEN is not configured on the server');
  }
  if (!constantTimeEquals(m[1].trim(), adminToken)) {
    return jsonError(403, 'Bearer token rejected');
  }
  return null; // ✓ admin via bearer
}
