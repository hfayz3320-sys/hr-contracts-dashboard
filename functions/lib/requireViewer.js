// -*- coding: utf-8 -*-
/**
 * functions/lib/requireViewer.js
 *
 * Read-only viewer gate (less strict than requireAdmin).
 *
 * Two layers, either passes:
 *   1. Cloudflare Access — `Cf-Access-Authenticated-User-Email` set AND on
 *      env.VIEWER_EMAILS allowlist (comma-separated). If env.VIEWER_EMAILS
 *      is unset, ANY CF-Access-authenticated user is accepted (so the
 *      operator can let a Zero Trust policy do the gating).
 *   2. Bearer admin token — same check as requireAdmin (admin always
 *      allowed to read).
 *
 * If neither CF Access nor a bearer token is presented, return 401.
 * If credentials are presented but rejected, return 403.
 *
 * SECURITY NOTE — until the operator configures Cloudflare Access OR
 * VIEWER_EMAILS, the only callers allowed are admin token holders.
 * That keeps PDFs from leaking to the public internet by default.
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

export function requireViewer(request, env) {
  const adminToken   = env.ADMIN_TOKEN  || '';
  const viewerEmails = (env.VIEWER_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const adminEmails  = (env.ADMIN_EMAILS  || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

  // 1) Cloudflare Access path
  const cfEmail = (request.headers.get('cf-access-authenticated-user-email') || '').toLowerCase();
  if (cfEmail) {
    // VIEWER_EMAILS empty → trust whatever Access policy is in front
    if (viewerEmails.length === 0 && adminEmails.length === 0) return null;
    if (viewerEmails.includes(cfEmail) || adminEmails.includes(cfEmail)) return null;
    return jsonError(403, `User ${cfEmail} is authenticated but not on the viewer allowlist`);
  }

  // 2) Bearer admin token path
  const authHeader = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) {
    return jsonError(401,
      'Authentication required. Provide an Authorization: Bearer <admin-token> header, ' +
      'or sign in via Cloudflare Access.');
  }
  if (!adminToken) {
    return jsonError(403, 'Bearer token presented but ADMIN_TOKEN is not configured on the server');
  }
  if (!constantTimeEquals(m[1].trim(), adminToken)) {
    return jsonError(403, 'Bearer token rejected');
  }
  return null;
}
