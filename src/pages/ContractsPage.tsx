import { useMemo, useState } from 'react';
import { Search, Pencil, RefreshCw, Download, CheckCircle2, Calendar, History, AlertTriangle } from 'lucide-react';
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
import { ApiErrorState } from '@/components/common/ApiErrorState';
import { cn } from '@/lib/utils';
import { classifyContractLifecycle, type ContractLifecycleBucket } from '@/lib/contract-lifecycle';
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

type LifecycleFilter = 'all' | ContractLifecycleBucket;

const LIFECYCLE_TABS: { key: LifecycleFilter; label: string; icon: React.ComponentType<{ className?: string }>; tone: 'default' | 'active' | 'info' | 'expired' }[] = [
  { key: 'all',              label: 'All',              icon: Search,         tone: 'default' },
  { key: 'current',          label: 'Current',          icon: CheckCircle2,   tone: 'active'  },
  { key: 'future',           label: 'Future',           icon: Calendar,       tone: 'info'    },
  { key: 'history',          label: 'History',          icon: History,        tone: 'default' },
  { key: 'review_required',  label: 'Review required',  icon: AlertTriangle,  tone: 'expired' },
];

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
  // Phase 7B: lifecycle is the primary axis of the page. Default lands
  // on "Current" so the page opens on actionable rows; History (old/
  // expired) is one click away and never gets auto-flagged as a defect.
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('current');

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const allTypes = useMemo(() => Array.from(new Set(contracts.map((c) => c.contractType))).sort(), [contracts]);

  // Lifecycle classification — derived once per contracts change. Same
  // business rule as Employee 360: expired contracts are HISTORY records,
  // not data defects. Only `isContractReviewRequired` rows hit Review.
  const lifecycleByContract = useMemo(() => {
    const map = new Map<string, ContractLifecycleBucket>();
    for (const c of contracts) map.set(c.id, classifyContractLifecycle(c));
    return map;
  }, [contracts]);

  const lifecycleCounts = useMemo(() => {
    const counts = { current: 0, future: 0, history: 0, review_required: 0 };
    for (const b of lifecycleByContract.values()) counts[b] = (counts[b] ?? 0) + 1;
    return counts;
  }, [lifecycleByContract]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (lifecycle !== 'all' && lifecycleByContract.get(c.id) !== lifecycle) return false;
      const emp = employeesById.get(c.employeeId);
      if (s && !c.identityNumber.includes(s) && !(emp?.fullName.toLowerCase().includes(s) ?? false)) return false;
      if (filters.status.length > 0 && !filters.status.includes(c.status)) return false;
      if (filters.types.length > 0 && !filters.types.includes(c.contractType)) return false;
      return true;
    });
  }, [contracts, employeesById, search, filters, lifecycle, lifecycleByContract]);

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

  // Summary stats for the strip above the table.
  const summary = useMemo(() => {
    const total = contracts.length;
    const active = contracts.filter((c) => c.status === 'active').length;
    const now = Date.now();
    const expiringSoon = contracts.filter((c) => {
      if (c.status !== 'active') return false;
      if (!c.endDate) return false;
      const d = new Date(c.endDate).getTime();
      if (Number.isNaN(d)) return false;
      const days = Math.floor((d - now) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 60;
    }).length;
    const expired = contracts.filter((c) => c.status === 'expired').length;
    return { total, active, expiringSoon, expired };
  }, [contracts]);

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

      {failedQuery && contracts.length === 0 ? (
        <ApiErrorState
          title="Cannot load contracts"
          error={failedQuery}
          onRetry={async () => { await Promise.all([conQuery.refetch(), empQuery.refetch()]); }}
        />
      ) : (
      <>
      {/* Phase 7B: lifecycle is the primary axis. Sections replace the
          old 4-CountCard strip — single source of truth for "what does
          today look like" without auto-flagging expired contracts as
          defects. */}
      <div className="mb-5 rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2 border-b text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium flex items-center gap-3">
          <span>Lifecycle</span>
          <span className="text-foreground/60">·</span>
          <span className="normal-case text-foreground">
            {summary.total} contracts · {distinctLinkedEmployees} employees
            {summary.expiringSoon > 0 && (
              <> · <span className="text-status-expiring font-medium">{summary.expiringSoon} expiring ≤60d</span></>
            )}
            {unmatchedCount > 0 && (
              <> · <span className="text-status-expired font-medium">{unmatchedCount} unmatched</span></>
            )}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border">
          {LIFECYCLE_TABS.map((t) => {
            const count =
              t.key === 'all' ? summary.total :
              lifecycleCounts[t.key] ?? 0;
            const sel = lifecycle === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setLifecycle(t.key)}
                aria-pressed={sel}
                className={cn(
                  'group relative px-4 py-3 text-left',
                  'transition-[background-color,transform] duration-fast ease-out-quart',
                  'hover:bg-muted/40 active:translate-y-[1px] active:duration-75',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  sel && 'bg-[hsl(var(--status-info-soft))]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'h-7 w-7 rounded-md flex items-center justify-center',
                    t.tone === 'active'   ? 'bg-status-active-soft  text-[hsl(var(--status-active))]'   :
                    t.tone === 'info'     ? 'bg-status-info-soft    text-[hsl(var(--status-info))]'     :
                    t.tone === 'expired'  ? 'bg-status-expired-soft text-[hsl(var(--status-expired))]'  :
                                            'bg-muted text-muted-foreground',
                  )}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{t.label}</div>
                    <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-none tracking-tight">{count}</div>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 right-0 -bottom-px h-[2px] rounded-t transition-colors duration-fast',
                    sel ? 'bg-foreground' : 'bg-transparent group-hover:bg-border',
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

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
              ? 'Stale cache shown — retry to refresh.'
              : contracts.length === 0
                ? 'No contracts in the database yet. Use Import Center to import PDFs.'
                : lifecycle === 'history'
                  ? 'No history in this view. Old or expired contracts are kept as history records, not defects.'
                  : lifecycle === 'review_required'
                    ? 'No review items. All contracts have intact dates and a known template.'
                    : lifecycle !== 'all'
                      ? `No contracts in the ${lifecycle} bucket match your search / filters.`
                      : 'No contracts match your filters.'
        }
      />
      </>
      )}

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
        description="Filter the contract list by lifecycle status and template type."
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
