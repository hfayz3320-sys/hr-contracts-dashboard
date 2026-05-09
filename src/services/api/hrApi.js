// -*- coding: utf-8 -*-
/**
 * src/services/api/hrApi.js
 *
 * Thin client for the production HR API backed by D1 (Cloudflare Pages
 * Functions). All endpoints return JSON and never accept PII files in the
 * URL — payloads are POSTed as application/json after the SPA has parsed
 * the source files locally.
 *
 * Endpoints (defined in functions/api/hr/):
 *   GET  /api/hr/current-snapshot
 *   POST /api/hr/import/dry-run
 *   POST /api/hr/import/commit
 *   POST /api/hr/import/rollback/:importJobId
 */

const BASE = '/api/hr';

// ── admin token storage ────────────────────────────────────────────────────
// The token never leaves the browser; it is read from sessionStorage and
// attached to every write request. The Import Dashboard's "0 — Production
// database" panel calls setAdminToken() when the user pastes one in.
const ADMIN_TOKEN_KEY = 'hr.adminToken';
function getAdminToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
}
export function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch { /* sessionStorage unavailable in some environments */ }
}
export function hasAdminToken() {
  return Boolean(getAdminToken());
}
function authHeaders() {
  const t = getAdminToken();
  return t ? { 'authorization': `Bearer ${t}` } : {};
}

async function jsonOrThrow(res) {
  const ct = res.headers.get('content-type') || '';
  const isJson = /application\/json/i.test(ct);
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (isJson && body && body.error) ? body.error : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body   = body;
    throw err;
  }
  return body;
}

/**
 * Fetch the latest committed real snapshot.
 *
 *   { ok: true,  snapshot }   when production data exists
 *   { ok: false, status: 404 } when no production data has been imported yet
 *   throws                    on network/server errors
 */
export async function fetchCurrentSnapshot() {
  let res;
  try {
    res = await fetch(`${BASE}/current-snapshot`, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    // Network failure / dev environment without a Functions runtime.
    return { ok: false, status: 0, error: err.message || 'network' };
  }
  if (res.status === 404) {
    return { ok: false, status: 404 };
  }
  // Cloudflare may serve the SPA index.html for /api/* if Functions are
  // not deployed — guard against that.
  const ct = res.headers.get('content-type') || '';
  if (!/application\/json/i.test(ct)) {
    return { ok: false, status: res.status, error: 'API not available (HTML response)' };
  }
  try {
    const snapshot = await jsonOrThrow(res);
    return { ok: true, snapshot };
  } catch (err) {
    return { ok: false, status: err.status || res.status, error: err.message };
  }
}

export async function postImportDryRun(payload) {
  const res = await fetch(`${BASE}/import/dry-run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function postImportCommit(payload) {
  const res = await fetch(`${BASE}/import/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function postImportRollback(importJobId) {
  const res = await fetch(`${BASE}/import/rollback/${encodeURIComponent(importJobId)}`, {
    method: 'POST',
    headers: { 'accept': 'application/json', ...authHeaders() },
  });
  return jsonOrThrow(res);
}
