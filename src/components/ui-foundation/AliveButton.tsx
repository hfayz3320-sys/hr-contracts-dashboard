/**
 * AliveButton — dense ERP-style button with a visible press.
 *
 * Distinct from PressableButton (which is the default shadcn primary).
 * AliveButton is tuned for ERP density (small heights, tight padding) and
 * is the right choice inside ProfileHeader smart buttons, action bars,
 * dense list inspectors, and any "Odoo-style" surface.
 *
 *   ┌────────────┐         ┌────────────┐
 *   │   button   │  hover  │   button   │  active: translate-y-[1px]
 *   └────────────┘         └────────────┘
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export type AliveButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle';
export type AliveButtonSize = 'xs' | 'sm' | 'md';

const VARIANT_CLASSES: Record<AliveButtonVariant, string> = {
  primary:   'bg-primary text-primary-foreground border-primary hover:brightness-110',
  secondary: 'bg-card text-foreground border-border hover:bg-muted/60',
  ghost:     'bg-transparent text-foreground border-transparent hover:bg-muted',
  outline:   'bg-transparent text-foreground border-border hover:bg-muted/60',
  danger:    'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] border-[hsl(var(--destructive))] hover:brightness-110',
  subtle:    'bg-muted/60 text-foreground border-transparent hover:bg-muted',
};

const SIZE_CLASSES: Record<AliveButtonSize, string> = {
  xs: 'h-7 px-2 text-[11px]',
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-9 px-4 text-[13px]',
};

export interface AliveButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  variant?: AliveButtonVariant;
  size?: AliveButtonSize;
  icon?: React.ReactNode;
}

export const AliveButton = React.forwardRef<HTMLButtonElement, AliveButtonProps>(
  function AliveButton(
    { variant = 'secondary', size = 'sm', icon, className, children, type = 'button', ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        {...rest}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border font-medium',
          'transition-[transform,background-color,box-shadow,color] duration-fast ease-out-quart',
          'hover:shadow-hover',
          'active:translate-y-[1px] active:duration-75 active:shadow-press',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:opacity-50 disabled:pointer-events-none',
          SIZE_CLASSES[size],
          VARIANT_CLASSES[variant],
          className,
        )}
      >
        {icon}
        {children}
      </button>
    );
  },
);
