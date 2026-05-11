/**
 * Concept C — ERP Professional Grid.
 *
 * Design intent: dense, premium operations tool. The grid IS the
 * experience. Saved views are pinned chips. Row hover shows a preview;
 * row click opens a non-modal side inspector (not a drawer). Keyboard
 * shortcuts visible at the bottom. Filters live in a persistent rail.
 *
 * Looks like serious operations software (Workday Premium / SAP
 * Fiori / Linear ops). No 4-card strip up top.
 *
 * Mock data only.
 */
import * as React from 'react';
import {
  Search, Filter, ChevronDown, ChevronUp, ChevronRight, MoreHorizontal,
  Star, Pin, Download, Plus, ArrowDownAZ, X as XIcon, FileText, HeartPulse,
  FolderOpen, ClipboardList, ScrollText, IdCard, Briefcase, Globe, Calendar,
  ServerCrash, RefreshCw, Sparkles, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAB_EMPLOYEES, LAB_CONTRACTS, LAB_INSURANCE, LAB_SAVED_VIEWS, LAB_AGGREGATE,
} from './mock-data';

export function ConceptC({ screen }: { screen: 'dashboard' | 'employees' | 'profile' | 'contracts' | 'error' }) {
  return (
    <div className="max-w-[1480px] mx-auto px-4 py-4">
      {screen === 'dashboard' && <Dashboard />}
      {screen === 'employees' && <EmployeesGrid />}
      {screen === 'profile'   && <ProfileWithInspector />}
      {screen === 'contracts' && <ContractsGrid />}
      {screen === 'error'     && <ErrorState />}
    </div>
  );
}

// =====================================================================
// Dashboard — dense overview, no decorative cards
// =====================================================================

function Dashboard() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 pb-3 border-b">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">HR Operations</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Workforce</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <FlatBtn>Export</FlatBtn>
          <FlatBtn>Filters</FlatBtn>
          <FlatBtn variant="primary">+ New employee</FlatBtn>
        </div>
      </header>

      {/* Strip — single-line dense metrics, NOT 4 oversized cards */}
      <div className="rounded-md border bg-card">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 divide-x divide-y md:divide-y-0">
          <Metric label="Employees" value={LAB_AGGREGATE.employees} />
          <Metric label="Active contracts" value={LAB_AGGREGATE.activeContracts} />
          <Metric label="Expiring ≤30d" value={LAB_AGGREGATE.expiringIn30Days} tone="expiring" />
          <Metric label="Expiring ≤60d" value={LAB_AGGREGATE.expiringIn60Days} tone="expiring" />
          <Metric label="Active insurance" value={LAB_AGGREGATE.insurance} />
          <Metric label="Open review" value={LAB_AGGREGATE.reviewQueueOpen} tone="expired" />
          <Metric label="Unmatched" value={LAB_AGGREGATE.unmatchedContracts + LAB_AGGREGATE.unmatchedInsurance} tone="expired" />
        </div>
      </div>

      {/* Saved views + filter rail */}
      <SavedViewsRail />

      {/* The grid IS the dashboard */}
      <EmployeeTable rows={LAB_EMPLOYEES} compactColumns />
      <FooterKeys />
    </div>
  );
}

// =====================================================================
// Employees grid — main page
// =====================================================================

function EmployeesGrid() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 pb-3 border-b">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Workforce</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Employees</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <FlatBtn icon={Download}>Export</FlatBtn>
          <FlatBtn icon={Filter}>Filters · 2</FlatBtn>
          <FlatBtn icon={Plus} variant="primary">New employee</FlatBtn>
        </div>
      </header>

      <SavedViewsRail />

      <div className="grid grid-cols-[220px_1fr] gap-4">
        <FilterRail />
        <EmployeeTable rows={LAB_EMPLOYEES} />
      </div>
      <FooterKeys />
    </div>
  );
}

// =====================================================================
// Profile — opens the side inspector (non-blocking, not a drawer)
// =====================================================================

