/**
 * LoadingSkeleton — shimmer-aware skeleton placeholders.
 *
 * The shimmer is a translucent gradient that sweeps left → right over a
 * muted block; keyframe `ui-shimmer` lives in globals.css. Under
 * `prefers-reduced-motion` the gradient stays put (zero-duration animation),
 * which is also overridden globally in globals.css.
 *
 * Three primitives:
 *   <Skeleton />           — bare block, fully customisable via className
 *   <SkeletonText lines />  — N lines, last line is shorter
 *   <SkeletonRow />         — table-row sized
 *   <SkeletonCard />        — card-shaped, with header strip + lines
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

interface BaseProps {
  className?: string;
  /** Stagger offset for parallel siblings (ms). */
  delay?: number;
}

function shimmerStyle(delay?: number): React.CSSProperties | undefined {
  if (!delay) return undefined;
  return { animationDelay: `${delay}ms` } as React.CSSProperties;
}

export function Skeleton({ className, delay }: BaseProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/70',
        // The shimmer is a child ::after layer to keep the muted block itself
        // sharp. 1.2s linear infinite, 8% peak opacity.
        'after:absolute after:inset-0',
        "after:content-['']",
        'after:bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.08)_50%,transparent_70%)]',
        'after:animate-[ui-shimmer_1.2s_linear_infinite]',
        // dark-mode shimmer needs warmer overlay to read against #0f1623-ish
        'dark:after:bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.06)_50%,transparent_70%)]',
        className,
      )}
      style={shimmerStyle(delay)}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: { lines?: number } & BaseProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 && 'w-2/3')}
          delay={i * 60}
        />
      ))}
    </div>
  );
}

export function SkeletonRow({ className, delay }: BaseProps) {
  return (
    <div className={cn('flex items-center gap-4 py-3', className)}>
      <Skeleton className="h-4 w-4 rounded-sm" delay={delay} />
      <Skeleton className="h-3 flex-1" delay={(delay ?? 0) + 60} />
      <Skeleton className="h-3 w-24" delay={(delay ?? 0) + 120} />
      <Skeleton className="h-3 w-20" delay={(delay ?? 0) + 180} />
    </div>
  );
}

export function SkeletonCard({ className, delay }: BaseProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      <Skeleton className="h-3 w-24" delay={delay} />
      <Skeleton className="h-7 w-32 mt-3" delay={(delay ?? 0) + 80} />
      <Skeleton className="h-3 w-40 mt-4" delay={(delay ?? 0) + 160} />
    </div>
  );
}
