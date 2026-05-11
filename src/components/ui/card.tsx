import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * A5.0 Card upgrade.
 *
 * Adds an `interactive` variant that lights up on hover/focus/press. The
 * default variant is byte-equivalent in rendered output to pre-A5.0 callers
 * (Dashboard cards, drawer content, settings panels, etc.) so we don't
 * regress those surfaces. New consumers opt in via `<Card interactive>` or
 * the dedicated `<InteractiveCard>` wrapper in ui-foundation.
 */
const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
  {
    variants: {
      interactive: {
        false: '',
        true: cn(
          'cursor-pointer select-none',
          'transition-[transform,box-shadow,background-color,border-color] duration-base ease-out-quart',
          'hover:-translate-y-px hover:shadow-hover hover:border-primary/30 hover:bg-surface-elevated',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'active:translate-y-0 active:scale-[0.995] active:shadow-press active:duration-75',
          'aria-disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:pointer-events-none',
        ),
      },
    },
    defaultVariants: { interactive: false },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ interactive }), className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { cardVariants };
