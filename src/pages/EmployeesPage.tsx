import { useMemo, useState } from 'react';
import { Search, Pencil, RefreshCw, AlertTriangle, Download } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SelectableDataTable } from '@/components/common/SelectableDataTable';
import { BulkActionBar } from '@/components/common/BulkActionBar';
import { FilterButton } from '@/components/common/FilterDrawer';
import { ExportButton } from '@/components/common/ExportButton';
import { exportToXlsx } from '@/lib/export/xlsx-export';
import { EntityEditDialog, type EntityEditField } from '@/components/common/EntityEditDialog';
import { useDrawerParam } from '@/lib/hooks/use-drawer-param';
import { useMe } from '@/lib/api/use-me';
import { useEmployees, usePatchEmployee } from '@/lib/api/hooks';
import { employeeColumns } from '@/features/employees/columns';
import { EmployeeDrawer } from '@/features/employees/EmployeeDrawer';
import { EmployeeFiltersDrawer } from '@/features/employees/EmployeeFilters';
import {
  emptyEmployeeFilters,
  countEmployeeFilters,
  type EmployeeFilterValues,
} from '@/features/employees/filter-types';
import type { Employee } from '@shared/domain';

const EMPLOYEE_EDIT_FIELDS: EntityEditField<Employee>[] = [
  { key: 'fullName',         label: 'Full Name',         required: true, initial: (e) => e.fullName },
  { key: 'identityNumber',   label: 'Identity / Iqama',  adminOnly: true, initial: (e) => e.identityNumber, hint: 'Primary match key — change with care.' },
  { key: 'employeeNumber',   label: 'Employee Number',   initial: (e) => e.employeeNumberHistory.find((h) => h.to == null)?.number ?? '' },
  { key: 'nationality',      label: 'Nationality',       initial: (e) => e.nationality ?? '' },
  { key: 'jobTitle',         label: 'Job Title',         initial: (e) => e.jobTitle ?? '' },
  { key: 'department',       label: 'Department / Site', initial: (e) => e.department ?? '' },
  { key: 'dateOfBirth',      label: 'Date of Birth', type: 'date', initial: (e) => e.dateOfBirth ?? '' },
  { key: 'hireDate',         label: 'Hire Date',     type: 'date', initial: (e) => e.hireDate ?? '' },
  { key: 'status',           label: 'Status', type: 'select',
    options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
    initial: (e) => e.status },
];

const EMPLOYEE_EXPORT_COLUMNS = [
  { header: 'Employee Number', value: (e: Employee) => e.employeeNumberHistory.find((h) => h.to == null)?.number ?? '' },
  { header: 'Full Name', value: (e: Employee) => e.fullName },
  { header: 'Identity / Iqama', value: (e: Employee) => e.identityNumber },
  { header: 'Nationality', value: (e: Employee) => e.nationality ?? '' },
  { header: 'Job Title', value: (e: Employee) => e.jobTitle ?? '' },
  { header: 'Department / Site', value: (e: Employee) => e.department ?? '' },
  { header: 'Date of Birth', value: (e: Employee) => e.dateOfBirth ?? '', format: 'date' as const },
  { header: 'Hire Date', value: (e: Employee) => e.hireDate ?? '', format: 'date' as const },
  { header: 'Status', value: (e: Employee) => e.status },
  { header: 'Created At', value: (e: Employee) => e.createdAt, format: 'date' as const },
];

