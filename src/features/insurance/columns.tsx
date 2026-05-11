import type { ColumnDef } from '@tanstack/react-table';
import type { Insurance, Employee } from '@/types/domain';
import { StatusBadge } from '@/components/common/StatusBadge';
import { formatDate } from '@/lib/dates';
import { Badge } from '@/components/ui/badge';

function redactIqama(s: string | undefined | null): string {
  if (!s) return '';
  if (s.length < 6) return s;
  return s.slice(0, 2) + 'x'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}

/**
 * @param employeesById — legacy fallback. Primary source is the joined
 * `employeeSummary` attached by the worker (?includeEmployee=1).
 */
export function buildInsuranceColumns(
  employeesById?: Map<string, Employee>,
): ColumnDef<Insurance, unknown>[] {
  function pickEmployee(r: Insurance): {
    name: string;
    identityRedacted: string;
    linked: boolean;
  } | null {
    if (r.employeeSummary) {
      return {
        name: r.employeeSummary.fullName,
        identityRedacted: r.employeeSummary.identityNumberRedacted,
        linked: true,
      };
    }
    if (r.employeeId && employeesById) {
      const emp = employeesById.get(r.employeeId);
      if (emp) {
        return {
          name: emp.fullName,
          identityRedacted: redactIqama(emp.identityNumber),
          linked: true,
        };
      }
    }
    return null;
  }
  return [
    {
      accessorKey: 'policyNumber',
      header: 'Policy',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular">{row.original.policyNumber}</span>
      ),
    },
    {
      id: 'employee',
      header: 'Employee',
      accessorFn: (r) => pickEmployee(r)?.name ?? 'Unmatched',
      cell: ({ row }) => {
        const e = pickEmployee(row.original);
        if (!e) {
          return <Badge variant="outline" className="text-status-missing">Unmatched</Badge>;
        }
        return (
          <div>
            <div className="text-sm font-medium">{e.name}</div>
            <div className="text-xs text-muted-foreground font-mono tabular">{e.identityRedacted}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'provider',
      header: 'Provider',
    },
    {
      accessorKey: 'startDate',
      header: 'Start',
      cell: ({ row }) => <span className="tabular text-sm">{formatDate(row.original.startDate)}</span>,
    },
    {
      accessorKey: 'endDate',
      header: 'End',
      cell: ({ row }) => <span className="tabular text-sm">{formatDate(row.original.endDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];
}
