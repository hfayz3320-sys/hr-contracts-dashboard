/**
 * InteractiveCard — clickable / focusable Card surface.
 *
 * Visual: same Card as elsewhere, plus the `interactive` variant we added in
 * `ui/card.tsx` (hover lift, hover shadow, hover border tint, surface
 * elevation, focus ring, press sink). The only thing this wrapper does over
 * `<Card interactive>` is give us a default `role="button"` + keyboard
 * activation when an `onClick` is provided, and a clean `to` prop for
 * link-cards (rendered as an `<a>` via Slot semantics).
 *
 * Usage:
 *   <InteractiveCard onClick={fn}> ... </InteractiveCard>
 *   <InteractiveCard to="/employees/emp_123"> ... </InteractiveCard>
 *   <InteractiveCard>  (static — falls back to non-interactive)
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Card, type CardProps } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface InteractiveCardProps
  extends Omit<CardProps, 'interactive' | 'onClick'> {
  /** Render the card as a `<Link>` to this route. Mutually exclusive with `onClick`. */
  to?: string;
  /** Click handler. The card gets `role="button"` and keyboard activation. */
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** When true, suppresses hover/press affordance and blocks interaction. */
  disabled?: boolean;
  /** Aria label for icon-only or visually-light cards. */
  'aria-label'?: string;
}

export const InteractiveCard = React.forwardRef<HTMLDivElement, InteractiveCardProps>(
  ({ to, onClick, disabled, className, children, ...props }, ref) => {
    const isInteractive = !disabled && (Boolean(to) || Boolean(onClick));

    const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
      if (!isInteractive || to) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
      }
    };

    if (to && !disabled) {
      return (
        <Link
          to={to}
          className={cn('block focus:outline-none', className)}
          aria-label={props['aria-label']}
        >
          <Card
            ref={ref}
            interactive
            tabIndex={-1}
            {...props}
          >
            {children}
          </Card>
        </Link>
      );
    }

    return (
      <Card
        ref={ref}
        interactive={isInteractive}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-disabled={disabled || undefined}
        onClick={isInteractive ? onClick : undefined}
        onKeyDown={isInteractive ? onKeyDown : undefined}
        className={className}
        {...props}
      >
        {children}
      </Card>
    );
  },
);
InteractiveCard.displayName = 'InteractiveCard';
