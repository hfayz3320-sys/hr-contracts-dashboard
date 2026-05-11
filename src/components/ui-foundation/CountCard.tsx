/**
 * CountCard — KPI/dashboard count tile.
 *
 * Successor to `common/KpiCard.tsx`. Renders the same visual but built on
 * `<InteractiveCard>` so when `to` is provided the entire card becomes a
 * link with hover lift, focus ring, and press sink.
 *
 * Numeric counts animate from 0 → value over 400ms on mount. Under
 * `prefers-reduced-motion` the count snaps directly to the final value.
 */
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { InteractiveCard } from './InteractiveCard';
import { cn } from '@/lib/utils';
import { useReducedMotion } from './motion';

type Tone = 'default' | 'active' | 'expiring' | 'expired' | 'missing' | 'info';

const TONE: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  active: 'bg-status-active-soft text-status-active',
  expiring: 'bg-status-expiring-soft text-status-expiring',
  expired: 'bg-status-expired-soft text-status-expired',
  missing: 'bg-status-missing-soft text-status-missing',
  info: 'bg-status-info-soft text-status-info',
};
const RING: Record<Tone, string> = {
  default: 'ring-border',
  active: 'ring-status-active/15',
  expiring: 'ring-status-expiring/15',
  expired: 'ring-status-expired/15',
  missing: 'ring-status-missing/15',
  info: 'ring-status-info/15',
};

export interface CountCardProps {
  label: React.ReactNode;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: React.ReactNode;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
  /** Make the card a link to this route. Renders as <a>; whole card is clickable. */
  to?: string;
  /** Click handler — alternative to `to`. */
  onClick?: () => void;
  className?: string;
}

function useAnimatedCount(value: number | string): number | string {
  const reduced = useReducedMotion();
  const [display, setDisplay] = React.useState<number | string>(
    typeof value === 'number' ? 0 : value,
  );
  React.useEffect(() => {
    if (typeof value !== 'number' || reduced) {
      setDisplay(value);
      return;
    }
    const target = value;
    if (target === 0) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    const duration = 400;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out-quart
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return display;
}

export function CountCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
  trend,
  to,
  onClick,
  className,
}: CountCardProps) {
  const animated = useAnimatedCount(value);
  return (
    <InteractiveCard to={to} onClick={onClick} className={className}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">
              {label}
            </div>
            <div className="mt-2 text-[26px] font-semibold tabular leading-none tracking-tight">
              {animated}
            </div>
            {hint && (
              <div className="mt-2 text-[11px] text-muted-foreground leading-tight">
                {hint}
              </div>
            )}
            {trend && (
              <div
                className={cn(
                  'mt-2 inline-flex items-center text-[11px] font-medium',
                  trend.direction === 'up' && 'text-status-active',
                  trend.direction === 'down' && 'text-status-expired',
                  trend.direction === 'flat' && 'text-muted-foreground',
                )}
              >
                {trend.direction === 'up' && '▲'}
                {trend.direction === 'down' && '▼'}
                {trend.direction === 'flat' && '●'}
                <span className="ml-1">{trend.value}</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset',
              TONE[tone],
              RING[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </InteractiveCard>
  );
}
