// -*- coding: utf-8 -*-
/**
 * GET /api/hr/current-snapshot
 *
 * Returns the latest committed real data snapshot from D1.
 *
 *   200 → { source: 'real-imported', job, counts, persons, contracts, insurance, review }
 *   404 → { source: null, message: 'No production HR data has been imported yet.' }
 */
import { readCurrentSnapshot } from '../../lib/hrUpsert.js';

export const onRequestGet = async ({ env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 binding "DB" missing on this environment' }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
  try {
    const snap = await readCurrentSnapshot(env.DB);
    if (!snap) {
      return new Response(
        JSON.stringify({
          source: null,
          message: 'No production HR data has been imported yet. Admin must import and commit data.',
        }),
        { status: 404, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
      );
    }
    return new Response(JSON.stringify(snap),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
