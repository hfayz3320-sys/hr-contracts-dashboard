/**
 * ErrorState — designed error surface with retry + diagnostic.
 *
 * Same anatomy as EmptyState but with an `expired`-toned icon container,
 * a primary Retry button (uses PressableButton's loading state while the
 * retry is in flight), and an optional collapsed `<details>` with
 * diagnostic info for the operator.
 *
 * Use this when an API call or background task fails. For "no data yet" use
 * EmptyState. The two are siblings, not interchangeable.
 */
import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PressableButton } from './PressableButton';

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Diagnostic info (error message, request id). Surfaced inside a
   * collapsed <details>, sr-only-by-default for the casual case.
   */
  diagnostic?: React.ReactNode;
  /** Retry handler; may be async. When set, a Retry button renders. */
  onRetry?: () => void | Promise<void>;
  /** Label for the retry button. */
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The request did not complete. You can retry, or contact the operator if it keeps failing.',
  diagnostic,
  onRetry,
  retryLabel = 'Retry',
  className,
}: ErrorStateProps) {
  const [retrying, setRetrying] = React.useState(false);

  async function handleRetry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        'animate-in fade-in slide-in-from-bottom-1 duration-base',
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-status-expired-soft text-status-expired ring-1 ring-inset ring-status-expired/15">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {onRetry && (
        <div className="mt-5">
          <PressableButton
            variant="outline"
            size="sm"
            loading={retrying}
            loadingLabel={`${retryLabel}ing…`}
            onClick={handleRetry}
          >
            {!retrying && <RotateCcw />}
            {retryLabel}
          </PressableButton>
        </div>
      )}
      {diagnostic && (
        <details className="mt-5 w-full max-w-md text-left">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
            Diagnostic
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] font-mono leading-snug text-muted-foreground">
            {typeof diagnostic === 'string' ? diagnostic : JSON.stringify(diagnostic, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
