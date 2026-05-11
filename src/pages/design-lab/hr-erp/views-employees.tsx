/**
 * Employees module — Kanban, List/Grid, and Profile (the hero) views.
 *
 * Profile is the most important screen: header with smart buttons,
 * tabbed sections, and a persistent right-side chatter panel.
 */
import * as React from 'react';
import {
  IdCard, Calendar, Globe, MapPin, Mail, ShieldCheck,
  ShieldAlert, FileText, HeartPulse, FolderOpen, ClipboardList, GraduationCap,
  Wallet, AlertTriangle, MessageSquare, PencilLine, Bell, Upload, Plus, Send,
  AtSign, Paperclip, ChevronRight, MoreHorizontal,
  ArrowRight, UserPlus, Star, Building2, BadgeCheck, History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAB_EMPLOYEES, LAB_CONTRACTS, LAB_INSURANCE, LAB_DOCUMENTS,
  LAB_TRANSACTIONS, payrollFor, payrollTotals, LEARNING,
  CHATTER_SALIM, initials, sar,
  type LabEmployee,
} from './mock';
import { Chip, AliveButton, TabBar, Avatar, SmartButton, Panel, FormRow } from './ui';

// ============================================================
// EMPLOYEES — KANBAN VIEW
// ============================================================

const KANBAN_STAGES: { key: string; label: string; tone: 'default' | 'info' | 'active' | 'expiring' }[] = [
  { key: 'new',         label: 'New hires',         tone: 'info'     },
  { key: 'active',      label: 'Active',            tone: 'active'   },
  { key: 'attention',   label: 'Needs attention',   tone: 'expiring' },
  { key: 'off',         label: 'Off-boarding',      tone: 'default'  },
];

function classifyEmployee(e: LabEmployee): string {
  const hireYear = parseInt(e.hireDate.slice(0, 4), 10);
  if (hireYear >= 2026) return 'new';
  const insurance = LAB_INSURANCE.find((i) => i.employeeId === e.id);
  const docs = LAB_DOCUMENTS.filter((d) => d.employeeId === e.id);
  const reviewDoc = docs.find((d) => d.status === 'review_required');
  const noInsurance = !insurance || insurance.status === 'expired';
  if (reviewDoc || noInsurance) return 'attention';
  return 'active';
}

