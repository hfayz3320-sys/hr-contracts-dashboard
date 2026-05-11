import type { ColumnDef } from '@tanstack/react-table';
import type { Contract, Employee } from '@/types/domain';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { formatDate, daysUntil } from '@/lib/dates';

/**
 * Build the Contracts table columns.
 *
 * The optional `employeesById` map is a fallback path for tests / pages
 * that still pass a frontend-derived employees map. In production the
 * primary source is the joined `employeeSummary` attached to each row by
 * the worker (Phase 3B `?includeEmployee=1`), so a parallel /api/employees
 * fetch is no longer required to render names.
 */
export function buildContractColumns(
  employeesById?: Map<string, Employee>,
): ColumnDef<Contract, unknown>[] {
  function pickEmployee(r: Contract): {
    name: string;
    identityRedacted: string;
    linked: boolean;
  } {
    if (r.employeeSummary) {
      return {
        name: r.employeeSummary.fullName,
        identityRedacted: r.employeeSummary.identityNumberRedacted,
        linked: true,
      };
    }
    const emp = employeesById?.get(r.employeeId);
    if (emp) {
      return {
        name: emp.fullName,
        identityRedacted: redactIqama(r.identityNumber),
        linked: true,
      };
    }
    return {
      name: '—',
      identityRedacted: redactIqama(r.identityNumber),
      linked: false,
    };
  }
  return [
    {
      accessorKey: 'id',
      header: 'Contract',
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs tabular">{row.original.id}</div>
          <div className="text-[11px] text-muted-foreground">v{row.original.version}</div>
        </div>
      ),
    },
    {
      id: 'employee',
      header: 'Employee',
      accessorFn: (r) => pickEmployee(r).name,
      cell: ({ row }) => {
        const e = pickEmployee(row.original);
        return (
          <div>
            <div className="text-sm font-medium flex items-center gap-1.5">
              {e.name}
              {!e.linked && (
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-status-expired text-status-expired">
                  unmatched
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono tabular">
              {e.identityRedacted}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'contractType',
      header: 'Type',
      cell: ({ row }) => <span className="text-sm">{row.original.contractType}</span>,
    },
    {
      accessorKey: 'startDate',
      header: 'Start',
      cell: ({ row }) => <span className="tabular text-sm">{formatDate(row.original.startDate)}</span>,
    },
    {
      accessorKey: 'endDate',
      header: 'End',
      cell: ({ row }) => {
        const days = daysUntil(row.original.endDate);
        const hint = days === null ? '' : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`;
        return (
          <div className="tabular text-sm">
            {formatDate(row.original.endDate)}
            <div className="text-[11px] text-muted-foreground">{hint}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}

function redactIqama(s: string | undefined | null): string {
  if (!s) return '';
  if (s.length < 6) return s;
  return s.slice(0, 2) + 'x'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}
