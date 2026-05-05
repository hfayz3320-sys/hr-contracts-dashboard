// Node ESM loader hook that mirrors Vite's relaxed extension resolution.
// Vite resolves `from './foo'` → `./foo.js` automatically; Node ESM does not.
// This loader plugs that gap so the headless test can import the unmodified
// app source directly.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  // Only adjust relative imports that don't already specify an extension or path.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      const candidates = [
        specifier + '.js',
        specifier + '.mjs',
        specifier + '/index.js',
        specifier + '/index.mjs',
      ];
      for (const c of candidates) {
        try {
          return await nextResolve(c, context);
        } catch { /* try next */ }
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}
