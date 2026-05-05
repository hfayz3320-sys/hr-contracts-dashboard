// -*- coding: utf-8 -*-
/**
 * featureFlags.js
 *
 * Single source of truth for in-app feature toggles.
 * Phase 1 boundary: the new identity-centric import flow is OFF by default.
 * No UI is wired up to it yet; this flag lets us switch routing in Phase 2
 * without further code changes.
 *
 * To enable locally during testing:
 *   1. Toggle the value below to true, OR
 *   2. (Browser) localStorage.setItem('feature.newImports', 'true') and reload.
 */

function readLocalOverride(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === 'true')  return true;
    if (raw === 'false') return false;
  } catch {
    /* localStorage may be unavailable in private mode */
  }
  return null;
}

const DEFAULTS = Object.freeze({
  newImports: true,    // identity-centric import flow — Phase 2 ENABLED after manual + headless validation
});

export const FEATURE_FLAGS = Object.freeze({
  get newImports() {
    const override = readLocalOverride('feature.newImports');
    return override === null ? DEFAULTS.newImports : override;
  },
});

export const FEATURE_DEFAULTS = DEFAULTS;
