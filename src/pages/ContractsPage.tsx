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
import { useContracts, useEmployees, usePatchContract } from '@/lib/api/hooks';
import { buildContractColumns } from '@/features/contracts/columns';
import { ContractDrawer } from '@/features/contracts/ContractDrawer';
import type { Contract, ContractStatus, Employee } from '@/types/domain';

const CONTRACT_EDIT_FIELDS: EntityEditField<Contract>[] = [
  { key: 'identityNumber', label: 'Identity / Iqama', adminOnly: true, initial: (c) => c.identityNumber, hint: 'Changing this re-links the contract to the matching employee.' },
  { key: 'contractType',   label: 'Contract Type', required: true, initial: (c) => c.contractType },
  { key: 'startDate',      label: 'Start Date', type: 'date', required: true, initial: (c) => c.startDate },
  { key: 'endDate',        label: 'End Date',   type: 'date', required: true, initial: (c) => c.endDate },
  { key: 'status',         label: 'Status', type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'expiring', label: 'Expiring' },
      { value: 'expired', label: 'Expired' },
    ],
    initial: (c) => c.status },
];

function buildContractExportColumns(empById: Map<string, Employee>) {
  return [
    { header: 'Employee Name', value: (c: Contract) => empById.get(c.employeeId)?.fullName ?? '' },
    { header: 'Identity / Iqama', value: (c: Contract) => c.identityNumber },
    { header: 'Contract Type', value: (c: Contract) => c.contractType },
    { header: 'Start Date', value: (c: Contract) => c.startDate, format: 'date' as const },
    { header: 'End Date', value: (c: Contract) => c.endDate, format: 'date' as const },
    { header: 'Status', value: (c: Contract) => c.status },
    { header: 'Version', value: (c: Contract) => c.version },
    { header: 'Source PDF', value: (c: Contract) => c.fileHash.slice(0, 12) + '…' },
    { header: 'Extraction Confidence', value: (c: Contract) => c.extractionConfidence != null ? `${Math.round(c.extractionConfidence * 100)}%` : '' },
  ];
}

type Filters = { status: ContractStatus[]; types: string[] };
const empty: Filters = { status: [], types: [] };

