import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A5.0 Button upgrade.
 *
 * Adds the three states that the operational interface system requires:
 *
 *   hover   — `-translate-y-px` + shadow-hover + bg ⇡5%   (var --motion-fast)
 *   pressed — `translate-y-[1px] scale-[0.98]` + shadow-press + bg ⇡8% (75ms)
 *   loading — leading spinner replaces icons, label dims, aria-busy=true,
 *             pointer-events disabled so the user cannot double-fire.
 *
 * Existing variants/sizes are untouched. Every callsite (about 60 places at
 * the time of A5.0) keeps working without changes; the press-down feel is
 * additive.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'ring-offset-background',
    'transition-[transform,box-shadow,background-color,color,opacity] duration-fast ease-out-quart',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50',
    'hover:-translate-y-px hover:shadow-hover',
    'active:translate-y-[1px] active:scale-[0.98] active:shadow-press active:duration-75',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    'aria-busy:cursor-progress aria-busy:pointer-events-none',
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:bg-accent/80 hover:shadow-none',
        link: 'text-primary underline-offset-4 hover:underline hover:translate-y-0 hover:shadow-none active:translate-y-0',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * When true, shows a leading spinner, sets `aria-busy="true"`, disables
   * pointer events, dims the label slightly. The button KEEPS its width so
   * a clicked button doesn't reflow the row.
   */
  loading?: boolean;
  /**
   * Optional sr-only loading label for screen readers (e.g. "Saving…").
   * Visible label text stays the same.
   */
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, loadingLabel, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const ariaBusy = loading ? true : undefined;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={ariaBusy}
        data-loading={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />}
        <span className={cn('inline-flex items-center gap-2', loading && 'opacity-80')}>
          {children}
        </span>
        {loading && loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