export function EmployeesKanban({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const [sel, setSel] = React.useState<string | null>(null);

  const grouped = KANBAN_STAGES.map((s) => ({
    ...s,
    items: LAB_EMPLOYEES.filter((e) => classifyEmployee(e) === s.key),
  }));

  return (
    <div className="p-4 grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 min-h-full">
      {grouped.map((col) => (
        <div key={col.key} className="bg-card/60 border rounded-lg flex flex-col min-h-0">
          {/* Stage header */}
          <header className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 rounded-t-lg">
            <span className={cn(
              'h-2 w-2 rounded-full',
              col.tone === 'active'   && 'bg-status-active',
              col.tone === 'expiring' && 'bg-status-expiring',
              col.tone === 'info'     && 'bg-status-info',
              col.tone === 'default'  && 'bg-muted-foreground/50',
            )} aria-hidden="true" />
            <h3 className="text-[12px] font-semibold tracking-tight uppercase">{col.label}</h3>
            <span className="text-[11px] text-muted-foreground tabular-nums">{col.items.length}</span>
            <div className="flex-1" />
            <button className="h-6 w-6 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast" title="Add">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </header>

          {/* Cards */}
          <div className="p-2 space-y-2 flex-1 overflow-auto">
            {col.items.map((e) => {
              const contract = LAB_CONTRACTS.find((c) => c.employeeId === e.id && c.state === 'current');
              const insurance = LAB_INSURANCE.find((i) => i.employeeId === e.id);
              const reviewDoc = LAB_DOCUMENTS.find((d) => d.employeeId === e.id && d.status === 'review_required');
              const isSel = sel === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSel(e.id)}
                  onDoubleClick={() => onOpenProfile(e.id)}
                  className={cn(
                    'group block w-full text-left rounded-md border bg-card p-3',
                    'transition-[transform,box-shadow,border-color] duration-fast ease-out-quart',
                    'hover:-translate-y-[1px] hover:shadow-hover hover:border-border',
                    'active:translate-y-[1px] active:duration-75 active:shadow-press',
                    isSel && 'ring-2 ring-ring border-ring',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar initials={initials(e.fullName)} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h4 className="text-[13px] font-semibold tracking-tight truncate">{e.fullName}</h4>
                        <span className="text-[10px] text-muted-foreground tabular-nums">#{e.employeeNumber}</span>
                      </div>
                      <p className="text-[12px] text-muted-foreground truncate">{e.jobTitle}</p>
                      <p className="text-[11px] text-muted-foreground/80 truncate">{e.department} · {e.nationality}</p>
                    </div>
                    {reviewDoc && <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-expired))]" />}
                  </div>
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    <Chip tone={contract ? 'active' : 'expired'} icon={<FileText className="h-3 w-3" />}>
                      {contract ? `Contract v${contract.version}` : 'No contract'}
                    </Chip>
                    <Chip tone={insurance?.status === 'active' ? 'active' : insurance ? 'expired' : 'missing'} icon={<HeartPulse className="h-3 w-3" />}>
                      {insurance?.status === 'active' ? insurance.provider.split(' ')[0] : insurance ? 'Expired' : 'None'}
                    </Chip>
                    {reviewDoc && (
                      <Chip tone="review" icon={<AlertTriangle className="h-3 w-3" />}>Review</Chip>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Hired {e.hireDate}
                    <div className="flex-1" />
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast inline-flex items-center gap-0.5 text-foreground font-medium">
                      Open <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </button>
              );
            })}
            {col.items.length === 0 && (
              <div className="py-8 text-center text-[11px] text-muted-foreground">No records</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// EMPLOYEES — LIST/GRID VIEW with right inspector
// ============================================================

export function EmployeesList({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const [sel, setSel] = React.useState<string>(LAB_EMPLOYEES[0]!.id);

  const selected = LAB_EMPLOYEES.find((e) => e.id === sel)!;
  const selContract = LAB_CONTRACTS.find((c) => c.employeeId === sel && c.state === 'current');
  const selInsurance = LAB_INSURANCE.find((i) => i.employeeId === sel);
  const selPayroll = payrollFor(sel);
  const totals = payrollTotals(selPayroll);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] h-full min-h-0">
      {/* TABLE */}
      <div className="overflow-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="sticky top-0 bg-card/95 backdrop-blur border-b z-10">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground w-[28px]">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" />
              </th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Employee</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Iqama</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Job title</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Department</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Contract</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Insurance</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Data quality</th>
              <th className="px-2 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Last activity</th>
              <th className="px-2 py-2 w-[24px]"></th>
            </tr>
          </thead>
          <tbody>
            {LAB_EMPLOYEES.map((e) => {
              const c = LAB_CONTRACTS.find((x) => x.employeeId === e.id && x.state === 'current');
              const ins = LAB_INSURANCE.find((x) => x.employeeId === e.id);
              const reviewDoc = LAB_DOCUMENTS.find((d) => d.employeeId === e.id && d.status === 'review_required');
              const reviewCtr = LAB_CONTRACTS.find((x) => x.employeeId === e.id && x.state === 'review');
              const isSel = sel === e.id;
              return (
                <tr
                  key={e.id}
                  onClick={() => setSel(e.id)}
                  onDoubleClick={() => onOpenProfile(e.id)}
                  className={cn(
                    'border-b group cursor-pointer',
                    'transition-colors duration-fast',
                    isSel ? 'bg-[hsl(var(--status-info-soft))]' : 'hover:bg-muted/50',
                    'active:bg-muted',
                  )}
                >
                  <td className="px-3 py-2">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-border" onClick={(ev) => ev.stopPropagation()} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar initials={initials(e.fullName)} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.fullName}</div>
                        <div className="text-[10.5px] text-muted-foreground tabular-nums">#{e.employeeNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11.5px] text-muted-foreground">{e.identityNumber}</td>
                  <td className="px-2 py-2">{e.jobTitle}</td>
                  <td className="px-2 py-2 text-muted-foreground">{e.department}</td>
                  <td className="px-2 py-2">
                    {c ? (
                      <Chip tone="active" icon={<FileText className="h-3 w-3" />}>v{c.version} · {c.endDate.slice(0, 7)}</Chip>
                    ) : reviewCtr ? (
                      <Chip tone="review" icon={<AlertTriangle className="h-3 w-3" />}>Review</Chip>
                    ) : (
                      <Chip tone="missing">None</Chip>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {ins ? (
                      <Chip tone={ins.status === 'active' ? 'active' : 'expired'} icon={<HeartPulse className="h-3 w-3" />}>
                        {ins.provider.split(' ')[0]}
                      </Chip>
                    ) : (
                      <Chip tone="missing">None</Chip>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {reviewDoc || reviewCtr ? (
                      <Chip tone="expiring">1 issue</Chip>
                    ) : (
                      <Chip tone="active" icon={<BadgeCheck className="h-3 w-3" />}>Clean</Chip>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground tabular-nums text-[11.5px]">2026-05-{10 - (e.id.charCodeAt(4) % 6)}</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); onOpenProfile(e.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:translate-y-[1px]"
                      title="Open"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* RIGHT INSPECTOR */}
      <aside className="border-l bg-card overflow-auto">
        <div className="p-4 border-b">
          <div className="flex items-start gap-3">
            <Avatar initials={initials(selected.fullName)} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold tracking-tight leading-tight">{selected.fullName}</h3>
              <div className="text-[12px] text-muted-foreground" dir="rtl">{selected.fullNameArabic}</div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">{selected.jobTitle} · {selected.department}</div>
              <div className="mt-2 flex gap-1 flex-wrap">
                <Chip tone="active" icon={<BadgeCheck className="h-3 w-3" />}>Active</Chip>
                <Chip tone="info">#{selected.employeeNumber}</Chip>
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <AliveButton variant="primary" size="sm" className="flex-1" onClick={() => onOpenProfile(selected.id)}>
              Open profile
            </AliveButton>
            <AliveButton variant="secondary" size="sm" icon={<MessageSquare className="h-3.5 w-3.5" />} />
            <AliveButton variant="secondary" size="sm" icon={<MoreHorizontal className="h-3.5 w-3.5" />} />
          </div>
        </div>

        <Panel title="Quick view" className="m-3 border-0 bg-transparent rounded-none">
          <dl>
            <FormRow label="Iqama"        value={selected.identityNumber} mono />
            <FormRow label="Nationality"  value={selected.nationality} />
            <FormRow label="Hired"        value={selected.hireDate} />
            <FormRow
              label="Contract"
              value={selContract ? `${selContract.contractType} v${selContract.version}` : <span className="text-muted-foreground">None</span>}
              hint={selContract ? `${selContract.startDate} → ${selContract.endDate}` : undefined}
            />
            <FormRow
              label="Insurance"
              value={selInsurance ? selInsurance.provider : <span className="text-muted-foreground">Not enrolled</span>}
              hint={selInsurance ? `Member ${selInsurance.memberNumber}` : undefined}
            />
            <FormRow label="Monthly cost" value={<span className="tabular-nums">{sar(totals.monthlyCost)}</span>} />
            <FormRow label="Yearly cost"  value={<span className="tabular-nums">{sar(totals.yearlyCost)}</span>} />
          </dl>
        </Panel>

        <Panel title="Last 3 activities" className="m-3 border-0 bg-transparent rounded-none">
          <ul className="space-y-2.5">
            {LAB_TRANSACTIONS.filter((t) => t.employeeId === selected.id).slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[11.5px]">
                <div className="mt-1 h-2 w-2 rounded-full bg-status-info shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-muted-foreground">{t.effectiveDate} · {t.status}</div>
                </div>
              </li>
            ))}
            {LAB_TRANSACTIONS.filter((t) => t.employeeId === selected.id).length === 0 && (
              <li className="text-[11.5px] text-muted-foreground">No transactions recorded.</li>
            )}
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

// ============================================================
// EMPLOYEE PROFILE — the hero workspace
// ============================================================

const PROFILE_TABS = [
  { key: 'work',        label: 'Work'                  },
  { key: 'contracts',   label: 'Contracts'             },
  { key: 'insurance',   label: 'Medical Insurance'     },
  { key: 'documents',   label: 'Documents'             },
  { key: 'transactions',label: 'Transactions'          },
  { key: 'learning',    label: 'Learning & Experience' },
  { key: 'payroll',     label: 'Compensation'          },
  { key: 'personal',    label: 'Personal'              },
  { key: 'audit',       label: 'Audit / Data Quality'  },
] as const;
type ProfileTab = typeof PROFILE_TABS[number]['key'];

export function EmployeeProfile({ employeeId }: { employeeId?: string }) {
  const e = LAB_EMPLOYEES.find((x) => x.id === employeeId) ?? LAB_EMPLOYEES[0]!;
  const contracts = LAB_CONTRACTS.filter((c) => c.employeeId === e.id);
  const insurance = LAB_INSURANCE.find((i) => i.employeeId === e.id);
  const docs = LAB_DOCUMENTS.filter((d) => d.employeeId === e.id);
  const txns = LAB_TRANSACTIONS.filter((t) => t.employeeId === e.id);
  const learning = LEARNING.filter((l) => l.employeeId === e.id);
  const payroll = payrollFor(e.id);
  const totals = payrollTotals(payroll);

  const [tab, setTab] = React.useState<ProfileTab>('work');
  const [chatTab, setChatTab] = React.useState<'message' | 'note' | 'activity'>('message');

  const reviewItems =
    docs.filter((d) => d.status === 'review_required').length +
    contracts.filter((c) => c.state === 'review').length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] h-full min-h-0">
      {/* MAIN */}
      <div className="overflow-auto">
        {/* HEADER */}
        <header className="bg-card border-b">
          <div className="px-6 pt-5 pb-3">
            {/* Top action row */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11.5px] text-muted-foreground mb-3">
              <AliveButton variant="ghost" size="xs">Employees</AliveButton>
              <ChevronRight className="h-3 w-3" />
              <AliveButton variant="ghost" size="xs">{e.department}</AliveButton>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{e.fullName}</span>

              <div className="flex-1" />

              <AliveButton variant="ghost" size="xs" icon={<UserPlus className="h-3.5 w-3.5" />}>Create user</AliveButton>
              <AliveButton variant="ghost" size="xs" icon={<Star className="h-3.5 w-3.5" />}>Launch plan</AliveButton>
              <AliveButton variant="ghost" size="xs" icon={<MessageSquare className="h-3.5 w-3.5" />}>Send message</AliveButton>
              <AliveButton variant="ghost" size="xs" icon={<PencilLine className="h-3.5 w-3.5" />}>Log note</AliveButton>
              <AliveButton variant="ghost" size="xs" icon={<Bell className="h-3.5 w-3.5" />}>Activity</AliveButton>
              <AliveButton variant="ghost" size="xs" icon={<Upload className="h-3.5 w-3.5" />}>Upload</AliveButton>
              <AliveButton variant="primary" size="xs" icon={<Plus className="h-3.5 w-3.5" />}>Transaction</AliveButton>
            </div>

            {/* Identity row */}
            <div className="flex items-start gap-5">
              <Avatar initials={initials(e.fullName)} size="xl" />
              <div className="min-w-0 flex-1">
                <h1 className="text-[24px] font-semibold tracking-tight leading-tight">{e.fullName}</h1>
                <div className="text-[14px] text-muted-foreground" dir="rtl">{e.fullNameArabic}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  {e.jobTitle} · {e.department}
                </div>
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <Chip tone="active" icon={<BadgeCheck className="h-3 w-3" />}>Active</Chip>
                  <Chip tone="info" icon={<IdCard className="h-3 w-3" />}>Iqama {e.identityNumber}</Chip>
                  <Chip tone="info">#{e.employeeNumber}</Chip>
                  <Chip tone="default" icon={<Globe className="h-3 w-3" />}>{e.nationality}</Chip>
                  {reviewItems > 0 ? (
                    <Chip tone="review" icon={<AlertTriangle className="h-3 w-3" />}>{reviewItems} data quality issues</Chip>
                  ) : (
                    <Chip tone="active" icon={<ShieldCheck className="h-3 w-3" />}>Data clean</Chip>
                  )}
                </div>
              </div>
            </div>

            {/* SMART BUTTONS */}
            <div className="mt-5 inline-flex border rounded-lg overflow-hidden bg-card">
              <SmartButton count={contracts.length}                            label="Contracts"      icon={<FileText className="h-3.5 w-3.5" />}      onClick={() => setTab('contracts')}   active={tab === 'contracts'} />
              <SmartButton count={insurance ? 1 : 0}                            label="Insurance"      icon={<HeartPulse className="h-3.5 w-3.5" />}    onClick={() => setTab('insurance')}   active={tab === 'insurance'} />
              <SmartButton count={docs.length}                                  label="Documents"      icon={<FolderOpen className="h-3.5 w-3.5" />}    onClick={() => setTab('documents')}   active={tab === 'documents'} />
              <SmartButton count={txns.length}                                  label="Transactions"   icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setTab('transactions')}active={tab === 'transactions'} />
              <SmartButton count={contracts.filter((c) => c.state === 'history').length} label="History" icon={<History className="h-3.5 w-3.5" />}   onClick={() => setTab('contracts')} />
              <SmartButton count={reviewItems}                                  label="Review"         icon={<AlertTriangle className="h-3.5 w-3.5" />} onClick={() => setTab('audit')}       active={tab === 'audit'} />
              <SmartButton count={sar(totals.monthlyCost).replace('SAR ', '')}  label="Monthly"        icon={<Wallet className="h-3.5 w-3.5" />}        onClick={() => setTab('payroll')}     active={tab === 'payroll'} />
              <SmartButton count={learning.length}                              label="Learning"       icon={<GraduationCap className="h-3.5 w-3.5" />} onClick={() => setTab('learning')}    active={tab === 'learning'} />
            </div>
          </div>

          {/* TABS */}
          <div className="px-6">
            <TabBar
              tabs={PROFILE_TABS.map((t) => ({ key: t.key, label: t.label }))}
              value={tab}
              onChange={(k) => setTab(k as ProfileTab)}
            />
          </div>
        </header>

        {/* TAB CONTENT */}
        <div className="p-6 space-y-4">
          {tab === 'work'         && <WorkSection employee={e} />}
          {tab === 'contracts'    && <ContractsSection employeeId={e.id} />}
          {tab === 'insurance'    && <InsuranceSection employeeId={e.id} />}
          {tab === 'documents'    && <DocumentsSection employeeId={e.id} />}
          {tab === 'transactions' && <TransactionsSection employeeId={e.id} />}
          {tab === 'learning'     && <LearningSection employeeId={e.id} />}
          {tab === 'payroll'      && <PayrollSection employeeId={e.id} />}
          {tab === 'personal'     && <PersonalSection employee={e} />}
          {tab === 'audit'        && <AuditSection employeeId={e.id} />}
        </div>
      </div>

      {/* RIGHT CHATTER PANEL */}
      <aside className="border-l bg-card flex flex-col min-h-0">
        <header className="px-4 py-3 border-b flex items-center gap-1">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] flex-1">Activity</h3>
          <button className="h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast"><MoreHorizontal className="h-3.5 w-3.5" /></button>
        </header>

        {/* Compose */}
        <div className="px-4 pt-3 border-b">
          <div className="flex items-center gap-1 text-[12px]">
            {[
              { key: 'message',  label: 'Send Message', icon: MessageSquare },
              { key: 'note',     label: 'Log Note',     icon: PencilLine },
              { key: 'activity', label: 'Activity',     icon: Bell },
            ].map((t) => {
              const sel = chatTab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setChatTab(t.key as typeof chatTab)}
                  aria-pressed={sel}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md font-medium',
                    'transition-[background-color,color,transform] duration-fast ease-out-quart',
                    'active:translate-y-[1px] active:duration-75',
                    sel
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 mb-3 rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring transition-shadow">
            <textarea
              rows={2}
              placeholder={
                chatTab === 'message'  ? 'Send message to Abdullah Al-Saud and 2 followers…' :
                chatTab === 'note'     ? 'Internal note (only visible to HR)…' :
                                         'Schedule an activity (call, meeting, task)…'
              }
              className="w-full bg-transparent text-[12.5px] px-3 py-2 resize-none focus:outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center gap-1 px-2 py-1.5 border-t">
              <button className="h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast" title="Attach"><Paperclip className="h-3.5 w-3.5" /></button>
              <button className="h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast" title="Mention"><AtSign className="h-3.5 w-3.5" /></button>
              <div className="flex-1" />
              <AliveButton variant="primary" size="xs" icon={<Send className="h-3.5 w-3.5" />}>Send</AliveButton>
            </div>
          </div>
        </div>

        {/* Followers */}
        <div className="px-4 py-2 border-b flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">Followers</span>
          <div className="flex -space-x-1">
            <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-semibold flex items-center justify-center ring-2 ring-card">HF</span>
            <span className="h-5 w-5 rounded-full bg-status-active/20 text-[hsl(var(--status-active))] text-[9px] font-semibold flex items-center justify-center ring-2 ring-card">AA</span>
            <span className="h-5 w-5 rounded-full bg-status-info/20 text-[hsl(var(--status-info))] text-[9px] font-semibold flex items-center justify-center ring-2 ring-card">SY</span>
          </div>
          <div className="flex-1" />
          <AliveButton variant="ghost" size="xs">+ Add</AliveButton>
        </div>

        {/* Feed */}
        <ol className="flex-1 overflow-auto px-4 py-3 space-y-4">
          {CHATTER_SALIM.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3">
              <span className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                entry.authorRole === 'bot'
                  ? 'bg-muted text-muted-foreground'
                  : entry.authorRole === 'Admin'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-status-info-soft text-[hsl(var(--status-info))]',
              )}>
                {entry.authorInitials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold truncate">{entry.author}</span>
                  <span className="text-[10.5px] text-muted-foreground">·</span>
                  <span className="text-[10.5px] text-muted-foreground">{entry.authorRole}</span>
                  <span className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">{entry.at.slice(5, 16)}</span>
                </div>
                {entry.badges && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {entry.badges.map((b, i) => <Chip key={i} tone={b.tone}>{b.label}</Chip>)}
                  </div>
                )}
                <p className="mt-1 text-[12.5px] leading-snug">{entry.body}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                  <button className="hover:text-foreground transition-colors duration-fast">Reply</button>
                  <span>·</span>
                  <button className="hover:text-foreground transition-colors duration-fast">React</button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

// ============================================================
// Profile tab sections
// ============================================================

function WorkSection({ employee }: { employee: LabEmployee }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Position">
        <dl>
          <FormRow label="Department"    value={<span className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{employee.department}</span>} />
          <FormRow label="Job position"  value={employee.jobTitle} action={<AliveButton variant="ghost" size="xs">Edit</AliveButton>} />
          <FormRow label="Manager"       value="Abdullah Al-Saud" hint="HR Manager · #0421" />
          <FormRow label="Team"          value="Engineering · Civil" hint="72 members" />
          <FormRow label="Reports"       value="3 direct reports" />
        </dl>
      </Panel>
      <Panel title="Location & contact">
        <dl>
          <FormRow label="Work site"     value={<span className="inline-flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />Riyadh HQ · Tower B</span>} />
          <FormRow label="Project"       value="NEOM Site Camp 4" hint="Assignment ends 2027-05-31" />
          <FormRow label="Work phone"    value={<span className="font-mono">+966 11 234 5601</span>} mono />
          <FormRow label="Work email"    value={<span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />salim.qahtani@midarabia.com</span>} />
          <FormRow label="Work mobile"   value={<span className="font-mono">+966 50 123 4567</span>} mono />
        </dl>
      </Panel>
      <Panel title="Schedule & contract">
        <dl>
          <FormRow label="Working hours" value="Sun – Thu · 08:00 → 17:00" />
          <FormRow label="Hire date"     value={employee.hireDate} hint="6 years, 5 months" />
          <FormRow label="Contract"      value="Fixed-term v3" hint="2025-06-01 → 2027-05-31" />
          <FormRow label="Probation"     value="Completed 2020-09" />
        </dl>
      </Panel>
      <Panel title="Org chart preview">
        <ol className="space-y-1.5 text-[12.5px]">
          <li className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">MID Arabia · 501</span>
          </li>
          <li className="flex items-center gap-2 px-2 py-1.5 pl-6 rounded hover:bg-muted/40 transition-colors duration-fast">
            <span className="h-1.5 w-1.5 rounded-full bg-status-info" />
            <span>Engineering · 142</span>
            <span className="ml-auto text-[10.5px] text-muted-foreground">Salim Al-Qahtani</span>
          </li>
          <li className="flex items-center gap-2 px-2 py-1.5 pl-10 rounded bg-primary/5 ring-1 ring-primary/10">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-medium">Civil · 72</span>
            <span className="ml-auto text-[10.5px] text-primary font-medium">YOU</span>
          </li>
          <li className="flex items-center gap-2 px-2 py-1.5 pl-6 rounded hover:bg-muted/40 transition-colors duration-fast">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">MEP · 44</span>
          </li>
        </ol>
      </Panel>
    </div>
  );
}

function ContractsSection({ employeeId }: { employeeId: string }) {
  const all = LAB_CONTRACTS.filter((c) => c.employeeId === employeeId);
  const cur  = all.filter((c) => c.state === 'current');
  const fut  = all.filter((c) => c.state === 'future');
  const hist = all.filter((c) => c.state === 'history');
  const rev  = all.filter((c) => c.state === 'review');

  return (
    <div className="space-y-4">
      <LifecycleSection title="Current contract"   tone="active"   items={cur}  emptyHint="No active contract on file." />
      {fut.length  > 0 && <LifecycleSection title="Future contracts" tone="info"     items={fut} />}
      {hist.length > 0 && <LifecycleSection title="Contract history" tone="default" items={hist} collapsible />}
      {rev.length  > 0 && <LifecycleSection title="Review required"  tone="expired"  items={rev} />}
      {rev.length === 0 && (
        <div className="text-[12px] text-muted-foreground flex items-center gap-2 px-2">
          <ShieldCheck className="h-3.5 w-3.5 text-status-active" />
          No defects detected. Expired contracts are history records, not issues.
        </div>
      )}
    </div>
  );
}

function LifecycleSection({
  title, tone, items, collapsible, emptyHint,
}: {
  title: string;
  tone: 'active' | 'info' | 'default' | 'expired';
  items: typeof LAB_CONTRACTS;
  collapsible?: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = React.useState(!collapsible);
  return (
    <Panel
      title={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-2 hover:text-foreground transition-colors duration-fast"
        >
          {collapsible ? (
            <ChevronRight className={cn('h-3 w-3 transition-transform duration-fast', open && 'rotate-90')} />
          ) : (
            <span className={cn(
              'h-2 w-2 rounded-full',
              tone === 'active'  && 'bg-status-active',
              tone === 'info'    && 'bg-status-info',
              tone === 'default' && 'bg-muted-foreground/50',
              tone === 'expired' && 'bg-status-expired',
            )} />
          )}
          {title}
          <span className="text-muted-foreground tabular-nums normal-case font-normal">· {items.length}</span>
        </button>
      }
      action={<AliveButton variant="ghost" size="xs">View all</AliveButton>}
    >
      {!open ? (
        <div className="text-[11px] text-muted-foreground italic">Collapsed · {items.length} records.</div>
      ) : items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">{emptyHint ?? 'No records in this section.'}</div>
      ) : (
        <ul className="divide-y">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5 group hover:bg-muted/40 -mx-4 px-4 transition-colors duration-fast cursor-pointer rounded">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{c.contractType} · v{c.version}</div>
                <div className="text-[11.5px] text-muted-foreground tabular-nums">{c.startDate} → {c.endDate} · {c.filename}</div>
                {c.reviewReason && (
                  <div className="text-[11.5px] text-[hsl(var(--status-expired))] mt-0.5">{c.reviewReason}</div>
                )}
              </div>
              <Chip tone={tone === 'expired' ? 'expired' : tone}>
                {tone === 'active' ? 'Current' : tone === 'info' ? 'Future' : tone === 'expired' ? 'Review' : 'History'}
              </Chip>
              <button className="opacity-0 group-hover:opacity-100 transition-opacity duration-fast h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:translate-y-[1px]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InsuranceSection({ employeeId }: { employeeId: string }) {
  const ins = LAB_INSURANCE.find((i) => i.employeeId === employeeId);
  if (!ins) {
    return (
      <Panel title="Medical insurance">
        <div className="flex items-center gap-3 py-2">
          <ShieldAlert className="h-5 w-5 text-[hsl(var(--status-expired))]" />
          <div>
            <div className="text-[13px] font-medium">Not enrolled</div>
            <div className="text-[11.5px] text-muted-foreground">Enrol before contract start date.</div>
          </div>
          <div className="flex-1" />
          <AliveButton variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>Enrol</AliveButton>
        </div>
      </Panel>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Active policy">
        <dl>
          <FormRow label="Provider"   value={ins.provider} />
          <FormRow label="Policy"     value={ins.policyNumber} mono />
          <FormRow label="Member"     value={ins.memberNumber} mono />
          <FormRow label="Class"      value="A · Premium network" />
          <FormRow label="Coverage"   value={`${ins.startDate} → ${ins.endDate}`} />
          <FormRow label="Status"     value={<Chip tone={ins.status === 'active' ? 'active' : 'expired'}>{ins.status}</Chip>} />
        </dl>
      </Panel>
      <Panel title="Coverage details">
        <ul className="space-y-1.5 text-[12.5px]">
          {[
            ['Outpatient',    'SAR 50,000 / year'],
            ['Inpatient',     'Unlimited'],
            ['Dental',        'SAR 3,000 / year'],
            ['Optical',       'SAR 1,500 / year'],
            ['Maternity',     'SAR 15,000 / year'],
            ['Pre-existing',  'Covered after 6 months'],
          ].map(([k, v]) => (
            <li key={k} className="flex justify-between py-1 border-b last:border-0">
              <span className="text-muted-foreground">{k}</span>
              <span className="tabular-nums">{v}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function DocumentsSection({ employeeId }: { employeeId: string }) {
  const docs = LAB_DOCUMENTS.filter((d) => d.employeeId === employeeId);
  return (
    <Panel
      title="Documents"
      action={<AliveButton variant="primary" size="xs" icon={<Upload className="h-3.5 w-3.5" />}>Upload</AliveButton>}
    >
      {docs.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No documents on file.</div>
      ) : (
        <ul className="divide-y">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5 -mx-4 px-4 hover:bg-muted/40 transition-colors duration-fast cursor-pointer rounded">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium capitalize">{d.type.replace(/_/g, ' ')}</div>
                <div className="text-[11.5px] text-muted-foreground tabular-nums">#{d.docNumber} · expires {d.expiresAt}</div>
              </div>
              <Chip tone={
                d.status === 'active' ? 'active' :
                d.status === 'review_required' ? 'review' : 'expired'
              }>
                {d.status === 'review_required' ? 'Review' : d.status}
              </Chip>
              <button className="h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:translate-y-[1px]"><MoreHorizontal className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TransactionsSection({ employeeId }: { employeeId: string }) {
  const txns = LAB_TRANSACTIONS.filter((t) => t.employeeId === employeeId);
  return (
    <Panel
      title="Transactions"
      action={<AliveButton variant="primary" size="xs" icon={<Plus className="h-3.5 w-3.5" />}>Add</AliveButton>}
    >
      {txns.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No transactions recorded for this employee.</div>
      ) : (
        <ul className="divide-y">
          {txns.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 -mx-4 px-4 hover:bg-muted/40 transition-colors duration-fast cursor-pointer rounded">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{t.title}</div>
                <div className="text-[11.5px] text-muted-foreground tabular-nums">{t.type} · {t.effectiveDate}</div>
              </div>
              <Chip tone={
                t.status === 'completed' || t.status === 'approved' ? 'active' :
                t.status === 'rejected'  ? 'expired' : 'info'
              }>
                {t.status}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function LearningSection({ employeeId }: { employeeId: string }) {
  const items = LEARNING.filter((l) => l.employeeId === employeeId);
  const byCat = (cat: typeof items[number]['category']) => items.filter((i) => i.category === cat);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Certifications">
        {byCat('certification').length === 0 ? <div className="text-[12px] text-muted-foreground">None.</div> : (
          <ul className="space-y-2">
            {byCat('certification').map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-1.5 -mx-4 px-4 hover:bg-muted/40 rounded transition-colors duration-fast">
                <BadgeCheck className="h-4 w-4 text-status-active" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{i.title}</div>
                  <div className="text-[11.5px] text-muted-foreground tabular-nums">{i.issuer} · {i.acquiredOn}{i.expiresOn ? ` → ${i.expiresOn}` : ''}</div>
                </div>
                <Chip tone={i.status === 'active' ? 'active' : i.status === 'expiring' ? 'expiring' : 'expired'}>{i.status}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Skills">
        {byCat('skill').length === 0 ? <div className="text-[12px] text-muted-foreground">None.</div> : (
          <div className="flex flex-wrap gap-1.5">
            {byCat('skill').map((i) => (
              <Chip key={i.id} tone={i.level === 'expert' ? 'active' : 'info'}>
                {i.title} · {i.level ?? '—'}
              </Chip>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Training">
        {byCat('training').length === 0 ? <div className="text-[12px] text-muted-foreground">None.</div> : (
          <ul className="space-y-2">
            {byCat('training').map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-1.5">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{i.title}</div>
                  <div className="text-[11.5px] text-muted-foreground">{i.issuer} · {i.acquiredOn}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Experience">
        {byCat('experience').length === 0 ? <div className="text-[12px] text-muted-foreground">None.</div> : (
          <ol className="relative pl-5 border-l-2 border-border space-y-3">
            {byCat('experience').map((i) => (
              <li key={i.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-foreground ring-4 ring-card" />
                <div className="text-[13px] font-medium">{i.title}</div>
                <div className="text-[11.5px] text-muted-foreground tabular-nums">{i.issuer} · since {i.acquiredOn}</div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function PayrollSection({ employeeId }: { employeeId: string }) {
  const lines = payrollFor(employeeId);
  const totals = payrollTotals(lines);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <Panel title="Compensation lines" dense>
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40 border-b">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Component</th>
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Kind</th>
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Monthly</th>
              <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-muted-foreground text-right">Yearly</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.code} className="border-b hover:bg-muted/30 transition-colors duration-fast">
                <td className="px-4 py-2 font-medium">{l.label}</td>
                <td className="px-4 py-2">
                  <Chip tone={l.kind === 'deduction' ? 'expired' : l.kind === 'earning' ? 'active' : 'info'}>{l.kind}</Chip>
                </td>
                <td className={cn('px-4 py-2 text-right tabular-nums', l.monthly < 0 && 'text-[hsl(var(--status-expired))]')}>{sar(l.monthly)}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', l.yearly < 0  && 'text-[hsl(var(--status-expired))]')}>{sar(l.yearly)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 border-t-2 border-foreground/10">
            <tr>
              <td className="px-4 py-2.5 font-semibold" colSpan={2}>Net pay</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sar(totals.net)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{sar(totals.net * 12)}</td>
            </tr>
          </tfoot>
        </table>
      </Panel>
      <Panel title="Roll-up">
        <dl>
          <FormRow label="Gross"        value={<span className="tabular-nums font-medium">{sar(totals.gross)}</span>} />
          <FormRow label="Allowances"   value={<span className="tabular-nums">{sar(totals.allowances)}</span>} />
          <FormRow label="Deductions"   value={<span className="tabular-nums text-[hsl(var(--status-expired))]">{sar(totals.deductions)}</span>} />
          <FormRow label="Net monthly"  value={<span className="tabular-nums font-semibold">{sar(totals.net)}</span>} />
          <FormRow label="Net yearly"   value={<span className="tabular-nums">{sar(totals.net * 12)}</span>} />
          <FormRow label="Effective"    value="From 2026-01-01" hint="Aligned with annual raise" />
        </dl>
      </Panel>
    </div>
  );
}

function PersonalSection({ employee }: { employee: LabEmployee }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Personal details">
        <dl>
          <FormRow label="Full name"      value={employee.fullName} />
          <FormRow label="Arabic name"    value={<span dir="rtl">{employee.fullNameArabic}</span>} />
          <FormRow label="Iqama"          value={employee.identityNumber} mono />
          <FormRow label="Nationality"    value={employee.nationality} />
          <FormRow label="Date of birth"  value="1985-03-12" />
          <FormRow label="Marital status" value="Married · 2 children" />
        </dl>
      </Panel>
      <Panel title="Contact">
        <dl>
          <FormRow label="Personal email" value="salim.qahtani@personal.com" />
          <FormRow label="Personal phone" value="+966 50 999 0001" mono />
          <FormRow label="Address"        value="Riyadh, Al Olaya District" />
          <FormRow label="Emergency"      value="Wife — Fatima Al-Qahtani" hint="+966 50 999 0002" />
        </dl>
      </Panel>
    </div>
  );
}

function AuditSection({ employeeId }: { employeeId: string }) {
  const issues: { sev: 'critical' | 'warning' | 'info'; title: string; detail: string }[] = [];
  const reviewDoc = LAB_DOCUMENTS.find((d) => d.employeeId === employeeId && d.status === 'review_required');
  const reviewCtr = LAB_CONTRACTS.find((c) => c.employeeId === employeeId && c.state === 'review');
  if (reviewDoc) issues.push({ sev: 'critical', title: `${reviewDoc.type.replace(/_/g, ' ')} needs review`, detail: `# ${reviewDoc.docNumber} expires ${reviewDoc.expiresAt}` });
  if (reviewCtr) issues.push({ sev: 'critical', title: 'Contract has data defect', detail: reviewCtr.reviewReason ?? 'Verify start/end dates' });
  return (
    <Panel title="Data quality">
      {issues.length === 0 ? (
        <div className="flex items-center gap-3 text-[13px]">
          <ShieldCheck className="h-5 w-5 text-status-active" />
          <span>No defects detected. Profile is clean.</span>
        </div>
      ) : (
        <ul className="divide-y">
          {issues.map((i, n) => (
            <li key={n} className="flex items-center gap-3 py-2.5">
              <AlertTriangle className={cn(
                'h-4 w-4',
                i.sev === 'critical' ? 'text-[hsl(var(--status-expired))]'  :
                i.sev === 'warning'  ? 'text-[hsl(var(--status-expiring))]' :
                                        'text-[hsl(var(--status-info))]',
              )} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{i.title}</div>
                <div className="text-[11.5px] text-muted-foreground">{i.detail}</div>
              </div>
              <Chip tone={i.sev === 'critical' ? 'expired' : i.sev === 'warning' ? 'expiring' : 'info'}>{i.sev}</Chip>
              <AliveButton variant="secondary" size="xs">Resolve</AliveButton>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
