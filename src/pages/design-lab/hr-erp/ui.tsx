/**
 * Lab-local re-exports.
 *
 * Phase 7A lifted the shared primitives into `@/components/ui-foundation/`.
 * The lab keeps importing from `./ui` so its existing files don't churn,
 * and Avatar / Sep stay local because they're lab-only conveniences.
 */
import { cn } from '@/lib/utils';

export { AliveButton } from '@/components/ui-foundation/AliveButton';
export { Chip, type ChipTone } from '@/components/ui-foundation/Chip';
export { SmartButton } from '@/components/ui-foundation/SmartButton';
export { Panel } from '@/components/ui-foundation/Panel';
export { FormRow } from '@/components/ui-foundation/FormRow';
export { TabBar } from '@/components/ui-foundation/TabBar';

// Re-export Tone alias for files that still reference it.
export type { ChipTone as Tone } from '@/components/ui-foundation/Chip';

// ---------- Avatar (lab-local — production uses initialsFromName + Card) -

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

// ---------- Sep (lab-local — toolbar separator) --------------------------

export function Sep({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-px bg-border mx-1', className)} aria-hidden="true" />;
}
