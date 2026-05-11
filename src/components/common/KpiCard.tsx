import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'active' | 'expiring' | 'expired' | 'missing' | 'info';

const TONE: Record<Tone, string> = {
  default:  'bg-muted text-muted-foreground',
  active:   'bg-status-active-soft text-status-active',
  expiring: 'bg-status-expiring-soft text-status-expiring',
  expired:  'bg-status-expired-soft text-status-expired',
  missing:  'bg-status-missing-soft text-status-missing',
  info:     'bg-status-info-soft text-status-info',
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
  trend,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
}) {
  return (
    <Card className="transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_rgba(15,23,42,0.04)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">
              {label}
            </div>
            <div className="mt-2 text-[26px] font-semibold tabular leading-none tracking-tight">
              {value}
            </div>
            {hint && (
              <div className="mt-2 text-[11px] text-muted-foreground leading-tight">{hint}</div>
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
              tone === 'default' && 'ring-border',
              tone === 'active' && 'ring-status-active/15',
              tone === 'expiring' && 'ring-status-expiring/15',
              tone === 'expired' && 'ring-status-expired/15',
              tone === 'missing' && 'ring-status-missing/15',
              tone === 'info' && 'ring-status-info/15',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
