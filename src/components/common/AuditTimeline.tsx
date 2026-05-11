import type { AuditEvent } from '@/types/domain';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<AuditEvent['status'], string> = {
  ok:      'bg-status-active',
  warning: 'bg-status-expiring',
  error:   'bg-status-expired',
};

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="relative border-l border-border ml-2">
      {events.map((e) => (
        <li key={e.id} className="ml-6 mb-5 last:mb-0">
          <span
            className={cn(
              'absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background',
              STATUS_DOT[e.status],
            )}
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{e.action}</span>
            <span className="text-xs text-muted-foreground">on {e.target}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground tabular">
            {formatDateTime(e.at)} · {e.actor}
          </div>
          {e.details && <div className="mt-1 text-xs text-muted-foreground">{e.details}</div>}
        </li>
      ))}
    </ol>
  );
}
