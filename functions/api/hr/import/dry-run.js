// -*- coding: utf-8 -*-
/**
 * POST /api/hr/import/dry-run
 *
 * Body: { employees: [...], contracts: [...], insurance: [...] }
 * (rows already parsed by the SPA — see src/services/api/hrApi.js)
 *
 * Returns preview counts WITHOUT writing rows. Read-only against D1.
 */
import { dryRunImport } from '../../../lib/hrUpsert.js';

export const onRequestPost = async ({ env, request }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 binding "DB" missing on this environment' }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body must be JSON' }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  }
  try {
    const { summary, blockers } = await dryRunImport(env.DB, payload);
    return new Response(JSON.stringify({ summary, blockers }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
