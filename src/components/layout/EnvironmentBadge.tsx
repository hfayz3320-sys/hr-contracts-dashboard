import { envLabel } from '@/lib/env';
import { cn } from '@/lib/utils';
import { useApiState } from '@/app/dataset-context';

export function EnvironmentBadge() {
  const isDev = envLabel === 'DEV';
  const apiState = useApiState();

  const apiLabel =
    apiState === 'live'      ? 'API'
    : apiState === 'synthetic' ? 'Synthetic'
    : apiState === 'error'   ? 'API down'
                             : '…';

  const apiTone =
    apiState === 'live'      ? 'bg-status-active text-status-active-soft'
    : apiState === 'synthetic' ? 'bg-amber-400 text-amber-950'
    : apiState === 'error'   ? 'bg-status-expired text-white'
                             : 'bg-muted text-muted-foreground';

  return (
    <span className="inline-flex items-stretch rounded-full overflow-hidden ring-1 ring-inset ring-border tabular text-[11px] font-medium leading-none">
      <span
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5',
          isDev
            ? 'bg-status-info-soft text-status-info'
            : 'bg-status-active-soft text-status-active',
        )}
        title={isDev ? 'Development build' : 'Production build'}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isDev ? 'bg-status-info' : 'bg-status-active',
          )}
        />
        {envLabel}
      </span>
      <span
        className={cn('flex items-center px-2 py-0.5', apiTone)}
        title={
          apiState === 'live'      ? 'Backed by the live Worker API'
          : apiState === 'synthetic' ? 'API unreachable — showing synthetic demo data'
          : apiState === 'error'   ? 'API request failed'
                                   : 'Connecting to API…'
        }
      >
        {apiLabel}
      </span>
    </span>
  );
}
