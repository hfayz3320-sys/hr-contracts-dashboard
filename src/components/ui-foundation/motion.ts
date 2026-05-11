/**
 * A5.0 motion tokens & reduced-motion helper.
 *
 * Motion budget — strict (per the approved plan):
 *   1. Sidebar active indicator     (Framer Motion layoutId)
 *   2. Tab active indicator         (Framer Motion layoutId)
 *   3. Tab panel content crossfade  (Framer Motion AnimatePresence)
 *
 * Everything else (press, hover, focus, skeleton, rail expand, drawer open) is
 * CSS-only. This module exports a tiny `useReducedMotion` hook so components
 * that DO use Framer Motion can downgrade gracefully without sprinkling
 * `window.matchMedia` everywhere.
 *
 * The CSS reduced-motion media-query in `globals.css` zeroes durations for the
 * CSS path; this hook handles the Framer Motion path.
 */
import { useEffect, useState } from 'react';

/** Duration tokens in ms — kept in sync with the CSS custom properties. */
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 280,
} as const;

/** Cubic-bezier easing curve. Matches `--ease-out-quart` in globals.css. */
export const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

/**
 * Subscribes to `prefers-reduced-motion`. SSR-safe: returns `false` until the
 * window-only effect runs. We're CSR-only via Vite so this is fine; the guard
 * just prevents a TypeError if the file ever gets imported in a Node context.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return reduced;
}

/**
 * Helper for Framer Motion `transition` objects that respects the
 * reduced-motion preference: returns `{ duration: 0 }` when the user has
 * opted out, otherwise the supplied transition.
 */
export function maybeTransition<T extends object>(
  reduced: boolean,
  transition: T,
): T | { duration: 0 } {
  return reduced ? { duration: 0 } : transition;
}
