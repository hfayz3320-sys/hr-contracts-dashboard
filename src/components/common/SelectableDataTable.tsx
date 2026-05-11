/**
 * SelectableDataTable — Phase 3D.
 *
 * Drop-in successor to <DataTable> that adds:
 *   - a leading checkbox column (header + per-row)
 *   - "select all rows on current page" via the header checkbox
 *   - "select all filtered rows" affordance (the parent decides how —
 *     this component exposes the filtered-row count via prop so the
 *     bulk-action bar can render a "Select all N filtered" link)
 *
 * Selection state lives in the PARENT (`selectedIds: Set<string>` +
 * `onSelectionChange`) so multiple components — the bulk-action bar,
 * export-selected buttons, archive confirm — can share it without
 * duplicating logic. Use `getRowId` to tell the table what your row's
 * unique identifier is (default: `(row) => (row as { id: string }).id`).
 *
 * Backward-compat: the original <DataTable> stays available for pages
 * that don't need selection. Migration is one prop swap.
 */
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Row,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface SelectableDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyMessage?: string;
  className?: string;
  /** Controlled selection state (set of row ids). */
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  /**
   * How to extract the unique id for a row. Defaults to assuming the row
   * has a string `.id` field.
   */
  getRowId?: (row: T) => string;
  /**
   * Render-prop for an action button area in the table footer (e.g.
   * "Select all N filtered rows" link surfaced by the parent).
   */
  footerLeft?: React.ReactNode;
}

export function SelectableDataTable<T>({
  data,
  columns,
  onRowClick,
  pageSize = 12,
  emptyMessage = 'No results.',
  className,
  selectedIds,
  onSelectionChange,
  getRowId = (row) => (row as { id: string }).id,
  footerLeft,
}: SelectableDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    // We render row selection ourselves so it works across pages.
  });

  const total = data.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  const currentPageRows: Row<T>[] = table.getRowModel().rows;
  const currentPageIds = useMemo(
    () => currentPageRows.map((r) => getRowId(r.original)),
    [currentPageRows, getRowId],
  );

  const allCurrentSelected = currentPageIds.length > 0
    && currentPageIds.every((id) => selectedIds.has(id));
  const someCurrentSelected = currentPageIds.some((id) => selectedIds.has(id));
  const headerCheckboxState: boolean | 'indeterminate' =
    allCurrentSelected ? true : someCurrentSelected ? 'indeterminate' : false;

  function toggleAllOnPage(): void {
    const next = new Set(selectedIds);
    if (allCurrentSelected) {
      for (const id of currentPageIds) next.delete(id);
    } else {
      for (const id of currentPageIds) next.add(id);
    }
    onSelectionChange(next);
  }
  function toggleRow(id: string): void {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  }

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all rows on this page"
                  checked={headerCheckboxState}
                  onCheckedChange={toggleAllOnPage}
                />
              </TableHead>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={canSort ? 'cursor-pointer select-none' : ''}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        sortDir === 'desc' ? <ArrowDown className="h-3 w-3" /> :
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {currentPageRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            currentPageRows.map((row) => {
              const rid = getRowId(row.original);
              const checked = selectedIds.has(rid);
              return (
                <TableRow
                  key={row.id}
                  data-state={checked ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                    checked && 'bg-status-info-soft/40',
                  )}
                >
                  <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select row ${rid}`}
                      checked={checked}
                      onCheckedChange={() => toggleRow(rid)}
                    />
                  </TableCell>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 gap-3">
        <div className="text-xs text-muted-foreground tabular flex items-center gap-3">
          <span>{total === 0 ? '0 results' : `Showing ${start}–${end} of ${total}`}</span>
          {footerLeft}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
