// -*- coding: utf-8 -*-
/**
 * CollapsibleFilters
 *
 * Hides any filter UI behind a compact "Filter" button. The drawer opens as:
 *   - a side drawer on desktop (width <= 720px)
 *   - a full-width sheet on mobile
 *
 * Behaviour matches the global UI rule:
 *   1. No full filter section visible by default.
 *   2. Show the Filter button, optional active-count badge, and an
 *      "Apply" / "Clear" pair inside the drawer.
 *   3. Children = the existing filter controls — wrapped, not rewritten.
 *
 * Props:
 *   activeCount     number of active filters (drives the badge)
 *   onApply         optional () => void — closes the drawer after apply
 *   onClear         optional () => void — clears filters, keeps drawer open
 *   buttonLabel     default "Filter"
 *   ariaLabel       default "Open filters"
 *   align           'right' (default) | 'left'
 *   children        the filter controls
 *   defaultOpen     boolean — open initially (default: false)
 *   inline          render filter controls inline as a fallback (debug only)
 *
 * Pure CSS (uses inline styles + a small <style> block) so it works without
 * adding any new global stylesheet imports.
 */
import React, { useEffect, useState, useCallback } from 'react';

const styles = `
.cf-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.cf-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; font-size: 13px; font-weight: 500;
  border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
  color: #1f2937; cursor: pointer; transition: background .12s;
}
.cf-btn:hover { background: #f9fafb; }
.cf-btn[aria-pressed="true"] { background: #eef2ff; border-color: #6366f1; color: #4338ca; }
.cf-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
  background: #4338ca; color: #fff; font-size: 11px; font-weight: 600;
}
.cf-overlay {
  position: fixed; inset: 0; background: rgba(15,23,42,.45);
  z-index: 9998; opacity: 0; pointer-events: none; transition: opacity .15s;
}
.cf-overlay.is-open { opacity: 1; pointer-events: auto; }
.cf-drawer {
  position: fixed; top: 0; bottom: 0; right: 0; width: min(420px, 100vw);
  background: #fff; box-shadow: -4px 0 24px rgba(0,0,0,.18);
  z-index: 9999; transform: translateX(100%); transition: transform .2s ease;
  display: flex; flex-direction: column;
}
.cf-drawer.is-left { right: auto; left: 0; transform: translateX(-100%); }
.cf-drawer.is-open { transform: translateX(0); }
.cf-drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
}
.cf-drawer-title { margin: 0; font-size: 16px; font-weight: 600; color: #111827; }
.cf-drawer-close {
  border: none; background: transparent; font-size: 20px; line-height: 1;
  color: #6b7280; cursor: pointer; padding: 4px 8px;
}
.cf-drawer-body { flex: 1; overflow: auto; padding: 16px; }
.cf-drawer-foot {
  display: flex; gap: 8px; padding: 12px 16px;
  border-top: 1px solid #e5e7eb; background: #f9fafb;
}
.cf-drawer-foot .cf-btn { flex: 1; justify-content: center; }
.cf-drawer-foot .cf-btn.primary { background: #4338ca; color: #fff; border-color: #4338ca; }
.cf-drawer-foot .cf-btn.primary:hover { background: #3730a3; }
@media (max-width: 720px) {
  .cf-drawer { width: 100vw; }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const tag = document.createElement('style');
  tag.setAttribute('data-cf-filters', '');
  tag.appendChild(document.createTextNode(styles));
  document.head.appendChild(tag);
  stylesInjected = true;
}

export default function CollapsibleFilters({
  activeCount = 0,
  onApply,
  onClear,
  buttonLabel = 'Filter',
  ariaLabel,
  align = 'right',
  children,
  defaultOpen = false,
  drawerTitle = 'Filters',
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  useEffect(() => { injectStyles(); }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const handleApply = useCallback(() => {
    if (typeof onApply === 'function') onApply();
    close();
  }, [onApply, close]);

  const handleClear = useCallback(() => {
    if (typeof onClear === 'function') onClear();
  }, [onClear]);

  return (
    <>
      <button
        type="button"
        className="cf-btn"
        aria-pressed={open}
        aria-label={ariaLabel || `${buttonLabel} (${activeCount} active)`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⚲</span>
        <span>{buttonLabel}</span>
        {activeCount > 0 && <span className="cf-badge">{activeCount}</span>}
      </button>

      <div
        className={`cf-overlay${open ? ' is-open' : ''}`}
        onClick={close}
        aria-hidden={!open}
      />
      <aside
        className={`cf-drawer${align === 'left' ? ' is-left' : ''}${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label={drawerTitle}
      >
        <header className="cf-drawer-head">
          <h2 className="cf-drawer-title">{drawerTitle}</h2>
          <button type="button" className="cf-drawer-close" aria-label="Close" onClick={close}>×</button>
        </header>
        <div className="cf-drawer-body">
          {children}
        </div>
        <footer className="cf-drawer-foot">
          {onClear && (
            <button type="button" className="cf-btn" onClick={handleClear}>
              Clear filters
            </button>
          )}
          <button type="button" className="cf-btn primary" onClick={handleApply}>
            Apply filters
          </button>
        </footer>
      </aside>
    </>
  );
}

/**
 * Compact pill list of currently-active filters. Each pill has an × that
 * calls the supplied `onRemove(key)`.
 */
export function ActiveFilterChips({ filters = [], onRemove }) {
  if (!filters.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {filters.map((f) => (
        <span key={f.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', background: '#eef2ff', color: '#3730a3',
          borderRadius: 999, fontSize: 12, fontWeight: 500,
        }}>
          {f.label}
          {onRemove && (
            <button type="button"
              onClick={() => onRemove(f.key)}
              aria-label={`Remove ${f.label}`}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: '#3730a3', fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >×</button>
          )}
        </span>
      ))}
    </div>
  );
}
