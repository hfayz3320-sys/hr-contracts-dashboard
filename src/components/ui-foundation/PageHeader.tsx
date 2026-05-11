/**
 * PageHeader (foundation) — title + description + actions + optional
 * breadcrumb. Sticky shadow when scrolled. Replaces the lightweight
 * `common/PageHeader.tsx`, which becomes a thin re-export for back-compat.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: React.ReactNode;
  to?: string;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  className?: string;
  /**
   * When true the header sticks at the top of the scroll area and gains a
   * shadow ring once scrolled. Off by default to keep existing pages
   * pixel-equivalent.
   */
  sticky?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
  sticky,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        sticky &&
          'sticky top-16 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b transition-shadow duration-base ease-out-quart',
        'mb-6',
        className,
      )}
    >
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1 text-[12px] text-muted-foreground">
            {breadcrumb.map((b, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <li key={i} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
                  {b.to && !isLast ? (
                    <Link
                      to={b.to}
                      className="hover:text-foreground transition-colors duration-fast truncate max-w-[200px]"
                    >
                      {b.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        'truncate max-w-[280px]',
                        isLast ? 'text-foreground font-medium' : '',
                      )}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {b.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight leading-none">{title}</h1>
          {description && (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
