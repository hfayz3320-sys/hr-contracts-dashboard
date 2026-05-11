/**
 * EmptyState — designed empty surface for tabs/lists/pages.
 *
 * NOT a "no data" placeholder. The HR system uses this when a real but
 * empty section needs to look intentional. Anatomy:
 *
 *   [icon in soft square]   ← 64px container, muted background, icon 24px
 *   Title                   ← 14px semibold
 *   Body                    ← 13px muted-foreground, max ~60ch
 *   [optional stage chip]   ← e.g. "A5.1" wired in info tone
 *   [optional action slot]  ← PressableButton, link, ActionMenu
 *
 * Motion: a 200ms fade-up on mount (respecting reduced-motion via CSS).
 */
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional stage indicator e.g. "A5.1 wires this up". Rendered as a chip. */
  stage?: React.ReactNode;
  /** Action slot — typically a PressableButton or ActionMenu. */
  action?: React.ReactNode;
  /** Variant tone — affects only the icon container. */
  tone?: 'default' | 'info' | 'expired';
  className?: string;
}

const TONE: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  default: 'bg-muted text-muted-foreground ring-border',
  info: 'bg-status-info-soft text-status-info ring-status-info/15',
  expired: 'bg-status-expired-soft text-status-expired ring-status-expired/15',
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  stage,
  action,
  tone = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        // Subtle fade-up on mount. Honors prefers-reduced-motion via the
        // duration override in globals.css.
        'animate-in fade-in slide-in-from-bottom-1 duration-base',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ring-inset',
            TONE[tone],
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {stage && (
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-status-info-soft px-2 py-0.5 text-[11px] font-medium text-status-info ring-1 ring-inset ring-status-info/20">
          {stage}
        </span>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
