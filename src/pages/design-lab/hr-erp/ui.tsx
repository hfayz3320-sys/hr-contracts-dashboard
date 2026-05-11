/**
 * Shared primitives for the HR ERP design lab.
 *
 * Everything here is presentational. No hooks beyond local state; no
 * data fetching; no router awareness. Keep these tight so each view file
 * stays focused on layout.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

// ---------- Chip / Pill --------------------------------------------------

export type Tone = 'default' | 'info' | 'active' | 'expiring' | 'expired' | 'missing' | 'review';

const TONE_CLASSES: Record<Tone, string> = {
  default:  'bg-muted text-muted-foreground border-border',
  info:     'bg-status-info-soft text-[hsl(var(--status-info))] border-[hsl(var(--status-info))]/20',
  active:   'bg-status-active-soft text-[hsl(var(--status-active))] border-[hsl(var(--status-active))]/20',
  expiring: 'bg-status-expiring-soft text-[hsl(var(--status-expiring))] border-[hsl(var(--status-expiring))]/20',
  expired:  'bg-status-expired-soft text-[hsl(var(--status-expired))] border-[hsl(var(--status-expired))]/20',
  missing:  'bg-status-missing-soft text-[hsl(var(--status-missing))] border-[hsl(var(--status-missing))]/20',
  review:   'bg-[hsl(var(--status-expiring-soft))] text-[hsl(var(--status-expiring))] border-[hsl(var(--status-expiring))]/30',
};

export function Chip({
  children, tone = 'default', icon, className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ---------- AliveButton --------------------------------------------------
// All ERP buttons must visibly press. Variants tuned for ERP density.

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle';

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary:   'bg-primary text-primary-foreground border-primary hover:brightness-110',
  secondary: 'bg-card text-foreground border-border hover:bg-muted/60',
  ghost:     'bg-transparent text-foreground border-transparent hover:bg-muted',
  outline:   'bg-transparent text-foreground border-border hover:bg-muted/60',
  danger:    'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] border-[hsl(var(--destructive))] hover:brightness-110',
  subtle:    'bg-muted/60 text-foreground border-transparent hover:bg-muted',
};

export const AliveButton = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<'button'> & {
  variant?: BtnVariant;
  size?: 'xs' | 'sm' | 'md';
  icon?: React.ReactNode;
}>(function AliveButton(
  { variant = 'secondary', size = 'sm', icon, className, children, ...rest }, ref,
) {
  const sizeCls =
    size === 'xs' ? 'h-7 px-2 text-[11px]' :
    size === 'md' ? 'h-9 px-4 text-[13px]' :
                    'h-8 px-3 text-[12px]';
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium',
        'transition-[transform,background-color,box-shadow,color] duration-fast ease-out-quart',
        'hover:shadow-hover',
        'active:translate-y-[1px] active:duration-75 active:shadow-press',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:pointer-events-none',
        sizeCls,
        BTN_VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
});

// ---------- TabBar -------------------------------------------------------

export function TabBar({
  tabs, value, onChange, className,
}: {
  tabs: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (k: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end gap-0 border-b border-border overflow-x-auto', className)} role="tablist">
      {tabs.map((t) => {
        const sel = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(t.key)}
            className={cn(
              'group relative inline-flex items-center gap-2 px-3.5 py-2 text-[13px] whitespace-nowrap',
              'transition-colors duration-fast',
              sel
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className={cn(
                'inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10px] tabular-nums',
                sel ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
              )}>
                {t.count}
              </span>
            )}
            <span
              className={cn(
                'absolute left-0 right-0 -bottom-px h-[2px] rounded-t',
                sel ? 'bg-foreground' : 'bg-transparent group-hover:bg-border',
                'transition-colors duration-fast',
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------- Avatar -------------------------------------------------------

export function Avatar({
  initials: i, size = 'md', className,
}: { initials: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const cls =
    size === 'sm' ? 'h-7 w-7 text-[11px] rounded-md'    :
    size === 'lg' ? 'h-12 w-12 text-[16px] rounded-xl'  :
    size === 'xl' ? 'h-20 w-20 text-[24px] rounded-2xl' :
                    'h-9 w-9 text-[12px] rounded-lg';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center font-semibold tracking-wide bg-primary/10 text-primary border border-primary/15',
        cls, className,
      )}
    >
      {i}
    </span>
  );
}

// ---------- SmartButton (Odoo "smart button" inside profile header) ------

export function SmartButton({
  count, label, icon, onClick, active,
}: {
  count: number | string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 min-w-[96px]',
        'border-r border-border last:border-r-0',
        'transition-[background-color,transform] duration-fast ease-out-quart',
        'hover:bg-muted/60',
        'active:translate-y-[1px] active:duration-75',
        active && 'bg-muted/60',
      )}
    >
      <span className="flex items-center gap-1.5 text-foreground">
        {icon}
        <span className="text-[16px] font-semibold tabular-nums leading-none">{count}</span>
      </span>
      <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{label}</span>
    </button>
  );
}

// ---------- Card panel (ERP-style, dense) --------------------------------

export function Panel({
  title, action, children, className, dense, scroll,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
  scroll?: boolean;
}) {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      {title && (
        <header className="flex items-center gap-3 px-4 py-2.5 border-b">
          <h3 className="text-[12px] font-semibold tracking-tight uppercase text-muted-foreground flex-1">{title}</h3>
          {action}
        </header>
      )}
      <div className={cn(dense ? 'p-0' : 'p-4', scroll && 'max-h-[420px] overflow-auto')}>
        {children}
      </div>
    </section>
  );
}

// ---------- FormRow ------------------------------------------------------

export function FormRow({
  label, value, mono, hint, action,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr_auto] items-start gap-3 py-1.5 px-1 -mx-1 rounded hover:bg-muted/40 transition-colors duration-fast group">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium pt-[3px]">{label}</dt>
      <dd className={cn('text-[13px] leading-snug', mono && 'font-mono')}>
        {value}
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </dd>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast">{action}</div>
    </div>
  );
}

// ---------- ToolbarSeparator ---------------------------------------------

export function Sep({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-px bg-border mx-1', className)} aria-hidden="true" />;
}
