/**
 * ProfileHeader — the operational identity card at the top of
 * /employees/:id (and any future single-entity profile).
 *
 * Anatomy:
 *   [avatar][name + subtitle][chips row]        [actions slot]
 *           [meta line: id / dept / role]
 *
 * A5.0 ships this with a stub-friendly contract: name / subtitle / chips /
 * actions / meta are all optional. The profile page may render an
 * intentional empty header when the data hasn't arrived yet (no fake
 * names, no fake numbers).
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProfileHeaderChip {
  key: string;
  label: React.ReactNode;
  tone?: 'default' | 'active' | 'expiring' | 'expired' | 'missing' | 'info';
}

const CHIP_TONE: Record<NonNullable<ProfileHeaderChip['tone']>, string> = {
  default: 'bg-muted text-muted-foreground ring-border',
  active: 'bg-status-active-soft text-status-active ring-status-active/20',
  expiring: 'bg-status-expiring-soft text-status-expiring ring-status-expiring/20',
  expired: 'bg-status-expired-soft text-status-expired ring-status-expired/20',
  missing: 'bg-status-missing-soft text-status-missing ring-status-missing/20',
  info: 'bg-status-info-soft text-status-info ring-status-info/20',
};

export interface ProfileHeaderProps {
  /** Initials shown inside the avatar circle. Use `null` to suppress avatar. */
  initials?: string | null;
  name: React.ReactNode;
  /** Secondary line under the name (e.g. Arabic name, role at company). */
  subtitle?: React.ReactNode;
  /** Small monospace meta line — typically the entity id or department. */
  meta?: React.ReactNode;
  chips?: ProfileHeaderChip[];
  /** Right-hand actions area — typically PressableButton + ActionMenu. */
  actions?: React.ReactNode;
  className?: string;
}

export function ProfileHeader({
  initials,
  name,
  subtitle,
  meta,
  chips,
  actions,
  className,
}: ProfileHeaderProps) {
  return (
    <section
      className={cn(
        'rounded-xl border bg-card text-card-foreground p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
      aria-labelledby="profile-name"
    >
      <div className="flex items-start gap-5">
        {initials !== null && (
          <div
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full shrink-0',
              'bg-primary/10 text-primary ring-1 ring-inset ring-primary/15',
              'text-base font-semibold tracking-wide',
            )}
            aria-hidden="true"
          >
            {initials || '—'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1
            id="profile-name"
            className="text-[22px] font-semibold tracking-tight leading-tight"
          >
            {name}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground leading-snug">{subtitle}</p>
          )}
          {meta && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {meta}
            </p>
          )}
          {chips && chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <li
                  key={c.key}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                    CHIP_TONE[c.tone ?? 'default'],
                  )}
                >
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {actions && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {/* Mobile actions row */}
      {actions && (
        <div className="sm:hidden mt-4 flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </section>
  );
}
