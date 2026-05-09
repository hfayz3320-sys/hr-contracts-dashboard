// -*- coding: utf-8 -*-
/**
 * POST /api/hr/import/rollback/:importJobId
 *
 * Reverses every audit-logged action for the given import job:
 *   - 'create' rows → DELETE
 *   - 'update' rows → restore old_value_json
 *   - review_queue and employee_snapshots from that job → wiped
 *   - import_jobs.status → 'rolled_back'
 */
import { rollbackImport } from '../../../../lib/hrUpsert.js';

export const onRequestPost = async ({ env, params }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 binding "DB" missing on this environment' }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
  const importJobId = params?.importJobId;
  if (!importJobId) {
    return new Response(JSON.stringify({ error: 'importJobId path param required' }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  }
  try {
    const result = await rollbackImport(env.DB, importJobId);
    return new Response(JSON.stringify(result),
      { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
