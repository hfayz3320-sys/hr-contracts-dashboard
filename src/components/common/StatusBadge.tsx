import { cn } from '@/lib/utils';
import type { GenericStatus } from '@/lib/status';
import { statusLabels } from '@/lib/status';

const STYLE: Record<GenericStatus, string> = {
  active:   'bg-status-active-soft text-status-active border-status-active/20',
  expiring: 'bg-status-expiring-soft text-status-expiring border-status-expiring/20',
  expired:  'bg-status-expired-soft text-status-expired border-status-expired/20',
  missing:  'bg-status-missing-soft text-status-missing border-status-missing/20',
  info:     'bg-status-info-soft text-status-info border-status-info/20',
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: GenericStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        STYLE[status],
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'active' && 'bg-status-active',
          status === 'expiring' && 'bg-status-expiring',
          status === 'expired' && 'bg-status-expired',
          status === 'missing' && 'bg-status-missing',
          status === 'info' && 'bg-status-info',
        )}
      />
      {label ?? statusLabels[status]}
    </span>
  );
}