export function ContractsPage() {
  // Phase 3A: react-query direct. Phase 3B: opt-in joined employee
  // summary so each row carries `employeeSummary` server-side. The
  // parallel `useEmployees()` call is kept ONLY as a legacy fallback
  // for rows where the join didn't resolve, and to power the bulk-link
  // employee picker (which needs the full identity to match against).
  const conQuery = useContracts(true, { includeEmployee: true });
  const empQuery = useEmployees();
  const contracts: Contract[] = useMemo(() => conQuery.data?.items ?? [], [conQuery.data]);
  const employees: Employee[] = useMemo(() => empQuery.data?.items ?? [], [empQuery.data]);
  const { open: drawerOpen, id, openDrawer, closeDrawer } = useDrawerParam('contract');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(empty);

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const allTypes = useMemo(() => Array.from(new Set(contracts.map((c) => c.contractType))).sort(), [contracts]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contracts.filter((c) => {
      const emp = employeesById.get(c.employeeId);
      if (s && !c.identityNumber.includes(s) && !(emp?.fullName.toLowerCase().includes(s) ?? false)) return false;
      if (filters.status.length > 0 && !filters.status.includes(c.status)) return false;
      if (filters.types.length > 0 && !filters.types.includes(c.contractType)) return false;
      return true;
    });
  }, [contracts, employeesById, search, filters]);

  const selected = id ? contracts.find((c) => c.id === id) ?? null : null;

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const activeCount = filters.status.length + filters.types.length;
  const baseColumns = useMemo(() => buildContractColumns(employeesById), [employeesById]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const patchContract = usePatchContract();
  const editing = editingId ? contracts.find((c) => c.id === editingId) ?? null : null;
  const columns = useMemo(() => {
    if (!isAdmin) return baseColumns;
    return [
      ...baseColumns,
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: Contract } }) => (
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

  // Phase 3B: counts derived from server-side linkStatus when available,
  // so they stay correct even if the parallel employees fetch fails.
  const linkedCount = contracts.filter((c) => c.linkStatus === 'linked').length;
  const unmatchedCount = contracts.filter((c) => c.linkStatus === 'unmatched').length;
  const distinctLinkedEmployees = new Set(
    contracts.filter((c) => c.linkStatus === 'linked').map((c) => c.employeeId),
  ).size;
  const failedQuery = conQuery.error ?? null;

  return (
    <div>
      <PageHeader
        title="Contracts"
        description={
          conQuery.isLoading
            ? 'Loading contracts from D1…'
            : conQuery.error
              ? 'Could not load contracts — see banner below.'
              : `${contracts.length} contracts across ${distinctLinkedEmployees} employees`
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
            <FilterButton activeCount={activeCount} onClick={() => setFiltersOpen(true)} />
            <Button
              variant="outline" size="sm"
              onClick={() => { conQuery.refetch(); empQuery.refetch(); }}
              disabled={conQuery.isFetching}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${conQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <ExportButton
              filename="contracts"
              sheet="Contracts"
              rows={filtered}
              columns={buildContractExportColumns(employeesById)}
              summary={[
                { label: 'Total contracts (in DB)', value: contracts.length },
                { label: 'Linked to an employee', value: linkedCount },
                { label: 'Unmatched (no employee)', value: unmatchedCount },
                { label: 'Distinct employees with contracts', value: distinctLinkedEmployees },
                { label: 'Rows in current view', value: filtered.length },
                { label: 'Active', value: contracts.filter((c) => c.status === 'active').length },
                { label: 'Expiring', value: contracts.filter((c) => c.status === 'expiring').length },
                { label: 'Expired', value: contracts.filter((c) => c.status === 'expired').length },
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
              <div className="font-medium text-status-expired">Failed to load contracts</div>
              <div className="text-xs text-muted-foreground mt-1 break-all">
                {String(failedQuery.message ?? failedQuery)}
              </div>
              <Button
                variant="outline" size="sm" className="mt-2 h-7"
                onClick={() => { conQuery.refetch(); empQuery.refetch(); }}
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
          conQuery.isLoading
            ? 'Loading…'
            : conQuery.error
              ? 'Data unavailable — fix the error above and retry.'
              : contracts.length === 0
                ? 'No contracts in the database yet. Use Import Center to import PDFs.'
                : 'No contracts match your filters.'
        }
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        filteredCount={filtered.length}
        onClear={() => setSelectedIds(new Set())}
        onSelectAllFiltered={() => setSelectedIds(new Set(filtered.map((c) => c.id)))}
        actions={[
          {
            label: 'Export selected',
            icon: Download,
            onClick: async () => {
              const rows = filtered.filter((c) => selectedIds.has(c.id));
              await exportToXlsx(
                {
                  filename: 'contracts-selection',
                  sheet: 'Contracts',
                  rows,
                  columns: buildContractExportColumns(employeesById),
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
        title="Filter contracts"
        activeCount={activeCount}
        onApply={() => setFilters(filters)}
        onReset={() => setFilters(empty)}
      >
        <FilterGroup label="Status">
          {(['active', 'expiring', 'expired'] as ContractStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <Checkbox
                id={`ctr-status-${s}`}
                checked={filters.status.includes(s)}
                onCheckedChange={() => setFilters((f) => ({ ...f, status: toggle(f.status, s) }))}
              />
              <Label htmlFor={`ctr-status-${s}`} className="capitalize cursor-pointer">{s}</Label>
            </div>
          ))}
        </FilterGroup>
        <FilterGroup label="Type">
          {allTypes.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <Checkbox
                id={`ctr-type-${t}`}
                checked={filters.types.includes(t)}
                onCheckedChange={() => setFilters((f) => ({ ...f, types: toggle(f.types, t) }))}
              />
              <Label htmlFor={`ctr-type-${t}`} className="cursor-pointer">{t}</Label>
            </div>
          ))}
        </FilterGroup>
      </FilterDrawer>

      <ContractDrawer
        open={drawerOpen}
        onOpenChange={(o) => !o && closeDrawer()}
        contract={selected}
      />

      <EntityEditDialog<Contract>
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `Fix contract` : 'Edit contract'}
        description="Save corrections to extracted contract fields. Audit logged."
        record={editing}
        fields={CONTRACT_EDIT_FIELDS}
        isAdmin={isAdmin}
        onSave={async (patch) => {
          if (!editing) return;
          await patchContract.mutateAsync({ id: editing.id, payload: patch });
        }}
      />
    </div>
  );
}
