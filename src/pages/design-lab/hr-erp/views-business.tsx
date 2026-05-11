/**
 * Contracts, Payroll, Learning — module-level views.
 *
 * "Module" here means the workspace you reach from the top nav. The
 * profile-scoped versions live in `views-employees.tsx`.
 */
import * as React from 'react';
import {
  FileText, FileSignature, AlertTriangle, ShieldCheck, Calculator,
  Download, BarChart3, BadgeCheck, BookOpen, Sparkles,
  ChevronDown, CheckCircle2, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAB_EMPLOYEES, LAB_CONTRACTS, payrollFor, payrollTotals, LEARNING, sar,
  initials,
} from './mock';
import { Chip, AliveButton, Panel, FormRow, TabBar, Avatar } from './ui';

// ============================================================
// CONTRACTS — list + form (right-side preview)
// ============================================================

export function ContractsWorkspace() {
  const [sel, setSel] = React.useState<string>(LAB_CONTRACTS[0]!.id);
  const [tab, setTab] = React.useState<'info' | 'salary' | 'details' | 'sign' | 'docs'>('info');

  const selected = LAB_CONTRACTS.find((c) => c.id === sel)!;
  const employee = LAB_EMPLOYEES.find((e) => e.id === selected.employeeId);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] h-full min-h-0">
      {/* LEFT: contract list */}
      <div className="border-r overflow-auto bg-card">
        <ContractsLifecycleList sel={sel} onSel={setSel} />
      </div>

      {/* RIGHT: contract form */}
      <div className="overflow-auto">
        {/* Form header */}
        <header className="bg-card border-b px-6 py-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Employee contract</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">
            {selected.contractType} · v{selected.version}
            <span className="ml-2 text-[12px] font-normal text-muted-foreground tabular-nums">{selected.filename}</span>
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Chip
              tone={
                selected.state === 'current' ? 'active'   :
                selected.state === 'future'  ? 'info'     :
                selected.state === 'review'  ? 'expired'  : 'default'
              }
              icon={
                selected.state === 'current' ? <ShieldCheck className="h-3 w-3" /> :
                selected.state === 'review'  ? <AlertTriangle className="h-3 w-3" /> :
                                                <Clock className="h-3 w-3" />
              }
            >
              {selected.state === 'current' ? 'Current contract' :
               selected.state === 'future'  ? 'Future renewal'   :
               selected.state === 'review'  ? 'Review required'  : 'History'}
            </Chip>
            <Chip tone="default" icon={<FileSignature className="h-3 w-3" />}>Confidence 98%</Chip>
            {employee && (
              <Chip tone="info">{employee.fullName} · {employee.department}</Chip>
            )}
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <AliveButton variant="primary" size="sm">Save</AliveButton>
            <AliveButton variant="secondary" size="sm">Discard</AliveButton>
            <AliveButton variant="ghost" size="sm">Print</AliveButton>
            <AliveButton variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}>Download PDF</AliveButton>
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground tabular-nums">2 / 13 contracts</span>
            <AliveButton variant="ghost" size="xs">‹ Prev</AliveButton>
            <AliveButton variant="ghost" size="xs">Next ›</AliveButton>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-card px-6">
          <TabBar
            tabs={[
              { key: 'info',    label: 'Contract Information' },
              { key: 'salary',  label: 'Salary / Compensation' },
              { key: 'details', label: 'Details'              },
              { key: 'sign',    label: 'Signatories'          },
              { key: 'docs',    label: 'Personal Documents'   },
            ]}
            value={tab}
            onChange={(k) => setTab(k as typeof tab)}
          />
        </div>

        {/* Form body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tab === 'info' && (
            <>
              <Panel title="Reference">
                <dl>
                  <FormRow label="Employee"      value={employee?.fullName ?? '—'} hint={employee ? `#${employee.employeeNumber}` : undefined} />
                  <FormRow label="Iqama"         value={employee?.identityNumber ?? '—'} mono />
                  <FormRow label="Department"    value={employee?.department ?? '—'} />
                  <FormRow label="Job position"  value={employee?.jobTitle ?? '—'} action={<AliveButton variant="ghost" size="xs">Edit</AliveButton>} />
                  <FormRow label="Contract type" value={selected.contractType} />
                  <FormRow label="Source PDF"    value={selected.filename} hint="Loaded 2025-06-01 · confidence 98%" />
                </dl>
              </Panel>
              <Panel title="Period">
                <dl>
                  <FormRow label="Start date"  value={selected.startDate} />
                  <FormRow label="End date"    value={selected.endDate} hint={
                    selected.state === 'review' ? 'End date is before start date — flagged for review.' : undefined
                  } />
                  <FormRow label="Duration"    value="24 months" />
                  <FormRow label="Renewal"     value="Auto-flag 60 days before end" />
                  <FormRow label="Probation"   value="3 months" />
                  <FormRow label="Lifecycle"   value={
                    <Chip tone={
                      selected.state === 'current' ? 'active'  :
                      selected.state === 'future'  ? 'info'    :
                      selected.state === 'review'  ? 'expired' : 'default'
                    }>
                      {selected.state.toUpperCase()}
                    </Chip>
                  } />
                </dl>
              </Panel>
            </>
          )}
          {tab === 'salary' && employee && (
            <SalaryTabContent employeeId={employee.id} />
          )}
          {tab === 'details' && (
            <Panel title="Details">
              <dl>
                <FormRow label="Notice period"     value="30 days" />
                <FormRow label="Working hours"     value="Sun – Thu · 08:00 → 17:00" />
                <FormRow label="Overtime"          value="Permitted · 1.5x rate" />
                <FormRow label="Annual leave"      value="21 days / year" />
                <FormRow label="Sick leave"        value="30 days · per Saudi labor law" />
                <FormRow label="Termination"       value="As per Saudi labor law" />
              </dl>
            </Panel>
          )}
          {tab === 'sign' && (
            <Panel title="Signatories">
              <ul className="space-y-3">
                {[
                  { name: 'Salim Al-Qahtani',    role: 'Employee',          status: 'Signed',  at: '2025-06-01' },
                  { name: 'Abdullah Al-Saud',    role: 'HR Manager',        status: 'Signed',  at: '2025-06-01' },
                  { name: 'Sami Al-Mutairi',     role: 'Operations Director',status: 'Pending', at: '—' },
                ].map((s) => (
                  <li key={s.name} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                    <Avatar initials={initials(s.name)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{s.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">{s.role}</div>
                    </div>
                    <Chip tone={s.status === 'Signed' ? 'active' : 'expiring'} icon={s.status === 'Signed' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}>{s.status}</Chip>
                    <span className="text-[11.5px] text-muted-foreground tabular-nums w-20 text-right">{s.at}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {tab === 'docs' && (
            <Panel title="Personal documents attached to this contract">
              <ul className="divide-y">
                {['Iqama copy', 'Passport copy', 'Visa', 'Photo'].map((d) => (
                  <li key={d} className="flex items-center gap-3 py-2.5">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{d}</div>
                      <div className="text-[11.5px] text-muted-foreground">PDF · attached 2025-06-01</div>
                    </div>
                    <AliveButton variant="ghost" size="xs">View</AliveButton>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractsLifecycleList({ sel, onSel }: { sel: string; onSel: (id: string) => void }) {
  const cur  = LAB_CONTRACTS.filter((c) => c.state === 'current');
  const fut  = LAB_CONTRACTS.filter((c) => c.state === 'future');
  const hist = LAB_CONTRACTS.filter((c) => c.state === 'history');
  const rev  = LAB_CONTRACTS.filter((c) => c.state === 'review');
  return (
    <div>
      <ContractGroup title="Current contract"   tone="active"   items={cur}  sel={sel} onSel={onSel} />
      <ContractGroup title="Future contracts"   tone="info"     items={fut}  sel={sel} onSel={onSel} />
      <ContractGroup title="Review required"    tone="expired"  items={rev}  sel={sel} onSel={onSel} />
      <ContractGroup title="Contract history"   tone="default"  items={hist} sel={sel} onSel={onSel} collapsibleDefault={false} />
    </div>
  );
}

function ContractGroup({
  title, tone, items, sel, onSel, collapsibleDefault = true,
}: {
  title: string;
  tone: 'active' | 'info' | 'expired' | 'default';
  items: typeof LAB_CONTRACTS;
  sel: string;
  onSel: (id: string) => void;
  collapsibleDefault?: boolean;
}) {
  const [open, setOpen] = React.useState(collapsibleDefault);
  return (
    <section className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-muted/40 hover:bg-muted transition-colors duration-fast"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-fast', !open && '-rotate-90')} />
        <span className={cn(
          'h-2 w-2 rounded-full',
          tone === 'active'  && 'bg-status-active',
          tone === 'info'    && 'bg-status-info',
          tone === 'expired' && 'bg-status-expired',
          tone === 'default' && 'bg-muted-foreground/50',
        )} />
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em]">{title}</h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">{items.length}</span>
      </button>
      {open && (
        <ul>
          {items.map((c) => {
            const emp = LAB_EMPLOYEES.find((e) => e.id === c.employeeId);
            const isSel = sel === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSel(c.id)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 border-b last:border-0 flex items-start gap-3 group',
                    'transition-colors duration-fast',
                    isSel ? 'bg-[hsl(var(--status-info-soft))]' : 'hover:bg-muted/30',
                  )}
                >
                  <FileText className={cn('h-4 w-4 mt-0.5', isSel ? 'text-[hsl(var(--status-info))]' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12.5px] font-medium truncate">{emp?.fullName ?? '—'}</span>
                      <span className="text-[10.5px] text-muted-foreground tabular-nums">v{c.version}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground tabular-nums">{c.startDate} → {c.endDate}</div>
                    {c.reviewReason && (
                      <div className="text-[11px] text-[hsl(var(--status-expired))] mt-0.5">{c.reviewReason}</div>
                    )}
                  </div>
                  <Chip tone={
                    tone === 'active'  ? 'active'  :
                    tone === 'info'    ? 'info'    :
                    tone === 'expired' ? 'expired' : 'default'
                  }>{c.contractType}</Chip>
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-4 py-3 text-[11.5px] text-muted-foreground">No records in this section.</li>
          )}
        </ul>
      )}
    </section>
  );
}

function SalaryTabContent({ employeeId }: { employeeId: string }) {
  const lines = payrollFor(employeeId);
  const totals = payrollTotals(lines);
  return (
    <>
      <Panel title="Compensation lines" dense>
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40 border-b">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Component</th>
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Kind</th>
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.code} className="border-b">
                <td className="px-4 py-2 font-medium">{l.label}</td>
                <td className="px-4 py-2"><Chip tone={l.kind === 'deduction' ? 'expired' : l.kind === 'earning' ? 'active' : 'info'}>{l.kind}</Chip></td>
                <td className={cn('px-4 py-2 text-right tabular-nums', l.monthly < 0 && 'text-[hsl(var(--status-expired))]')}>{sar(l.monthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Summary">
        <dl>
          <FormRow label="Gross"       value={<span className="tabular-nums">{sar(totals.gross)}</span>} />
          <FormRow label="Allowances"  value={<span className="tabular-nums">{sar(totals.allowances)}</span>} />
          <FormRow label="Deductions"  value={<span className="tabular-nums text-[hsl(var(--status-expired))]">{sar(totals.deductions)}</span>} />
          <FormRow label="Net monthly" value={<span className="tabular-nums font-semibold">{sar(totals.net)}</span>} />
          <FormRow label="Net yearly"  value={<span className="tabular-nums">{sar(totals.net * 12)}</span>} />
        </dl>
      </Panel>
    </>
  );
}

// ============================================================
// PAYROLL — module workspace
// ============================================================

export function PayrollWorkspace() {
  const [sel, setSel] = React.useState<string>(LAB_EMPLOYEES[0]!.id);
  const selected = LAB_EMPLOYEES.find((e) => e.id === sel)!;
  const lines = payrollFor(sel);
  const totals = payrollTotals(lines);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] h-full min-h-0">
      {/* People list */}
      <div className="border-r bg-card overflow-auto">
        <header className="px-4 py-2.5 border-b bg-muted/40">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em]">Employees · payroll</h3>
        </header>
        <ul>
          {LAB_EMPLOYEES.map((e) => {
            const l = payrollFor(e.id);
            const t = payrollTotals(l);
            const isSel = sel === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSel(e.id)}
                  className={cn(
                    'w-full text-left flex items-center gap-3 px-4 py-2.5 border-b transition-colors duration-fast',
                    isSel ? 'bg-[hsl(var(--status-info-soft))]' : 'hover:bg-muted/30',
                  )}
                >
                  <Avatar initials={initials(e.fullName)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium truncate">{e.fullName}</div>
                    <div className="text-[11px] text-muted-foreground">{e.jobTitle}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-[12.5px] font-semibold">{sar(t.net).replace('SAR ', '')}</div>
                    <div className="text-[10.5px] text-muted-foreground">/ month</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Compensation form + preview */}
      <div className="overflow-auto">
        <header className="bg-card border-b px-6 py-4">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Compensation</div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight">{selected.fullName}</h1>
          <div className="mt-1 text-[12.5px] text-muted-foreground">{selected.jobTitle} · {selected.department}</div>
          <div className="mt-3 flex items-center gap-1.5">
            <AliveButton variant="primary" size="sm">Save</AliveButton>
            <AliveButton variant="secondary" size="sm" icon={<Calculator className="h-3.5 w-3.5" />}>Recalculate</AliveButton>
            <AliveButton variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}>Export slip</AliveButton>
            <AliveButton variant="ghost" size="sm" icon={<BarChart3 className="h-3.5 w-3.5" />}>Cost breakdown</AliveButton>
          </div>
        </header>

        <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <Panel title="Compensation lines" dense>
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/40 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Code</th>
                  <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Component</th>
                  <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Kind</th>
                  <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Monthly</th>
                  <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Yearly</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.code} className="border-b hover:bg-muted/30 transition-colors duration-fast">
                    <td className="px-4 py-2 font-mono text-[11.5px] text-muted-foreground">{l.code}</td>
                    <td className="px-4 py-2 font-medium">{l.label}</td>
                    <td className="px-4 py-2"><Chip tone={l.kind === 'deduction' ? 'expired' : l.kind === 'earning' ? 'active' : 'info'}>{l.kind}</Chip></td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', l.monthly < 0 && 'text-[hsl(var(--status-expired))]')}>{sar(l.monthly)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', l.yearly < 0  && 'text-[hsl(var(--status-expired))]')}>{sar(l.yearly)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t-2 border-foreground/10">
                <tr>
                  <td className="px-4 py-2.5 font-semibold" colSpan={3}>Net pay</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sar(totals.net)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sar(totals.net * 12)}</td>
                </tr>
              </tfoot>
            </table>
          </Panel>

          <Panel title="Pay preview">
            <div className="space-y-4">
              <div className="px-1">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">May 2026 · projected</div>
                <div className="mt-1.5 text-[28px] font-semibold tabular-nums tracking-tight leading-none">{sar(totals.net)}</div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">Net pay · after deductions</div>
              </div>
              <ul className="space-y-2 text-[12px]">
                <SummaryRow label="Gross"        value={sar(totals.gross)} />
                <SummaryRow label="Allowances"   value={sar(totals.allowances)} />
                <SummaryRow label="Deductions"   value={sar(totals.deductions)} tone="expired" />
                <SummaryRow label="Monthly cost" value={sar(totals.monthlyCost)} bold />
                <SummaryRow label="Yearly cost"  value={sar(totals.yearlyCost)} bold />
              </ul>
              <div className="pt-3 border-t">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium mb-2">Cost trend</div>
                <SparkBars values={[12, 13, 14, 14, 15, 15, 15, 16, 16, 15, 15, 16]} />
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'expired' }) {
  return (
    <li className="flex justify-between items-baseline py-1.5 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        'tabular-nums',
        bold && 'font-semibold',
        tone === 'expired' && 'text-[hsl(var(--status-expired))]',
      )}>{value}</span>
    </li>
  );
}

