/**
 * Chip — compact pill for status / count / metadata.
 *
 * Shares the status-token palette (active / expiring / expired / missing /
 * info / review / default) used by the rest of the UI foundation. Designed
 * to sit inline next to text — small, fixed type scale, never wraps.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export type ChipTone = 'default' | 'info' | 'active' | 'expiring' | 'expired' | 'missing' | 'review';

const TONE_CLASSES: Record<ChipTone, string> = {
  default:  'bg-muted text-muted-foreground border-border',
  info:     'bg-status-info-soft text-[hsl(var(--status-info))] border-[hsl(var(--status-info))]/20',
  active:   'bg-status-active-soft text-[hsl(var(--status-active))] border-[hsl(var(--status-active))]/20',
  expiring: 'bg-status-expiring-soft text-[hsl(var(--status-expiring))] border-[hsl(var(--status-expiring))]/20',
  expired:  'bg-status-expired-soft text-[hsl(var(--status-expired))] border-[hsl(var(--status-expired))]/20',
  missing:  'bg-status-missing-soft text-[hsl(var(--status-missing))] border-[hsl(var(--status-missing))]/20',
  review:   'bg-status-expiring-soft text-[hsl(var(--status-expiring))] border-[hsl(var(--status-expiring))]/30',
};

export interface ChipProps {
  children: React.ReactNode;
  tone?: ChipTone;
  icon?: React.ReactNode;
  className?: string;
}

export function Chip({ children, tone = 'default', icon, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
