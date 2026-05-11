/**
 * ApiErrorState — designed operational state for "the API call failed and
 * we have nothing to show."
 *
 * Replaces raw `JSON.parse: unexpected character` strings in the list pages.
 * Surfaces three plausible causes as chips, with the most likely one
 * highlighted based on the error message:
 *
 *   API down     — network failure / 5xx / no response
 *   Not signed in — 401 / 403 / "unauthorized"
 *   Preview      — HTML returned where JSON expected (preview/CDN intercept)
 *
 * The raw error message lives inside a collapsed <details> for the operator
 * who needs to debug, but the page now looks intentional instead of broken.
 */
import * as React from 'react';
import { AlertTriangle, RotateCcw, Lock, WifiOff, FlaskConical, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ApiErrorKind = 'auth' | 'preview' | 'network' | 'unknown';

export interface ApiErrorStateProps {
  /** Page-specific title, e.g. "Cannot load employees". */
  title: string;
  /**
   * Optional override for the description. Defaults to a generic operator
   * explanation that pairs with the chips below.
   */
  description?: React.ReactNode;
  /** Raw error object from react-query (or any thrown thing). */
  error: unknown;
  /** Retry handler — async-aware, drives the button's loading state. */
  onRetry: () => void | Promise<void>;
  className?: string;
}

function classifyApiError(error: unknown): ApiErrorKind {
  const msg = String(
    (error as { message?: string } | null)?.message ?? error ?? '',
  ).toLowerCase();
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthor') ||
    msg.includes('forbidden')
  ) {
    return 'auth';
  }
  if (
    msg.includes('json.parse') ||
    msg.includes('unexpected character') ||
    msg.includes('unexpected token') ||
    msg.includes('<!doctype') ||
    msg.includes('<html')
  ) {
    return 'preview';
  }
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout')
  ) {
    return 'network';
  }
  return 'unknown';
}

interface ChipDef {
  kind: ApiErrorKind;
  label: string;
  icon: LucideIcon;
}

const CHIPS: ChipDef[] = [
  { kind: 'network', label: 'API down',     icon: WifiOff },
  { kind: 'auth',    label: 'Not signed in', icon: Lock },
  { kind: 'preview', label: 'Preview',      icon: FlaskConical },
];

export function ApiErrorState({
  title,
  description,
  error,
  onRetry,
  className,
}: ApiErrorStateProps) {
  const kind = classifyApiError(error);
  const [retrying, setRetrying] = React.useState(false);

  const defaultDescription = (() => {
    switch (kind) {
      case 'auth':
        return 'Your session looks signed out, or the local preview is not authenticated against the production API. Sign in again, or use the Worker URL directly to confirm.';
      case 'preview':
        return 'The API responded with HTML instead of JSON — usually a sign that the preview/CDN intercepted the request before reaching the Worker. Hard-refresh, or hit the Worker URL directly.';
      case 'network':
        return 'No response from the API. The Worker may be unreachable, or the network is offline. Retry, or check the Worker health.';
      default:
        return 'The request did not complete. Retry, or contact the operator if it keeps failing.';
    }
  })();

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  const rawMessage = String(
    (error as { message?: string } | null)?.message ?? error ?? 'No error message available',
  );

  return (
    <section
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-xl border border-status-expired/30 bg-card text-card-foreground',
        'px-6 py-10 sm:px-10 sm:py-12',
        'animate-in fade-in slide-in-from-bottom-1 duration-base',
        className,
      )}
    >
      <div className="mx-auto max-w-md flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-status-expired-soft text-status-expired ring-1 ring-inset ring-status-expired/20">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>

        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {description ?? defaultDescription}
        </p>

        <ul className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
          {CHIPS.map((c) => {
            const Icon = c.icon;
            const active = c.kind === kind;
            return (
              <li
                key={c.kind}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
                  active
                    ? 'bg-status-expired-soft text-status-expired ring-status-expired/30 shadow-[0_0_0_3px_hsl(var(--status-expired)/0.08)]'
                    : 'bg-muted text-muted-foreground ring-border opacity-60',
                )}
                aria-current={active ? 'true' : undefined}
              >
                <Icon className="h-3 w-3" aria-hidden={true} />
                {c.label}
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleRetry}
            loading={retrying}
            loadingLabel="Retrying…"
          >
            {!retrying && <RotateCcw />}
            Retry
          </Button>
        </div>

        <details className="mt-6 w-full text-left">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors duration-fast">
            Technical details
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] font-mono leading-snug text-muted-foreground whitespace-pre-wrap break-words">
            {rawMessage}
          </pre>
        </details>
      </div>
    </section>
  );
}