export function EmployeesPage() {
  // Phase 3A: this page now sources employees from react-query directly,
  // NOT from the dataset context. The provider's Promise.allSettled silent
  // fallback used to mask a failed `api.employees()` as "0 employees in
  // DB" — which is exactly the bug the user observed in production. By
  // reading `useEmployees()` here, we get an explicit `error` state we
  // can render as a red banner instead of pretending the DB is empty.
  const empQuery = useEmployees();
  // Stable-reference memo so downstream `useMemo` deps don't churn.
  const employees: Employee[] = useMemo(() => empQuery.data?.items ?? [], [empQuery.data]);
  const { open: drawerOpen, id, openDrawer, closeDrawer } = useDrawerParam('emp');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<EmployeeFilterValues>(emptyEmployeeFilters);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const patchEmployee = usePatchEmployee();

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (s && !e.fullName.toLowerCase().includes(s) && !e.identityNumber.includes(s)) return false;
      if (filters.status.length > 0 && !filters.status.includes(e.status)) return false;
      if (filters.departments.length > 0 && (!e.department || !filters.departments.includes(e.department))) return false;
      return true;
    });
  }, [employees, search, filters]);

  const selected = id ? employees.find((e) => e.id === id) ?? null : null;
  const editing = editingId ? employees.find((e) => e.id === editingId) ?? null : null;

  const columnsWithEdit = useMemo(() => {
    if (!isAdmin) return employeeColumns;
    return [
      ...employeeColumns,
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: Employee } }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setEditingId(row.original.id); }}
            className="h-7 px-2"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
        ),
      },
    ];
  }, [isAdmin]);

  return (
    <div>
      <PageHeader
        title="Employees"
        description={
          empQuery.isLoading
            ? 'Loading employees from D1…'
            : empQuery.error
              ? 'Could not load employees — see banner below.'
              : `${employees.length} people on record`
        }
        actions={
          <>
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or Iqama…"
                className="pl-9"
              />
            </div>
            <FilterButton
              activeCount={countEmployeeFilters(filters)}
              onClick={() => setFiltersOpen(true)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => empQuery.refetch()}
              disabled={empQuery.isFetching}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${empQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <ExportButton
              filename="employees"
              sheet="Employees"
              rows={filtered}
              columns={EMPLOYEE_EXPORT_COLUMNS}
              summary={[
                { label: 'Total employees (in DB)', value: employees.length },
                { label: 'Rows in current view', value: filtered.length },
                { label: 'Search query', value: search || '(none)' },
                { label: 'Status filter', value: filters.status.join(', ') || 'all' },
                { label: 'Department filter', value: filters.departments.join(', ') || 'all' },
              ]}
            />
          </>
        }
      />

      {empQuery.error ? (
        <div className="mb-4 rounded-md border border-status-expired/40 bg-status-expired-soft px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-expired mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-status-expired">Failed to load employees</div>
              <div className="text-xs text-muted-foreground mt-1 break-all">
                {String(empQuery.error.message ?? empQuery.error)}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7"
                onClick={() => empQuery.refetch()}
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SelectableDataTable
        data={filtered}
        columns={columnsWithEdit}
        onRowClick={(row) => openDrawer(row.id)}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        emptyMessage={
          empQuery.isLoading
            ? 'Loading…'
            : empQuery.error
              ? 'Data unavailable — fix the error above and retry.'
              : employees.length === 0
                ? 'No employees in the database yet. Use Import Center to load employees.'
                : 'No employees match your filters.'
        }
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        filteredCount={filtered.length}
        onClear={() => setSelectedIds(new Set())}
        onSelectAllFiltered={() => setSelectedIds(new Set(filtered.map((e) => e.id)))}
        actions={[
          {
            label: 'Export selected',
            icon: Download,
            onClick: async () => {
              const rows = filtered.filter((e) => selectedIds.has(e.id));
              await exportToXlsx(
                {
                  filename: 'employees-selection',
                  sheet: 'Employees',
                  rows,
                  columns: EMPLOYEE_EXPORT_COLUMNS,
                  summary: [
                    { label: 'Generated at', value: new Date().toISOString() },
                    { label: 'Selected count', value: rows.length },
                    { label: 'Filtered total', value: filtered.length },
                  ],
                },
                { redactIdentity: !isAdmin },
              );
            },
          },
        ]}
      />

      <EntityEditDialog<Employee>
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `Edit ${editing.fullName}` : 'Edit employee'}
        description="Changes are saved to the database and written to the audit trail."
        record={editing}
        fields={EMPLOYEE_EDIT_FIELDS}
        isAdmin={isAdmin}
        onSave={async (patch) => {
          if (!editing) return;
          await patchEmployee.mutateAsync({ id: editing.id, payload: patch });
        }}
      />

      <EmployeeFiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        values={filters}
        onApply={setFilters}
        onReset={() => setFilters(emptyEmployeeFilters)}
        employees={employees}
      />

      <EmployeeDrawer
        open={drawerOpen}
        onOpenChange={(o) => !o && closeDrawer()}
        employee={selected}
      />
    </div>
  );
}
