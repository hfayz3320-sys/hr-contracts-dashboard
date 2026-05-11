import type { ColumnDef } from '@tanstack/react-table';
import type { Employee } from '@/types/domain';
import { StatusBadge } from '@/components/common/StatusBadge';

export const employeeColumns: ColumnDef<Employee, unknown>[] = [
  {
    accessorKey: 'identityNumber',
    header: 'Iqama',
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular">{row.original.identityNumber}</span>
    ),
  },
  {
    accessorKey: 'fullName',
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium">
        {row.original.fullName}
        <div className="text-xs text-muted-foreground font-normal">
          {row.original.employeeNumberHistory.find((h) => h.to === null)?.number ?? '—'}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'department',
    header: 'Department',
    cell: ({ row }) => row.original.department ?? '—',
  },
  {
    accessorKey: 'jobTitle',
    header: 'Job Title',
    cell: ({ row }) => row.original.jobTitle ?? '—',
  },
  {
    accessorKey: 'nationality',
    header: 'Nationality',
    cell: ({ row }) => row.original.nationality ?? '—',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge
        status={row.original.status === 'active' ? 'active' : 'missing'}
        label={row.original.status === 'active' ? 'Active' : 'Inactive'}
      />
    ),
  },
];
