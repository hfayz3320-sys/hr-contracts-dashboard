/**
 * PressableButton — A5.0 primary action surface.
 *
 * Thin wrapper around the upgraded `<Button>` from `ui/button.tsx`. The
 * upgrade in A5.0 already adds the press-down transform and loading state to
 * the underlying Button, but we keep this wrapper for two reasons:
 *
 *   1. Naming clarity — code that wants the "operational" feel imports
 *      `<PressableButton>` so the intent is visible in the JSX.
 *   2. Future-proofing — if we need to tune press behavior per role (e.g.
 *      reduce travel for icon-only buttons), one wrapper is easier to
 *      adjust than rewriting every callsite.
 *
 * Behavior:
 *   hover     - 1px lift + shadow-hover + 5% bg shift   (var(--motion-fast))
 *   focus     - 2px ring + 2px offset
 *   pressed   - 1px sink + scale 0.98 + shadow-press   (75ms)
 *   loading   - leading spinner, label dimmed, aria-busy=true, click off
 *   disabled  - opacity 50% + saturate 50% + cursor-not-allowed
 *
 * Tooltips: if `tooltip` is provided, the button is wrapped in a Radix
 * Tooltip so disabled-with-explanation buttons (e.g. "Available in A5.1")
 * still surface their reason to mouse + keyboard users.
 */
import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export interface PressableButtonProps extends ButtonProps {
  /**
   * Optional tooltip text — surfaces as Radix Tooltip on hover/focus. Useful
   * for icon-only buttons and for disabled buttons that need to explain why.
   */
  tooltip?: string;
}

export const PressableButton = React.forwardRef<HTMLButtonElement, PressableButtonProps>(
  ({ tooltip, ...props }, ref) => {
    const btn = <Button ref={ref} {...props} />;
    if (!tooltip) return btn;
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          {/* asChild forwards refs onto the button so disabled buttons still
              trigger the tooltip — Radix wraps a `span` around disabled
              elements automatically. */}
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="bottom">{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
PressableButton.displayName = 'PressableButton';
