/**
 * TabBar — flat, underlined tab strip with optional counts.
 *
 * Sibling to `AnimatedTabs` (which uses Radix Tabs + framer-motion). TabBar
 * is the simpler primitive: no framer-motion, no Radix, no URL sync —
 * pure controlled component. Right for places where the parent owns tab
 * state (URL, query string, or local).
 *
 * The active tab is indicated by a 2px underline that follows hover too:
 *   default     →  no underline
 *   :hover      →  border-color underline
 *   selected    →  foreground underline + bold
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabBarItem {
  key: string;
  label: React.ReactNode;
  /** Optional small badge with a count. */
  count?: number;
  disabled?: boolean;
}

export interface TabBarProps {
  tabs: TabBarItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  /** Aria-label for the tablist. */
  ariaLabel?: string;
}

export function TabBar({ tabs, value, onChange, className, ariaLabel }: TabBarProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-end gap-0 border-b border-border overflow-x-auto', className)}
    >
      {tabs.map((t) => {
        const sel = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={sel}
            aria-controls={`tab-panel-${t.key}`}
            disabled={t.disabled}
            onClick={() => !t.disabled && onChange(t.key)}
            className={cn(
              'group relative inline-flex items-center gap-2 px-3.5 py-2 text-[13px] whitespace-nowrap',
              'transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              'disabled:opacity-50 disabled:pointer-events-none',
              sel
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10px] tabular-nums',
                  sel ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            )}
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-0 right-0 -bottom-px h-[2px] rounded-t transition-colors duration-fast',
                sel ? 'bg-foreground' : 'bg-transparent group-hover:bg-border',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
