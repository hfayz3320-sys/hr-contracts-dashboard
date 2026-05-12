/**
 * Panel — flat, dense card surface for ERP-style layouts.
 *
 * Differs from shadcn `Card` in three ways:
 *   - Uppercase, muted section title (ERP convention)
 *   - Tight padding by default; `dense` flag removes padding for tables
 *   - Optional `action` slot in the header (e.g. "Edit", "View all")
 *
 * Composable: pass any children. The wrapper only owns the outer border,
 * background, and optional header. Combine with `FormRow` for definition
 * lists, or render a table/list inline.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Remove inner padding — useful when rendering a table that owns its own padding. */
  dense?: boolean;
  /** Cap the body height and scroll inside the panel. */
  scroll?: boolean;
}

export function Panel({ title, action, children, className, dense, scroll }: PanelProps) {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      {title && (
        <header className="flex items-center gap-3 px-4 py-2.5 border-b">
          <h3 className="text-[12px] font-semibold tracking-tight uppercase text-muted-foreground flex-1 min-w-0">{title}</h3>
          {action}
        </header>
      )}
      <div className={cn(dense ? 'p-0' : 'p-4', scroll && 'max-h-[420px] overflow-auto')}>
        {children}
      </div>
    </section>
  );
}
