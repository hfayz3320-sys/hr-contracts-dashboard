/**
 * SmartButton — Odoo-style "count + label" button that sits in the header
 * of an entity (employee, contract, project). Clicking it jumps to a
 * related tab or list. Designed to live in a tight inline row separated
 * by 1px dividers (`border-r border-border last:border-r-0`).
 *
 *   ┌──────────────┬──────────────┬──────────────┐
 *   │  📄 3        │  💚 1        │  📁 7        │
 *   │  CONTRACTS   │  INSURANCE   │  DOCUMENTS   │
 *   └──────────────┴──────────────┴──────────────┘
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SmartButtonProps {
  count: number | string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export function SmartButton({
  count, label, icon, onClick, active, disabled, ariaLabel,
}: SmartButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel ?? `${label}: ${count}`}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 min-w-[96px]',
        'border-r border-border last:border-r-0',
        'transition-[background-color,transform] duration-fast ease-out-quart',
        'hover:bg-muted/60',
        'active:translate-y-[1px] active:duration-75',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active && 'bg-muted/60',
      )}
    >
      <span className="flex items-center gap-1.5 text-foreground">
        {icon}
        <span className="text-[16px] font-semibold tabular-nums leading-none">{count}</span>
      </span>
      <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{label}</span>
    </button>
  );
}