function ProfileWithInspector() {
  const selected = LAB_EMPLOYEES[0]!;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 pb-3 border-b">
        <nav className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <span>Employees</span>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-foreground font-medium">{selected.fullName}</span>
        </nav>
        <div className="flex items-center gap-1.5">
          <FlatBtn>Edit</FlatBtn>
          <FlatBtn>Audit</FlatBtn>
          <FlatBtn variant="primary">⋯ Actions</FlatBtn>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        {/* Main panel: keep the parent grid visible behind the inspector
            so users feel context (Workday Pattern). */}
        <div>
          <EmployeeTable
            rows={LAB_EMPLOYEES}
            selectedId={selected.id}
          />
        </div>

        {/* Side inspector */}
        <Inspector employeeId={selected.id} />
      </div>
      <FooterKeys />
    </div>
  );
}

// =====================================================================
// Contracts grid — lifecycle as a column
// =====================================================================

function ContractsGrid() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 pb-3 border-b">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Records</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Contracts</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <FlatBtn icon={Download}>Export</FlatBtn>
          <FlatBtn icon={Filter}>Filters · 1</FlatBtn>
          <FlatBtn icon={Plus} variant="primary">New contract</FlatBtn>
        </div>
      </header>

      <div className="flex items-center gap-1.5 flex-wrap">
        <SavedView label="All" count={LAB_CONTRACTS.length} />
        <SavedView label="Current" count={LAB_CONTRACTS.filter((c) => c.state === 'current').length} active />
        <SavedView label="Future" count={LAB_CONTRACTS.filter((c) => c.state === 'future').length} />
        <SavedView label="History" count={LAB_CONTRACTS.filter((c) => c.state === 'history').length} />
        <SavedView label="Review required" count={LAB_CONTRACTS.filter((c) => c.state === 'review').length} tone="expired" />
        <div className="flex-1" />
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-muted-foreground" aria-hidden="true" />
          <input
            className="h-7 pl-7 pr-3 rounded-md border bg-background text-[12px] w-72 focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search employee or filename…"
          />
        </div>
      </div>

      <ContractsTable rows={LAB_CONTRACTS} />
      <FooterKeys />
    </div>
  );
}

// =====================================================================
// Error — inline, doesn't blow up the whole grid
// =====================================================================

function ErrorState() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 pb-3 border-b">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Workforce</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Employees</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <FlatBtn icon={RefreshCw} variant="primary">Retry</FlatBtn>
        </div>
      </header>

      {/* Inline error banner — keeps the grid visible underneath */}
      <div className="rounded-md border border-status-expired/30 bg-status-expired-soft/40 px-4 py-3 flex items-start gap-3">
        <ServerCrash className="h-4 w-4 text-status-expired mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-status-expired">API responded with non-JSON</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
            The preview environment intercepted the request. Hard-refresh or open Worker URL directly.
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">Technical details</summary>
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/60 p-2 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words">
{`/api/employees → 200
Content-Type: text/html
Body: <!doctype html>... (4.2 kB)
Parse: Unexpected token '<', "<!doctype "... is not valid JSON`}
            </pre>
          </details>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <FlatBtn variant="ghost"><XIcon className="h-3.5 w-3.5" /></FlatBtn>
        </div>
      </div>

      <SavedViewsRail />
      <div className="grid grid-cols-[220px_1fr] gap-4">
        <FilterRail />
        <EmployeeTable rows={LAB_EMPLOYEES.slice(0, 3)} dimmed />
      </div>
      <FooterKeys />
    </div>
  );
}

// =====================================================================
// Internal primitives
// =====================================================================

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'expiring' | 'expired' }) {
  return (
    <div className={cn(
      'px-4 py-3 transition-colors duration-fast hover:bg-muted/30',
    )}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn(
        'mt-1 text-[18px] font-semibold tabular leading-none',
        tone === 'expiring' && 'text-status-expiring',
        tone === 'expired'  && 'text-status-expired',
      )}>
        {value}
      </div>
    </div>
  );
}

