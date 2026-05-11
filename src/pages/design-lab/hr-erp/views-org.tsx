/**
 * Departments / Org Chart and Reporting / Analysis views.
 */
import * as React from 'react';
import {
  Building2, Users, ChevronRight, ChevronDown, Plus, ArrowUpRight, PieChart,
  Layers, Filter, Download, Star, BarChart3, Wallet, FileText, AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ORG_UNITS, LAB_EMPLOYEES, PIVOT_DATA, REPORT_TOTAL, initials, sar,
  type OrgUnit,
} from './mock';
import { Chip, AliveButton, Panel, Avatar, Sep } from './ui';

// ============================================================
// DEPARTMENTS / ORG CHART
// ============================================================

export function OrgWorkspace() {
  const [sel, setSel] = React.useState<string>('org_eng');
  const selected = ORG_UNITS.find((u) => u.id === sel)!;
  const manager = LAB_EMPLOYEES.find((e) => e.id === selected.managerId);
  const children = ORG_UNITS.filter((u) => u.parentId === sel);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] h-full min-h-0">
      <div className="p-6 overflow-auto">
        {/* Department cards strip */}
        <div className="mb-6">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">Departments</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {ORG_UNITS.filter((u) => u.parentId === 'org_root').map((u) => {
              const mgr = LAB_EMPLOYEES.find((e) => e.id === u.managerId);
              const isSel = sel === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSel(u.id)}
                  className={cn(
                    'group text-left rounded-lg border bg-card p-4',
                    'transition-[transform,box-shadow,border-color,background-color] duration-fast ease-out-quart',
                    'hover:-translate-y-[1px] hover:shadow-hover',
                    'active:translate-y-[1px] active:duration-75 active:shadow-press',
                    isSel ? 'ring-2 ring-ring border-ring' : 'hover:border-border',
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />
                  </div>
                  <div className="text-[14px] font-semibold tracking-tight">{u.name}</div>
                  <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">{u.code}</div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <div className="text-[22px] font-semibold tabular-nums leading-none">{u.headcount}</div>
                      <div className="text-[10.5px] text-muted-foreground mt-0.5">employees</div>
                    </div>
                    {mgr && (
                      <div className="text-right">
                        <Avatar initials={initials(mgr.fullName)} size="sm" />
                        <div className="text-[10.5px] text-muted-foreground mt-1 max-w-[80px] truncate">{mgr.fullName}</div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Org chart */}
        <Panel title="Organisational chart" action={<AliveButton variant="ghost" size="xs" icon={<Plus className="h-3 w-3" />}>Add unit</AliveButton>}>
          <OrgChart selected={sel} onSelect={setSel} />
        </Panel>
      </div>

      {/* Right inspector */}
      <aside className="border-l bg-card overflow-auto">
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold tracking-tight leading-tight">{selected.name}</h3>
              <div className="text-[11.5px] font-mono text-muted-foreground">{selected.code}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Chip tone="info"><Users className="h-3 w-3" /> {selected.headcount} headcount</Chip>
            {manager && <Chip tone="active">Manager: {manager.fullName}</Chip>}
            {children.length > 0 && <Chip tone="default">{children.length} sub-units</Chip>}
          </div>
          <div className="mt-3 flex gap-1.5">
            <AliveButton variant="primary" size="sm" className="flex-1">Open module</AliveButton>
            <AliveButton variant="secondary" size="sm">Edit</AliveButton>
          </div>
        </div>

        {manager && (
          <Panel title="Manager" className="m-3 border-0 bg-transparent rounded-none">
            <div className="flex items-center gap-3 py-1">
              <Avatar initials={initials(manager.fullName)} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{manager.fullName}</div>
                <div className="text-[11.5px] text-muted-foreground">{manager.jobTitle}</div>
              </div>
              <AliveButton variant="ghost" size="xs">Profile</AliveButton>
            </div>
          </Panel>
        )}

        {children.length > 0 && (
          <Panel title="Sub-units" className="m-3 border-0 bg-transparent rounded-none">
            <ul className="divide-y">
              {children.map((c) => {
                const mgr = LAB_EMPLOYEES.find((e) => e.id === c.managerId);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSel(c.id)}
                      className="w-full text-left flex items-center gap-2.5 py-2 -mx-4 px-4 hover:bg-muted/40 transition-colors duration-fast rounded"
                    >
                      <span className="h-6 w-6 rounded bg-muted/60 flex items-center justify-center">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium truncate">{c.name}</div>
                        <div className="text-[10.5px] text-muted-foreground">{mgr ? mgr.fullName : 'No manager'} · {c.headcount}</div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}

function OrgChart({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const root = ORG_UNITS.find((u) => u.parentId === null);
  if (!root) return null;
  return (
    <div className="overflow-auto py-4">
      <ul className="space-y-1">
        <OrgNode unit={root} level={0} selected={selected} onSelect={onSelect} expanded />
      </ul>
    </div>
  );
}

function OrgNode({
  unit, level, selected, onSelect, expanded: defaultExpanded,
}: {
  unit: OrgUnit;
  level: number;
  selected: string;
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  const children = ORG_UNITS.filter((u) => u.parentId === unit.id);
  const [open, setOpen] = React.useState(defaultExpanded ?? level < 2);
  const mgr = LAB_EMPLOYEES.find((e) => e.id === unit.managerId);
  const isSel = selected === unit.id;
  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-2 py-1.5 pr-3 rounded-md cursor-pointer',
          'transition-[background-color,transform] duration-fast ease-out-quart',
          'active:translate-y-[1px] active:duration-75',
          isSel ? 'bg-[hsl(var(--status-info-soft))] ring-1 ring-[hsl(var(--status-info))]/30' : 'hover:bg-muted/40',
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onSelect(unit.id)}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="h-5 w-5 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors duration-fast"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="h-5 w-5" />
        )}
        <span className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center">
          <Building2 className="h-3 w-3" />
        </span>
        <span className="text-[12.5px] font-medium">{unit.name}</span>
        <span className="text-[10.5px] font-mono text-muted-foreground">{unit.code}</span>
        <Chip tone="default">{unit.headcount}</Chip>
        <div className="flex-1" />
        {mgr ? (
          <div className="flex items-center gap-2">
            <Avatar initials={initials(mgr.fullName)} size="sm" />
            <span className="text-[11px] text-muted-foreground hidden md:inline">{mgr.fullName}</span>
          </div>
        ) : (
          <span className="text-[10.5px] text-muted-foreground">No manager</span>
        )}
      </div>
      {open && children.length > 0 && (
        <ul className="space-y-1 mt-0.5">
          {children.map((c) => (
            <OrgNode key={c.id} unit={c} level={level + 1} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ============================================================
// REPORTING / ANALYSIS — pivot
// ============================================================

const MEASURES = [
  { key: 'monthlyCost',     label: 'Monthly cost'    , icon: Wallet     },
  { key: 'yearlyCost',      label: 'Yearly cost'     , icon: Wallet     },
  { key: 'headcount',       label: 'Headcount'       , icon: Users      },
  { key: 'contractsActive', label: 'Active contracts', icon: FileText   },
  { key: 'reviewItems',     label: 'Review items'    , icon: AlertTriangle },
] as const;

export function ReportingWorkspace() {
  const [activeMeasures, setActiveMeasures] = React.useState<Set<string>>(new Set(['monthlyCost', 'yearlyCost', 'headcount', 'contractsActive', 'reviewItems']));

  function toggle(k: string) {
    setActiveMeasures((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  return (
    <div className="p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mr-1">Measures</span>
        {MEASURES.map((m) => {
          const sel = activeMeasures.has(m.key);
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(m.key)}
              aria-pressed={sel}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium border',
                'transition-[background-color,color,transform] duration-fast ease-out-quart',
                'active:translate-y-[1px] active:duration-75',
                sel
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3 w-3" />
              {m.label}
            </button>
          );
        })}
        <Sep />
        <AliveButton variant="ghost" size="sm" icon={<Filter className="h-3.5 w-3.5" />}>Filters</AliveButton>
        <AliveButton variant="ghost" size="sm" icon={<Layers className="h-3.5 w-3.5" />}>Group by department → job → employee</AliveButton>
        <div className="flex-1" />
        <AliveButton variant="secondary" size="sm" icon={<PieChart className="h-3.5 w-3.5" />}>Chart</AliveButton>
        <AliveButton variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}>Export</AliveButton>
        <AliveButton variant="ghost" size="sm" icon={<Star className="h-3.5 w-3.5" />}>Save as favorite</AliveButton>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ReportTile icon={Wallet}        label="Monthly cost"      value={sar(REPORT_TOTAL.monthlyCost)} delta="+ 4.2%" deltaTone="active" />
        <ReportTile icon={Wallet}        label="Yearly cost"       value={sar(REPORT_TOTAL.yearlyCost)}  delta="+ 6.1%" deltaTone="active" />
        <ReportTile icon={Users}         label="Headcount"          value={REPORT_TOTAL.headcount}        delta="+ 12 QoQ" deltaTone="active" />
        <ReportTile icon={FileText}      label="Active contracts"   value={REPORT_TOTAL.contractsActive} delta="− 3"     deltaTone="expiring" />
        <ReportTile icon={AlertTriangle} label="Review items"        value={REPORT_TOTAL.reviewItems}      delta="− 9"     deltaTone="active" />
      </div>

      {/* Pivot */}
      <Panel
        title={
          <div className="flex items-center gap-3">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span>Department → Job title → Employee</span>
          </div>
        }
        dense
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/40 border-b">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground sticky left-0 bg-muted/40 z-10 min-w-[260px]">Group</th>
                {activeMeasures.has('monthlyCost')     && <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Monthly cost</th>}
                {activeMeasures.has('yearlyCost')      && <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Yearly cost</th>}
                {activeMeasures.has('headcount')       && <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Headcount</th>}
                {activeMeasures.has('contractsActive') && <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Active contracts</th>}
                {activeMeasures.has('reviewItems')     && <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Review items</th>}
              </tr>
            </thead>
            <tbody>
              {PIVOT_DATA.map((r, i) => (
                <tr key={i} className={cn(
                  'border-b transition-colors duration-fast cursor-pointer',
                  r.group === 'department' && 'bg-muted/30 font-semibold',
                  r.group === 'jobTitle'   && 'bg-muted/10',
                  'hover:bg-muted/60',
                )}>
                  <td className="px-4 py-2 sticky left-0 bg-inherit z-10">
                    <div className="flex items-center gap-2">
                      {r.expandable && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                      {!r.expandable && <span className="w-3" />}
                      {r.group === 'department' && <Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span>{r.label}</span>
                    </div>
                  </td>
                  {activeMeasures.has('monthlyCost')     && <td className="px-4 py-2 text-right tabular-nums">{sar(r.monthlyCost)}</td>}
                  {activeMeasures.has('yearlyCost')      && <td className="px-4 py-2 text-right tabular-nums">{sar(r.yearlyCost)}</td>}
                  {activeMeasures.has('headcount')       && <td className="px-4 py-2 text-right tabular-nums">{r.headcount}</td>}
                  {activeMeasures.has('contractsActive') && <td className="px-4 py-2 text-right tabular-nums">{r.contractsActive}</td>}
                  {activeMeasures.has('reviewItems')     && (
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.reviewItems > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[hsl(var(--status-expiring))] font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {r.reviewItems}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 border-t-2 border-foreground/10 sticky bottom-0">
              <tr>
                <td className="px-4 py-2.5 sticky left-0 bg-muted/40 z-10 font-semibold">TOTAL</td>
                {activeMeasures.has('monthlyCost')     && <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sar(REPORT_TOTAL.monthlyCost)}</td>}
                {activeMeasures.has('yearlyCost')      && <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sar(REPORT_TOTAL.yearlyCost)}</td>}
                {activeMeasures.has('headcount')       && <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{REPORT_TOTAL.headcount}</td>}
                {activeMeasures.has('contractsActive') && <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{REPORT_TOTAL.contractsActive}</td>}
                {activeMeasures.has('reviewItems')     && <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{REPORT_TOTAL.reviewItems}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ReportTile({
  icon: Icon, label, value, delta, deltaTone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  delta: string;
  deltaTone: 'active' | 'expiring' | 'expired';
}) {
  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-hover transition-shadow duration-fast">
      <div className="flex items-center justify-between">
        <span className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium tabular-nums',
          deltaTone === 'active'   && 'text-[hsl(var(--status-active))]',
          deltaTone === 'expiring' && 'text-[hsl(var(--status-expiring))]',
          deltaTone === 'expired'  && 'text-[hsl(var(--status-expired))]',
        )}>
          <TrendingUp className="h-3 w-3" />
          {delta}
        </span>
      </div>
      <div className="mt-3 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums tracking-tight leading-none">{value}</div>
    </div>
  );
}
