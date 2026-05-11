import { useMemo, useState } from 'react';
import { Search, Pencil, RefreshCw, AlertTriangle, Download } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SelectableDataTable } from '@/components/common/SelectableDataTable';
import { BulkActionBar } from '@/components/common/BulkActionBar';
import { FilterButton, FilterDrawer, FilterGroup } from '@/components/common/FilterDrawer';
import { ExportButton } from '@/components/common/ExportButton';
import { exportToXlsx } from '@/lib/export/xlsx-export';
import { EntityEditDialog, type EntityEditField } from '@/components/common/EntityEditDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useDrawerParam } from '@/lib/hooks/use-drawer-param';
import { useMe } from '@/lib/api/use-me';
import { useEmployees, useInsurance, usePatchInsurance } from '@/lib/api/hooks';
import { buildInsuranceColumns } from '@/features/insurance/columns';
import { InsuranceDrawer } from '@/features/insurance/InsuranceDrawer';
import type { Insurance, InsuranceStatus, Employee } from '@/types/domain';

const INSURANCE_EDIT_FIELDS: EntityEditField<Insurance>[] = [
  { key: 'identityNumber', label: 'Identity / Iqama',  adminOnly: true, initial: (i) => i.identityNumber ?? '', hint: 'Changing this re-links the policy to a matching employee.' },
  { key: 'memberNumber',   label: 'Member Number',     initial: (i) => i.memberNumber ?? '' },
  { key: 'policyNumber',   label: 'Policy Number', required: true, initial: (i) => i.policyNumber },
  { key: 'provider',       label: 'Provider',     required: true, initial: (i) => i.provider },
  { key: 'startDate',      label: 'Start Date',   type: 'date', required: true, initial: (i) => i.startDate },
  { key: 'endDate',        label: 'End Date',     type: 'date', initial: (i) => i.endDate ?? '' },
  { key: 'status',         label: 'Status', type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'expired', label: 'Expired' },
      { value: 'missing', label: 'Missing' },
    ],
    initial: (i) => i.status },
];

function buildInsuranceExportColumns(empById: Map<string, Employee>) {
  return [
    { header: 'Employee Name', value: (i: Insurance) => i.employeeId ? (empById.get(i.employeeId)?.fullName ?? '') : '' },
    { header: 'Identity / Iqama', value: (i: Insurance) => i.identityNumber ?? '' },
    { header: 'Member Number', value: (i: Insurance) => i.memberNumber ?? '' },
    { header: 'Policy Number', value: (i: Insurance) => i.policyNumber },
    { header: 'Provider', value: (i: Insurance) => i.provider },
    { header: 'Start Date', value: (i: Insurance) => i.startDate, format: 'date' as const },
    { header: 'End Date', value: (i: Insurance) => i.endDate ?? '', format: 'date' as const },
    { header: 'Status', value: (i: Insurance) => i.status },
    { header: 'Matched', value: (i: Insurance) => i.matched ? 'Yes' : 'No' },
    { header: 'Unmatched Reason', value: (i: Insurance) => i.unmatchedReason ?? '' },
  ];
}

type Filters = { status: InsuranceStatus[]; matched: ('matched' | 'unmatched')[] };
const empty: Filters = { status: [], matched: [] };

