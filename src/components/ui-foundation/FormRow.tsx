/**
 * FormRow — one row of a definition list, ERP density.
 *
 * Layout: 140px label · flexible value · auto-width action slot. Action is
 * hidden by default and revealed on row hover (parent `group` is set
 * implicitly via `group hover:bg-muted/40`). Use inside `<dl>` or a
 * `<Panel>` body — semantics are `<dt>` / `<dd>`.
 *
 *   IQAMA              2572412712               [Edit]   ← hover reveals
 *   ─────              ──────────               ──────
 *   label              value (mono if mono)     action
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormRowProps {
  label: string;
  value: React.ReactNode;
  /** Render value in mono font (e.g. iqama, ids, codes). */
  mono?: boolean;
  /** Smaller helper line shown below the value. */
  hint?: React.ReactNode;
  /** Right-aligned action revealed on row hover. */
  action?: React.ReactNode;
  className?: string;
}

export function FormRow({ label, value, mono, hint, action, className }: FormRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[140px_1fr_auto] items-start gap-3 py-1.5 px-1 -mx-1 rounded',
        'transition-colors duration-fast hover:bg-muted/40 group',
        className,
      )}
    >
      <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium pt-[3px]">
        {label}
      </dt>
      <dd className={cn('text-[13px] leading-snug min-w-0', mono && 'font-mono')}>
        {value}
        {hint != null && hint !== '' && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
        )}
      </dd>
      {action != null && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
          {action}
        </div>
      )}
    </div>
  );
}
