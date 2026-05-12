/**
 * PathBackButton — Phase 9 (UI cleanup).
 *
 * Renders a Back-styled control that navigates to the structural parent of
 * the CURRENT URL path. Distinct from `history.back()`:
 *
 *   - History back is unreliable: it may take the user back to a different
 *     module, an external referrer, or do nothing if they typed the URL.
 *   - Path back is deterministic: each route knows its parent (or has no
 *     meaningful parent and the button doesn't render at all).
 *
 * The rule table lives in `@/lib/parent-path` so tests and other helpers
 * can import it without pulling React.
 */
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parentPathFor } from '@/lib/parent-path';

export interface PathBackButtonProps {
  /** Override the computed parent (rare — for routes outside the table). */
  to?: string;
  /** Override the button label. Defaults to "Back". */
  label?: string;
  className?: string;
}

export function PathBackButton({ to, label, className }: PathBackButtonProps) {
  const location = useLocation();
  const target = to ?? parentPathFor(location.pathname);
  if (!target) return null;

  return (
    <Link
      to={target}
      aria-label={label ?? 'Back'}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] font-medium',
        'border border-input bg-background text-foreground',
        'transition-[transform,background-color,box-shadow] duration-fast ease-out-quart',
        'hover:bg-accent hover:text-accent-foreground hover:-translate-y-px hover:shadow-hover',
        'active:translate-y-[1px] active:duration-75 active:shadow-press',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? 'Back'}
    </Link>
  );
}