export function InsurancePage() {
  // Phase 3A + 3B — react-query direct, with server-side joined
  // employeeSummary so names render without a parallel employees fetch.
  const insQuery = useInsurance(true, { includeEmployee: true });
  const empQuery = useEmployees();
  const insurance: Insurance[] = useMemo(() => insQuery.data?.items ?? [], [insQuery.data]);
  const employees: Employee[] = useMemo(() => empQuery.data?.items ?? [], [empQuery.data]);
  const { open: drawerOpen, id, openDrawer, closeDrawer } = useDrawerParam('ins');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(empty);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return insurance.filter((i) => {
      const emp = i.employeeId ? employeesById.get(i.employeeId) : undefined;
      if (
        s &&
        !i.policyNumber.toLowerCase().includes(s) &&
        !(emp?.fullName.toLowerCase().includes(s) ?? false)
      ) {
        return false;
      }
      if (filters.status.length > 0 && !filters.status.includes(i.status)) return false;
      if (filters.matched.length > 0) {
        const want = filters.matched.includes('matched') ? true : false;
        if (filters.matched.length === 1 && i.matched !== want) return false;
      }
      return true;
    });
  }, [insurance, employeesById, search, filters]);

  const selected = id ? insurance.find((i) => i.id === id) ?? null : null;

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const activeCount = filters.status.length + filters.matched.length;
  const baseColumns = useMemo(() => buildInsuranceColumns(employeesById), [employeesById]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const patchInsurance = usePatchInsurance();
  const editing = editingId ? insurance.find((i) => i.id === editingId) ?? null : null;
  const columns = useMemo(() => {
    if (!isAdmin) return baseColumns;
    return [
      ...baseColumns,
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: Insurance } }) => (
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
  }, [baseColumns, isAdmin]);

  // Phase 3B — link counts from server-side truth.
  const linkedCount = insurance.filter((i) => i.linkStatus === 'linked').length;
  const unmatchedCount = insurance.filter(
    (i) => i.linkStatus === 'unmatched' || (i.linkStatus == null && !i.matched),
  ).length;
  const failedQuery = insQuery.error ?? null;

  return (
    <div>
      <PageHeader
        title="Medical Insurance"
        description={
          insQuery.isLoading
            ? 'Loading insurance from D1…'
            : insQuery.error
              ? 'Could not load insurance — see banner below.'
              : `${insurance.length} records · ${insurance.filter((i) => !i.matched).length} unmatched`
        }
        actions={
          <>
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search policy or employee…"
                className="pl-9"
              />
            </div>
            <FilterButton activeCount={activeCount} onClick={() => setFiltersOpen(true)} />
            <Button
              variant="outline" size="sm"
              onClick={() => { insQuery.refetch(); empQuery.refetch(); }}
              disabled={insQuery.isFetching}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${insQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <ExportButton
              filename="medical-insurance"
              sheet="Insurance"
              rows={filtered}
              columns={buildInsuranceExportColumns(employeesById)}
              summary={[
                { label: 'Total insurance rows (in DB)', value: insurance.length },
                { label: 'Linked to an employee', value: linkedCount },
                { label: 'Unmatched (no employee link)', value: unmatchedCount },
                { label: 'Rows in current view', value: filtered.length },
                { label: 'Active', value: insurance.filter((i) => i.status === 'active').length },
                { label: 'Expired', value: insurance.filter((i) => i.status === 'expired').length },
                { label: 'Missing', value: insurance.filter((i) => i.status === 'missing').length },
              ]}
            />
          </>
        }
      />

      {failedQuery ? (
        <div className="mb-4 rounded-md border border-status-expired/40 bg-status-expired-soft px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-expired mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-status-expired">Failed to load insurance</div>
              <div className="text-xs text-muted-foreground mt-1 break-all">
                {String(failedQuery.message ?? failedQuery)}
              </div>
              <Button
                variant="outline" size="sm" className="mt-2 h-7"
                onClick={() => { insQuery.refetch(); empQuery.refetch(); }}
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SelectableDataTable
        data={filtered}
        columns={columns}
        onRowClick={(row) => openDrawer(row.id)}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        emptyMessage={
          insQuery.isLoading
            ? 'Loading…'
            : insQuery.error
              ? 'Data unavailable — fix the error above and retry.'
              : insurance.length === 0
                ? 'No insurance policies in the database yet. Use Import Center to import the Bupa Excel file.'
                : 'No insurance records match your filters.'
        }
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        filteredCount={filtered.length}
        onClear={() => setSelectedIds(new Set())}
        onSelectAllFiltered={() => setSelectedIds(new Set(filtered.map((i) => i.id)))}
        actions={[
          {
            label: 'Export selected',
            icon: Download,
            onClick: async () => {
              const rows = filtered.filter((i) => selectedIds.has(i.id));
              await exportToXlsx(
                {
                  filename: 'insurance-selection',
                  sheet: 'Insurance',
                  rows,
                  columns: buildInsuranceExportColumns(employeesById),
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

      <FilterDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filter insurance"
        activeCount={activeCount}
        onApply={() => setFilters(filters)}
        onReset={() => setFilters(empty)}
      >
        <FilterGroup label="Status">
          {(['active', 'expired', 'missing'] as InsuranceStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <Checkbox
                id={`ins-status-${s}`}
                checked={filters.status.includes(s)}
                onCheckedChange={() => setFilters((f) => ({ ...f, status: toggle(f.status, s) }))}
              />
              <Label htmlFor={`ins-status-${s}`} className="capitalize cursor-pointer">{s}</Label>
            </div>
          ))}
        </FilterGroup>
        <FilterGroup label="Matching">
          {(['matched', 'unmatched'] as const).map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                id={`ins-match-${m}`}
                checked={filters.matched.includes(m)}
                onCheckedChange={() => setFilters((f) => ({ ...f, matched: toggle(f.matched, m) }))}
              />
              <Label htmlFor={`ins-match-${m}`} className="capitalize cursor-pointer">{m}</Label>
            </div>
          ))}
        </FilterGroup>
      </FilterDrawer>

      <InsuranceDrawer
        open={drawerOpen}
        onOpenChange={(o) => !o && closeDrawer()}
        insurance={selected}
      />

      <EntityEditDialog<Insurance>
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `Edit insurance for ${editing.policyNumber}` : 'Edit insurance'}
        description="Changes saved to D1 + audit log. Identity edits re-link the policy to a matching employee."
        record={editing}
        fields={INSURANCE_EDIT_FIELDS}
        isAdmin={isAdmin}
        onSave={async (patch) => {
          if (!editing) return;
          await patchInsurance.mutateAsync({ id: editing.id, payload: patch });
        }}
      />
    </div>
  );
}
