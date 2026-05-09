// -*- coding: utf-8 -*-
/**
 * POST /api/hr/import/commit
 *
 * Body: { employees: [...], contracts: [...], insurance: [...], pdfFiles: number, jobMeta?: {...} }
 *
 * Performs the UPSERT against D1 and returns { jobId, summary, blockers }.
 * Idempotency: pass the same `jobMeta.id` to re-attempt — but note that with
 * SHA-256 contract_keys and identity-based person dedup, even a re-run with
 * a fresh jobId is safe (it just produces no new rows on the second run).
 */
import { applyImport } from '../../../lib/hrUpsert.js';

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
    const result = await applyImport(env.DB, payload, payload.jobMeta || {});
    return new Response(JSON.stringify(result),
      { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