function SavedViewsRail() {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <SavedView label="All employees" count={LAB_AGGREGATE.employees} />
      {LAB_SAVED_VIEWS.map((v, i) => (
        <SavedView
          key={v.id}
          label={v.label}
          count={v.count}
          active={i === 0}
          tone={v.label.startsWith('Expiring') || v.label.startsWith('Missing') ? 'expiring' : undefined}
        />
      ))}
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
          'transition-colors duration-fast hover:bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        <Plus className="h-3 w-3" /> Save current view
      </button>
    </div>
  );
}

function SavedView({ label, count, active, tone }: { label: string; count: number; active?: boolean; tone?: 'expiring' | 'expired' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
        'transition-[background-color,color,box-shadow] duration-fast ease-out-quart',
        'hover:shadow-hover active:translate-y-[1px] active:duration-75',
        active
          ? 'bg-foreground text-background ring-transparent'
          : tone === 'expiring' ? 'bg-status-expiring-soft text-status-expiring ring-status-expiring/20 hover:bg-status-expiring-soft/70'
          : tone === 'expired'  ? 'bg-status-expired-soft  text-status-expired  ring-status-expired/20  hover:bg-status-expired-soft/70'
          : 'bg-card text-foreground ring-border hover:bg-muted',
      )}
    >
      {label}
      <span className={cn(
        'tabular text-[10px]',
        active ? 'opacity-80' : 'text-muted-foreground',
      )}>
        {count}
      </span>
    </button>
  );
}

function FilterRail() {
  return (
    <aside className="rounded-md border bg-card p-3 text-[12px] h-fit sticky top-[120px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Filters</h3>
        <button className="text-[11px] text-muted-foreground hover:text-foreground">Reset</button>
      </div>
      <div className="space-y-3">
        <FilterGroup label="Status">
          <FilterCheck checked label="Active" count={487} />
          <FilterCheck label="Inactive" count={14} />
        </FilterGroup>
        <FilterGroup label="Department">
          <FilterCheck label="Engineering" count={143} />
          <FilterCheck label="Operations" count={98} />
          <FilterCheck label="Finance" count={42} />
          <FilterCheck label="HR" count={18} />
          <FilterCheck label="IT" count={36} />
        </FilterGroup>
        <FilterGroup label="Nationality">
          <FilterCheck label="Saudi" count={184} />
          <FilterCheck label="Egyptian" count={91} />
          <FilterCheck label="Pakistani" count={88} />
        </FilterGroup>
        <FilterGroup label="Lifecycle">
          <FilterCheck checked label="Has current contract" count={342} />
          <FilterCheck label="Has active insurance" count={341} />
          <FilterCheck label="No issues" count={345} />
        </FilterGroup>
      </div>
    </aside>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group" open>
      <summary className="flex items-center justify-between cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground font-medium py-1 select-none">
        {label}
        <ChevronDown className="h-3 w-3 transition-transform duration-fast group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-1 space-y-1">
        {children}
      </div>
    </details>
  );
}

function FilterCheck({ label, count, checked }: { label: string; count: number; checked?: boolean }) {
  return (
    <label className={cn(
      'flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer text-[12px]',
      'transition-colors duration-fast hover:bg-muted/40',
    )}>
      <input
        type="checkbox"
        defaultChecked={checked}
        className="h-3.5 w-3.5 rounded border-input"
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[10px] text-muted-foreground tabular">{count}</span>
    </label>
  );
}