function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-1 h-12">
      {values.map((v, i) => (
        <div key={i} className="flex-1 bg-primary/15 hover:bg-primary/30 rounded-sm transition-colors duration-fast" style={{ height: `${(v / max) * 100}%` }} title={`${v}k`} />
      ))}
    </div>
  );
}

// ============================================================
// LEARNING & EXPERIENCE — module workspace
// ============================================================

const LEARN_TABS: { key: 'all' | 'cert' | 'training' | 'skill' | 'exp'; label: string }[] = [
  { key: 'all',      label: 'All'             },
  { key: 'cert',     label: 'Certifications'  },
  { key: 'training', label: 'Training'        },
  { key: 'skill',    label: 'Skills'          },
  { key: 'exp',      label: 'Experience'      },
];

export function LearningWorkspace() {
  const [tab, setTab] = React.useState<typeof LEARN_TABS[number]['key']>('all');
  const items = LEARNING.filter((l) => {
    if (tab === 'all')      return true;
    if (tab === 'cert')     return l.category === 'certification';
    if (tab === 'training') return l.category === 'training';
    if (tab === 'skill')    return l.category === 'skill';
    return l.category === 'experience';
  });

  const expiring = LEARNING.filter((l) => l.status === 'expiring');

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile icon={BadgeCheck}      tone="active"   label="Active certifications" value={LEARNING.filter((l) => l.category === 'certification' && l.status === 'active').length} />
          <KpiTile icon={AlertTriangle}   tone="expiring" label="Expiring within 60d"   value={LEARNING.filter((l) => l.status === 'expiring').length} />
          <KpiTile icon={BookOpen}        tone="info"     label="Training records"      value={LEARNING.filter((l) => l.category === 'training').length} />
          <KpiTile icon={Sparkles}        tone="default"  label="Tracked skills"         value={LEARNING.filter((l) => l.category === 'skill').length} />
        </div>

        <Panel
          title={
            <div className="flex items-center gap-3 w-full">
              <span>Records</span>
              <TabBar
                tabs={LEARN_TABS.map((t) => ({ key: t.key, label: t.label, count: LEARNING.filter((l) => t.key === 'all' ? true : t.key === 'cert' ? l.category === 'certification' : t.key === 'training' ? l.category === 'training' : t.key === 'skill' ? l.category === 'skill' : l.category === 'experience').length }))}
                value={tab}
                onChange={(k) => setTab(k as typeof tab)}
                className="border-b-0"
              />
            </div>
          }
          action={<AliveButton variant="primary" size="xs">Add record</AliveButton>}
          dense
        >
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/40 border-b">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Employee</th>
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Category</th>
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Title</th>
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Issuer</th>
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Acquired</th>
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Expires</th>
                <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const emp = LAB_EMPLOYEES.find((e) => e.id === l.employeeId);
                return (
                  <tr key={l.id} className="border-b hover:bg-muted/40 cursor-pointer transition-colors duration-fast">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar initials={initials(emp?.fullName ?? '?')} size="sm" />
                        <span className="font-medium">{emp?.fullName ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 capitalize">{l.category}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{l.title}</span>
                      {l.level && <span className="ml-2 text-[10.5px] text-muted-foreground uppercase tracking-wide">{l.level}</span>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{l.issuer ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{l.acquiredOn ?? '—'}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {l.expiresOn ? (
                        <span className={cn(l.status === 'expiring' && 'text-[hsl(var(--status-expiring))] font-medium')}>{l.expiresOn}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Chip tone={l.status === 'active' ? 'active' : l.status === 'expiring' ? 'expiring' : l.status === 'expired' ? 'expired' : 'info'}>{l.status}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel title="Expiring soon">
          {expiring.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">Nothing expiring in the next 60 days.</div>
          ) : (
            <ul className="space-y-2.5">
              {expiring.map((l) => {
                const emp = LAB_EMPLOYEES.find((e) => e.id === l.employeeId);
                return (
                  <li key={l.id} className="flex items-start gap-2.5 py-1.5">
                    <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-expiring))] mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium truncate">{l.title}</div>
                      <div className="text-[11px] text-muted-foreground">{emp?.fullName} · expires {l.expiresOn}</div>
                    </div>
                    <AliveButton variant="secondary" size="xs">Renew</AliveButton>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="AI suggestions">
          <ul className="space-y-2.5 text-[12.5px]">
            <li className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <span><span className="font-medium">Salim</span> may qualify for <span className="font-medium">PRINCE2 Practitioner</span> based on his PMP + experience.</span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <span>Site safety renewal needed for <span className="font-medium">3 people</span> in Operations by Q3.</span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <span>Auto-tagged <span className="font-medium">Arabic — native</span> on 6 profiles from Iqama nationality.</span>
            </li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

function KpiTile({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'active' | 'expiring' | 'info' | 'default';
  label: string;
  value: number | string;
}) {
  const cls =
    tone === 'active'   ? 'bg-status-active-soft  text-[hsl(var(--status-active))]'   :
    tone === 'expiring' ? 'bg-status-expiring-soft text-[hsl(var(--status-expiring))]' :
    tone === 'info'     ? 'bg-status-info-soft     text-[hsl(var(--status-info))]'     :
                          'bg-muted text-muted-foreground';
  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-hover transition-shadow duration-fast">
      <div className="flex items-start gap-3">
        <span className={cn('h-8 w-8 rounded-md flex items-center justify-center', cls)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{label}</div>
          <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight leading-none">{value}</div>
        </div>
      </div>
    </div>
  );
}
