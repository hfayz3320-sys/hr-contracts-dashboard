// -*- coding: utf-8 -*-
/**
 * src/services/api/productionMode.js
 *
 * Encapsulates the rule:
 *   - In a production build (import.meta.env.PROD) OR when a real DB
 *     snapshot exists, the demo / sample-data UI must be HIDDEN.
 *   - In dev (PROD === false) the demo button stays as a fallback.
 *
 * The frontend calls `resolveStartupSnapshot()` once at app boot to decide
 * which mode to render in.
 */
import { fetchCurrentSnapshot } from './hrApi';

const PROD_BUILD = Boolean(import.meta.env && import.meta.env.PROD);

/**
 * Hits /api/hr/current-snapshot once and returns:
 *   { mode: 'real',     snapshot, isProd: PROD_BUILD }
 *   { mode: 'empty',    snapshot: null, isProd: PROD_BUILD }   // 404
 *   { mode: 'dev-fallback', snapshot: null, isProd: false, error }
 *   { mode: 'api-down', snapshot: null, isProd: PROD_BUILD, error } // prod build but Functions not reachable
 */
export async function resolveStartupSnapshot() {
  const result = await fetchCurrentSnapshot();
  if (result.ok && result.snapshot && result.snapshot.source === 'real-imported') {
    return { mode: 'real', snapshot: result.snapshot, isProd: PROD_BUILD };
  }
  if (!result.ok && result.status === 404) {
    return { mode: 'empty', snapshot: null, isProd: PROD_BUILD };
  }
  if (PROD_BUILD) {
    return { mode: 'api-down', snapshot: null, isProd: true, error: result.error || 'unknown' };
  }
  return { mode: 'dev-fallback', snapshot: null, isProd: false, error: result.error };
}

/**
 * `true` when the demo / sample-data button must be HIDDEN.
 * Hidden in any production build, OR when real snapshot exists in any build.
 */
export function shouldHideDemoUI(startupResult) {
  if (!startupResult) return PROD_BUILD;
  if (startupResult.isProd) return true;
  return startupResult.mode === 'real';
}

export const isProductionBuild = () => PROD_BUILD;