function EmployeeTable({ rows, selectedId, compactColumns, dimmed }: { rows: typeof LAB_EMPLOYEES; selectedId?: string; compactColumns?: boolean; dimmed?: boolean }) {
  return (
    <div className={cn('rounded-md border bg-card overflow-hidden', dimmed && 'opacity-60')}>
      <table className="w-full text-[12px]">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left pl-3 pr-2 py-2 font-medium w-8">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-input" />
            </th>
            <SortHeader label="Name" active />
            {!compactColumns && <SortHeader label="Iqama" />}
            <SortHeader label="Dept" />
            <SortHeader label="Title" />
            <SortHeader label="Hire date" />
            <SortHeader label="Contract" />
            <SortHeader label="Insurance" />
            <SortHeader label="Status" />
            <th className="text-right pr-3 py-2 font-medium w-12">⋯</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const ins = LAB_INSURANCE.find((i) => i.employeeId === e.id);
            const current = LAB_CONTRACTS.find((c) => c.employeeId === e.id && c.state === 'current');
            const review = LAB_CONTRACTS.some((c) => c.employeeId === e.id && c.state === 'review');
            const sel = selectedId === e.id;
            return (
              <tr
                key={e.id}
                className={cn(
                  'group border-t cursor-pointer',
                  'transition-colors duration-fast hover:bg-muted/40 active:bg-muted/60',
                  sel && 'bg-primary/5 hover:bg-primary/10',
                )}
              >
                <td className="pl-3 pr-2 py-2">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-input" />
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className={cn('font-medium truncate', sel && 'text-primary')}>{e.fullName}</div>
                      <div className="text-[10px] text-muted-foreground truncate" dir="rtl">{e.fullNameArabic}</div>
                    </div>
                  </div>
                </td>
                {!compactColumns && (
                  <td className="py-2 pr-2 font-mono text-muted-foreground">{e.identityNumber}</td>
                )}
                <td className="py-2 pr-2 text-muted-foreground truncate">{e.department}</td>
                <td className="py-2 pr-2 text-muted-foreground truncate">{e.jobTitle}</td>
                <td className="py-2 pr-2 tabular text-muted-foreground">{e.hireDate}</td>
                <td className="py-2 pr-2">
                  {review ? (
                    <ChipC tone="expired">In review</ChipC>
                  ) : current ? (
                    <ChipC tone="active">Current · v{current.version}</ChipC>
                  ) : (
                    <ChipC tone="default">None</ChipC>
                  )}
                </td>
                <td className="py-2 pr-2">
                  {ins ? (
                    <ChipC tone={ins.status === 'active' ? 'active' : 'expired'}>{ins.status}</ChipC>
                  ) : (
                    <ChipC tone="default">none</ChipC>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <ChipC tone={e.status === 'active' ? 'active' : 'missing'}>{e.status}</ChipC>
                </td>
                <td className="py-2 pr-3 text-right text-muted-foreground">
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast inline-flex items-center justify-center h-6 w-6 rounded hover:bg-background">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <div>Showing {rows.length} of {LAB_AGGREGATE.employees} · 2 filters applied</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-0.5 rounded hover:bg-background">Prev</button>
          <span className="tabular">1 / 51</span>
          <button className="px-2 py-0.5 rounded hover:bg-background">Next</button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({ label, active }: { label: string; active?: boolean }) {
  return (
    <th
      className={cn(
        'text-left py-2 pr-2 font-medium cursor-pointer select-none',
        'hover:text-foreground transition-colors duration-fast',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? <ChevronUp className="h-3 w-3" /> : <ArrowDownAZ className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}

function ContractsTable({ rows }: { rows: typeof LAB_CONTRACTS }) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left pl-3 pr-2 py-2 font-medium w-8">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-input" />
            </th>
            <SortHeader label="Employee" active />
            <SortHeader label="Type · v" />
            <SortHeader label="Start" />
            <SortHeader label="End" />
            <SortHeader label="Lifecycle" />
            <SortHeader label="Source" />
            <th className="text-right pr-3 py-2 font-medium w-12">⋯</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const e = LAB_EMPLOYEES.find((x) => x.id === c.employeeId)!;
            return (
              <tr key={c.id} className="group border-t cursor-pointer transition-colors duration-fast hover:bg-muted/40 active:bg-muted/60">
                <td className="pl-3 pr-2 py-2">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-input" />
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </div>
                    <span className="font-medium truncate">{e.fullName}</span>
                  </div>
                </td>
                <td className="py-2 pr-2 text-muted-foreground">{c.contractType} · v{c.version}</td>
                <td className="py-2 pr-2 tabular text-muted-foreground">{c.startDate}</td>
                <td className={cn('py-2 pr-2 tabular', c.state === 'review' ? 'text-status-expired' : 'text-muted-foreground')}>{c.endDate}</td>
                <td className="py-2 pr-2">
                  <ChipC tone={c.state === 'current' ? 'active' : c.state === 'future' ? 'info' : c.state === 'review' ? 'expired' : 'default'}>
                    {c.state}
                  </ChipC>
                </td>
                <td className="py-2 pr-2 font-mono text-muted-foreground truncate text-[10px]">{c.filename}</td>
                <td className="py-2 pr-3 text-right">
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast inline-flex items-center justify-center h-6 w-6 rounded hover:bg-background">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <div>Showing {rows.length} of {LAB_AGGREGATE.contracts}</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-0.5 rounded hover:bg-background">Prev</button>
          <span className="tabular">1 / 33</span>
          <button className="px-2 py-0.5 rounded hover:bg-background">Next</button>
        </div>
      </div>
    </div>
  );
}

function Inspector({ employeeId }: { employeeId: string }) {
  const e = LAB_EMPLOYEES.find((x) => x.id === employeeId)!;
  const contracts = LAB_CONTRACTS.filter((c) => c.employeeId === employeeId);
  const ins = LAB_INSURANCE.find((i) => i.employeeId === employeeId);
  const current = contracts.find((c) => c.state === 'current');

  const [tab, setTab] = React.useState<'identity' | 'contracts' | 'insurance' | 'docs' | 'audit'>('identity');

  return (
    <aside className="rounded-md border bg-card flex flex-col sticky top-[120px] max-h-[calc(100vh-140px)] overflow-hidden">
      <div className="px-4 py-3 border-b">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center text-[12px] font-semibold tracking-wide shrink-0">
            {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold truncate">{e.fullName}</div>
            <div className="text-[11px] text-muted-foreground truncate">{e.jobTitle} · {e.department}</div>
          </div>
          <button className="text-muted-foreground hover:text-foreground" aria-label="Close inspector">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          <ChipC tone="active">Active</ChipC>
          <ChipC tone="default">Emp # {e.employeeNumber}</ChipC>
        </div>
      </div>

      <div className="px-2 pt-2 flex items-center gap-0.5 overflow-x-auto border-b">
        {[
          { k: 'identity'  as const, label: 'Identity'  },
          { k: 'contracts' as const, label: 'Contracts' },
          { k: 'insurance' as const, label: 'Insurance' },
          { k: 'docs'      as const, label: 'Docs'      },
          { k: 'audit'     as const, label: 'Audit'     },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={cn(
              'inline-flex items-center px-2.5 py-1.5 text-[11px] font-medium rounded-md',
              'transition-colors duration-fast',
              tab === t.k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-[12px]">
        {tab === 'identity' && (
          <dl className="space-y-3">
            <KV icon={IdCard}     label="Iqama"        value={e.identityNumber} mono />
            <KV icon={Briefcase}  label="Department"   value={e.department} />
            <KV icon={Briefcase}  label="Job title"    value={e.jobTitle} />
            <KV icon={Globe}      label="Nationality"  value={e.nationality} />
            <KV icon={Calendar}   label="Hire date"    value={e.hireDate} />
            <KV icon={ScrollText} label="Employee #"   value={e.employeeNumber} mono />
          </dl>
        )}
        {tab === 'contracts' && (
          <ul className="space-y-2">
            {current && (
              <li className="rounded-md border bg-status-active-soft/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Current · v{current.version}</span>
                  <ChipC tone="active">In effect</ChipC>
                </div>
                <div className="mt-0.5 tabular text-muted-foreground text-[11px]">{current.startDate} → {current.endDate}</div>
              </li>
            )}
            {contracts.filter((c) => c.state === 'history').map((c) => (
              <li key={c.id} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">History · v{c.version}</span>
                  <ChipC tone="default">past</ChipC>
                </div>
                <div className="mt-0.5 tabular text-muted-foreground text-[11px]">{c.startDate} → {c.endDate}</div>
              </li>
            ))}
          </ul>
        )}
        {tab === 'insurance' && (
          ins ? (
            <div className="rounded-md border px-3 py-3 space-y-1.5">
              <div className="font-medium">{ins.provider}</div>
              <div className="text-[11px] text-muted-foreground">Policy <span className="font-mono">{ins.policyNumber}</span> · Member <span className="font-mono">{ins.memberNumber}</span></div>
              <div className="text-[11px] text-muted-foreground tabular">{ins.startDate} → {ins.endDate}</div>
              <ChipC tone={ins.status === 'active' ? 'active' : 'expired'}>{ins.status}</ChipC>
            </div>
          ) : <p className="text-muted-foreground italic">No insurance on file.</p>
        )}
        {tab === 'docs'  && <p className="text-muted-foreground italic">No documents on file.</p>}
        {tab === 'audit' && <p className="text-muted-foreground italic">No audit events.</p>}
      </div>

      <div className="border-t px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Pin className="h-3 w-3" /> Pinned</span>
        <button className="hover:text-foreground inline-flex items-center gap-1">Open full profile <ChevronRight className="h-3 w-3" /></button>
      </div>
    </aside>
  );
}

function FooterKeys() {
  return (
    <footer className="mt-4 pt-3 border-t flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
      <KbdHint k="J / K" hint="row navigate" />
      <KbdHint k="↵"      hint="open inspector" />
      <KbdHint k="⌘ F"    hint="filter" />
      <KbdHint k="⌘ K"    hint="command palette" />
      <KbdHint k="?"      hint="all shortcuts" />
      <div className="flex-1" />
      <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-status-active" /> Live · last sync 4s ago</span>
    </footer>
  );
}

function KbdHint({ k, hint }: { k: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded border bg-muted font-mono text-[10px]">{k}</kbd>
      <span>{hint}</span>
    </span>
  );
}

function ChipC({ children, tone }: { children: React.ReactNode; tone: 'default' | 'active' | 'expiring' | 'expired' | 'missing' | 'info' }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset capitalize whitespace-nowrap',
      tone === 'default'  && 'bg-muted text-muted-foreground ring-border',
      tone === 'active'   && 'bg-status-active-soft   text-status-active   ring-status-active/20',
      tone === 'expiring' && 'bg-status-expiring-soft text-status-expiring ring-status-expiring/20',
      tone === 'expired'  && 'bg-status-expired-soft  text-status-expired  ring-status-expired/20',
      tone === 'missing'  && 'bg-status-missing-soft  text-status-missing  ring-status-missing/20',
      tone === 'info'     && 'bg-status-info-soft     text-status-info     ring-status-info/20',
    )}>
      {children}
    </span>
  );
}

function FlatBtn({
  children, icon: Icon, variant = 'default', className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'primary' | 'ghost';
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium h-7 px-2.5 text-[12px]',
        'transition-[transform,box-shadow,background-color,border-color] duration-fast ease-out-quart',
        'hover:-translate-y-px hover:shadow-hover',
        'active:translate-y-[1px] active:scale-[0.98] active:shadow-press active:duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        variant === 'default' && 'border bg-background hover:bg-accent',
        variant === 'primary' && 'bg-foreground text-background hover:bg-foreground/90',
        variant === 'ghost'   && 'text-muted-foreground hover:text-foreground hover:bg-muted',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function KV({ icon: Icon, label, value, mono }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('text-[12px] font-medium truncate', mono && 'font-mono')}>{value}</div>
      </div>
    </div>
  );
}

void Star; void Sparkles; void AlertCircle; void CheckCircle2; void FileText; void HeartPulse; void FolderOpen; void ClipboardList;
