/**
 * BulkActionBar — Phase 3D.
 *
 * Floating bar that appears at the bottom-center of the viewport when
 * rows are selected. The parent passes the selected row count, the
 * filtered-row count (so the bar can offer "select all N filtered"),
 * and a list of action buttons. The bar handles clear / select-all-
 * filtered chrome consistently across modules.
 *
 * Designed to drop into any module (Employees, Contracts, Insurance,
 * Review Queue) so the UX is identical regardless of entity. Each
 * module supplies its own action list (export-selected, bulk-edit,
 * bulk-archive, bulk-link-employee, etc.).
 *
 * Visibility: rendered iff `selectedCount > 0`. Clearing or page reload
 * dismisses it. We avoid a backdrop / modal so the user can keep
 * scrolling and adjusting filters while a selection is active.
 */
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface BulkAction {
  label: string;
  /** Lucide icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'destructive';
  /** Set when a long-running mutation is in flight. */
  loading?: boolean;
  /** Set to gray out without removing. */
  disabled?: boolean;
  /** Optional shortcut hint shown in the title attribute. */
  hint?: string;
}

export interface BulkActionBarProps {
  /** How many rows are currently selected. */
  selectedCount: number;
  /** Total rows after the active filters/search, before selection. */
  filteredCount?: number;
  /** Called when the X is clicked. */
  onClear: () => void;
  /** Called when the "Select all N filtered" link is clicked. */
  onSelectAllFiltered?: () => void;
  /** Action buttons rendered left-to-right. */
  actions: BulkAction[];
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  filteredCount,
  onClear,
  onSelectAllFiltered,
  actions,
  className,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;
  const showSelectAll = onSelectAllFiltered != null
    && filteredCount != null
    && filteredCount > selectedCount;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-40',
        'rounded-full border bg-card shadow-lg px-3 py-2',
        'flex items-center gap-2 text-sm',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full"
        onClick={onClear}
        aria-label="Clear selection"
        title="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <span className="font-medium tabular">
        {selectedCount} selected
      </span>
      {showSelectAll && (
        <>
          <Separator orientation="vertical" className="h-4" />
          <button
            type="button"
            className="text-xs text-status-info hover:underline"
            onClick={onSelectAllFiltered}
          >
            Select all {filteredCount} filtered
          </button>
        </>
      )}
      {actions.length > 0 && (
        <>
          <Separator orientation="vertical" className="h-4" />
          {actions.map((a, i) => (
            <Button
              key={`${a.label}-${i}`}
              size="sm"
              variant={a.variant ?? 'outline'}
              onClick={a.onClick}
              disabled={a.disabled || a.loading}
              title={a.hint ?? a.label}
              className="h-7"
            >
              {a.icon && <a.icon className="h-3.5 w-3.5" />}
              {a.label}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
