/**
 * Concept A — Command Center.
 *
 * Design intent: operations cockpit for an HR manager. Less "table",
 * more "morning briefing": action-required hero, risk-ranked lanes,
 * status board across the three entity types, decision-first language
 * ("Renew now", "Triage 8", "Approve 3").
 *
 * Mock data only. Self-contained — primitives are mostly inline so the
 * concept reads as a single visual story.
 */
import * as React from 'react';
import {
  AlertTriangle, ChevronRight, Activity, Sparkles, ShieldCheck, FileText,
  HeartPulse, Users, AlertCircle, ArrowUpRight, Zap, Bell, Search,
  Filter, RefreshCw, Layers, TrendingUp, WifiOff, ServerCrash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAB_EMPLOYEES, LAB_CONTRACTS, LAB_INSURANCE, LAB_ACTION_REQUIRED,
  LAB_RECENT_ACTIVITY, LAB_AGGREGATE,
} from './mock-data';

export function ConceptA({ screen }: { screen: 'dashboard' | 'employees' | 'profile' | 'contracts' | 'error' }) {
  return (
    <div className="px-6 py-6 max-w-[1480px] mx-auto">
      {screen === 'dashboard' && <Dashboard />}
      {screen === 'employees' && <Employees />}
      {screen === 'profile'   && <Profile />}
      {screen === 'contracts' && <Contracts />}
      {screen === 'error'     && <ErrorState />}
    </div>
  );
}

// =====================================================================
// Dashboard — Command Center
// =====================================================================

function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Hero — "What needs HR's attention today" */}
      <section className="rounded-2xl border bg-gradient-to-br from-status-expired-soft/40 via-background to-background p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
              <Bell className="h-3 w-3" aria-hidden="true" /> Action required today
            </div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight leading-tight">
              <span className="text-status-expired tabular">{LAB_ACTION_REQUIRED.filter((a) => a.severity === 'critical').length}</span>{' '}
              critical &nbsp;·&nbsp;
              <span className="text-status-expiring tabular">{LAB_ACTION_REQUIRED.filter((a) => a.severity === 'warning').length}</span>{' '}
              warnings to clear
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {LAB_AGGREGATE.employees} employees · {LAB_AGGREGATE.activeContracts} active contracts · {LAB_AGGREGATE.expiringIn30Days} expiring in 30 days.
              Triage the queue below before opening the day's renewals.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PressButton variant="default" icon={Zap}>Triage queue · 8</PressButton>
            <PressButton variant="outline" icon={RefreshCw}>Recompute</PressButton>
          </div>
        </div>

        {/* Inline strip — 3 status pills that report system health, not a CountCard reflex */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <SystemPill icon={FileText} label="Contracts engine" status="ok" detail="328 indexed · 90 review · last sync 4m ago" />
          <SystemPill icon={HeartPulse} label="Insurance feed" status="warn" detail="Bupa export 8h stale · resyncs at 18:00 UTC" />
          <SystemPill icon={Users} label="Identity discipline" status="ok" detail="0 duplicate Iqamas · 8 missing identities" />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Action queue — primary surface */}
        <div className="xl:col-span-2 space-y-3">
          <SectionHeader title="Action queue" hint="Sorted by severity then due date" rightSlot={<TabPill active>All</TabPill>} />
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {LAB_ACTION_REQUIRED.map((a) => (
              <ActionRow
                key={a.id}
                title={a.title}
                owner={a.owner}
                severity={a.severity}
                due={a.due}
              />
            ))}
          </div>
        </div>

        {/* Right column — quick decisions + recent activity */}
        <div className="space-y-6">
          <div>
            <SectionHeader title="Quick decisions" hint="One-click HR actions" />
            <div className="mt-3 rounded-xl border bg-card divide-y overflow-hidden">
              <QuickAction icon={FileText}    title="Renew expiring contracts"   detail="4 contracts · this week"  badge="4"  badgeTone="expiring" />
              <QuickAction icon={HeartPulse}  title="Enroll new hires"           detail="Yousef Al-Otaibi"          badge="1"  badgeTone="info" />
              <QuickAction icon={AlertCircle} title="Resolve unmatched insurance" detail="134 policies · grouped"   badge="134" badgeTone="expired" />
              <QuickAction icon={ShieldCheck} title="Approve pending requests"   detail="3 vacation · 2 docs"       badge="5"  badgeTone="info" />
            </div>
          </div>

          <div>
            <SectionHeader title="Recent activity" hint="Last 24 hours" />
            <ol className="mt-3 rounded-xl border bg-card overflow-hidden">
              {LAB_RECENT_ACTIVITY.map((r, i) => (
                <li key={r.id} className={cn(
                  'px-4 py-3 flex items-start gap-3',
                  'transition-colors duration-fast hover:bg-muted/40',
                  i > 0 && 'border-t',
                )}>
                  <span className="mt-1 h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-foreground leading-snug">{r.action}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground tabular">
                      {r.at} · {r.actor}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Employees — risk-ranked, not a generic table
// =====================================================================

function Employees() {
  const ranked = LAB_EMPLOYEES.map((e) => {
    const issues: string[] = [];
    const contracts = LAB_CONTRACTS.filter((c) => c.employeeId === e.id);
    const ins = LAB_INSURANCE.filter((i) => i.employeeId === e.id);
    const current = contracts.find((c) => c.state === 'current');
    if (!current) issues.push('No active contract');
    if (contracts.some((c) => c.state === 'review')) issues.push('Contract in review');
    if (ins.some((i) => i.status === 'expired')) issues.push('Insurance expired');
    if (ins.length === 0) issues.push('No insurance on file');
    return { ...e, issues, contracts: contracts.length, insurance: ins.length };
  }).sort((a, b) => b.issues.length - a.issues.length);

  const critical = ranked.filter((e) => e.issues.length >= 2);
  const warning  = ranked.filter((e) => e.issues.length === 1);
  const clean    = ranked.filter((e) => e.issues.length === 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Workforce</div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Employees · risk-ranked</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sorted by open issues. Clean records are collapsed at the bottom — open with the toggle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              className="h-9 pl-8 pr-3 rounded-md border bg-background text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search name or Iqama…"
            />
          </div>
          <PressButton variant="outline" icon={Filter}>Filters · 2</PressButton>
        </div>
      </header>

      <RiskLane title="Critical · needs HR today" tone="expired" count={critical.length}>
        {critical.map((e) => <EmployeeRiskRow key={e.id} e={e} />)}
      </RiskLane>

      <RiskLane title="Warnings · resolve this week" tone="expiring" count={warning.length}>
        {warning.map((e) => <EmployeeRiskRow key={e.id} e={e} />)}
      </RiskLane>

      <RiskLane title="Clean · no open issues" tone="active" count={clean.length} collapsed>
        {clean.map((e) => <EmployeeRiskRow key={e.id} e={e} />)}
      </RiskLane>
    </div>
  );
}

// =====================================================================
// Profile — split: identity card · action timeline · alerts panel
// =====================================================================

function Profile() {
  const e = LAB_EMPLOYEES.find((x) => x.id === 'emp_007')!;
  const current = LAB_CONTRACTS.find((c) => c.employeeId === e.id && c.state === 'current')!;
  const ins = LAB_INSURANCE.find((i) => i.employeeId === e.id);

  const nextActions = [
    { id: 'n1', tone: 'expired'  as const, title: 'Iqama expires in 3 days',         detail: 'Schedule the renewal appointment',  cta: 'Schedule renewal' },
    { id: 'n2', tone: 'expiring' as const, title: 'Contract expires in 28 days',     detail: 'Initiate the renewal contract',      cta: 'Draft contract v3' },
    { id: 'n3', tone: 'expiring' as const, title: 'Insurance policy lapsed Jan 9',   detail: 'Re-enroll in Bupa group plan',        cta: 'Re-enroll' },
    { id: 'n4', tone: 'info'     as const, title: 'Work permit due 2026-05-20',      detail: 'Submit renewal application',          cta: 'Open form' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-6">
      {/* Left — identity */}
      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center text-base font-semibold tracking-wide">
              BS
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-tight">{e.fullName}</div>
              <div className="text-[12px] text-muted-foreground leading-tight">{e.fullNameArabic}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <Chip tone="expired">3 critical alerts</Chip>
            <Chip tone="default">{e.department}</Chip>
            <Chip tone="info">Emp # {e.employeeNumber}</Chip>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
            <DetailField label="Iqama">{e.identityNumber}</DetailField>
            <DetailField label="Nationality">{e.nationality}</DetailField>
            <DetailField label="Hired">{e.hireDate}</DetailField>
            <DetailField label="Tenure">{Math.floor((new Date('2026-05-12').getTime() - new Date(e.hireDate).getTime()) / (365.25 * 86400000))} years</DetailField>
            <DetailField label="Job title" wide>{e.jobTitle}</DetailField>
          </dl>
          <div className="mt-5 flex items-center gap-2">
            <PressButton variant="default" className="flex-1">Open record</PressButton>
            <PressButton variant="outline">Edit</PressButton>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Risk score</div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-[28px] font-semibold tabular leading-none">87<span className="text-base text-muted-foreground">/100</span></div>
            <Chip tone="expired">High</Chip>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-status-expired" style={{ width: '87%' }} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            Driven by expiring Iqama (in 3 days), unrenewed contract, and lapsed insurance.
            Resolve any one to drop below 50.
          </p>
        </div>
      </aside>

      {/* Center — action timeline */}
      <div className="space-y-3">
        <SectionHeader title="Next actions" hint="Critical first" />
        <div className="rounded-xl border bg-card overflow-hidden">
          {nextActions.map((a, i) => (
            <div
              key={a.id}
              className={cn(
                'group flex items-start gap-4 px-5 py-4',
                i > 0 && 'border-t',
                'transition-colors duration-fast hover:bg-muted/30',
              )}
            >
              <div className={cn(
                'mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset',
                a.tone === 'expired'  && 'bg-status-expired-soft  text-status-expired  ring-status-expired/20',
                a.tone === 'expiring' && 'bg-status-expiring-soft text-status-expiring ring-status-expiring/20',
                a.tone === 'info'     && 'bg-status-info-soft     text-status-info     ring-status-info/20',
              )}>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium leading-snug">{a.title}</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{a.detail}</div>
              </div>
              <PressButton variant="outline" size="sm" className="opacity-90 group-hover:opacity-100">
                {a.cta} <ChevronRight className="h-3.5 w-3.5" />
              </PressButton>
            </div>
          ))}
        </div>

        <SectionHeader title="Operational snapshot" hint="Status board" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SnapshotCard
            icon={FileText}
            label="Current contract"
            primary={current.contractType}
            sub={`v${current.version} · ${current.startDate} → ${current.endDate}`}
            tone="expiring"
            footer="Expires in 28 days"
          />
          <SnapshotCard
            icon={HeartPulse}
            label="Medical insurance"
            primary={ins ? ins.provider : 'Not enrolled'}
            sub={ins ? `Policy ${ins.policyNumber}` : '—'}
            tone={ins?.status === 'active' ? 'active' : 'expired'}
            footer={ins ? (ins.status === 'active' ? 'Active' : `Expired ${ins.endDate}`) : 'No active policy'}
          />
          <SnapshotCard
            icon={ShieldCheck}
            label="Identity documents"
            primary="2 documents"
            sub="Iqama, Work Permit"
            tone="expired"
            footer="Iqama expires in 3 days"
          />
        </div>
      </div>

      {/* Right — alerts feed */}
      <aside className="space-y-4">
        <SectionHeader title="Alerts" hint="Live feed for this person" />
        <ol className="rounded-xl border bg-card overflow-hidden">
          {[
            { at: '2026-05-12 06:00', tone: 'expired'  as const, text: 'Iqama expires in 3 days' },
            { at: '2026-05-09 09:14', tone: 'expiring' as const, text: 'Contract expires in 28 days' },
            { at: '2026-01-09 00:01', tone: 'expiring' as const, text: 'Insurance policy lapsed' },
            { at: '2025-12-19 11:42', tone: 'info'     as const, text: 'Work permit renewal opens 2026-05-01' },
          ].map((x, i) => (
            <li key={i} className={cn('px-4 py-3 flex items-start gap-3', i > 0 && 'border-t')}>
              <span className={cn(
                'mt-1 h-2 w-2 rounded-full shrink-0',
                x.tone === 'expired'  && 'bg-status-expired',
                x.tone === 'expiring' && 'bg-status-expiring',
                x.tone === 'info'     && 'bg-status-info',
              )} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-foreground leading-snug">{x.text}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground tabular">{x.at}</div>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

// =====================================================================
// Contracts tab — lifecycle BOARD with lanes (Current/Future/History/Review)
// =====================================================================

function Contracts() {
  const e = LAB_EMPLOYEES.find((x) => x.id === 'emp_005')!;
  const cs = LAB_CONTRACTS.filter((c) => c.employeeId === e.id);
  const lanes: { key: 'current' | 'future' | 'history' | 'review'; label: string; tone: 'active' | 'info' | 'default' | 'expired'; description: string }[] = [
    { key: 'current', label: 'Current contract', tone: 'active',   description: 'Covers today' },
    { key: 'future',  label: 'Future contracts', tone: 'info',     description: 'Scheduled to start' },
    { key: 'history', label: 'Contract history', tone: 'default',  description: 'Past contracts — kept as record' },
    { key: 'review',  label: 'Review required',  tone: 'expired',  description: 'Date or template defect' },
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{e.fullName}</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Contracts &amp; lifecycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Old contracts are <strong>history</strong>, not defects. Only date / template / link defects land in Review Required.
          </p>
        </div>
        <PressButton variant="default" icon={FileText}>Add new contract</PressButton>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {lanes.map((lane) => {
          const rows = cs.filter((c) => c.state === lane.key);
          return (
            <div
              key={lane.key}
              className={cn(
                'rounded-xl border bg-card flex flex-col min-h-[280px]',
                lane.tone === 'active'   && 'ring-1 ring-inset ring-status-active/15',
                lane.tone === 'expired'  && rows.length > 0 && 'ring-1 ring-inset ring-status-expired/15',
              )}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold flex items-center gap-2">
                    <span className={cn(
                      'h-2 w-2 rounded-full',
                      lane.tone === 'active'   && 'bg-status-active',
                      lane.tone === 'info'     && 'bg-status-info',
                      lane.tone === 'default'  && 'bg-muted-foreground/40',
                      lane.tone === 'expired'  && 'bg-status-expired',
                    )} aria-hidden="true" />
                    {lane.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{lane.description}</div>
                </div>
                <span className="text-[12px] font-medium tabular text-muted-foreground">{rows.length}</span>
              </div>
              <div className="flex-1 p-3 space-y-2">
                {rows.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground italic px-2 py-6 text-center">
                    {lane.key === 'review' ? 'No defects on this profile.' : '—'}
                  </div>
                ) : rows.map((c) => (
                  <article key={c.id} className="rounded-lg border bg-background px-3 py-2.5 transition-shadow hover:shadow-hover cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-medium">{c.contractType} <span className="text-muted-foreground font-normal">v{c.version}</span></div>
                      <Chip tone={lane.tone === 'active' ? 'active' : lane.tone === 'expired' ? 'expired' : lane.tone === 'info' ? 'info' : 'default'}>{lane.key}</Chip>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground tabular">
                      {c.startDate} → {c.endDate}
                    </div>
                    {c.reviewReason && (
                      <div className="mt-2 text-[11px] text-status-expired bg-status-expired-soft px-2 py-1 rounded">
                        {c.reviewReason}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// Error — "operations center offline" with status board
// =====================================================================

function ErrorState() {
  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="rounded-2xl border bg-card p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-5">
          <div className="h-14 w-14 rounded-2xl bg-status-expired-soft text-status-expired ring-1 ring-inset ring-status-expired/20 flex items-center justify-center shrink-0">
            <ServerCrash className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Operations center</div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Live data is unreachable</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xl">
              The HR API responded with HTML instead of JSON. This usually means the preview environment intercepted the request before reaching the production Worker. Hard-refresh, or hit the Worker URL directly.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PressButton variant="default" icon={RefreshCw}>Retry</PressButton>
              <PressButton variant="outline" icon={ArrowUpRight}>Open worker health</PressButton>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <SystemPill icon={WifiOff}  label="API reachability" status="warn" detail="Preview/CDN intercept · last good 4m ago" />
          <SystemPill icon={ShieldCheck} label="CF Access JWT"  status="ok"   detail="Session valid · admin · 28m left" />
          <SystemPill icon={Activity} label="Worker version"   status="ok"   detail="0.3.1-phase-2b-corrected" />
        </div>

        <details className="mt-6">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground">Technical details</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] font-mono leading-snug text-muted-foreground whitespace-pre-wrap break-words">
{`API /api/employees returned invalid payload — <root>: Unexpected token '<', "<!doctype "... is not valid JSON`}
          </pre>
        </details>
      </div>
    </div>
  );
}

// =====================================================================
// Internal primitives (kept local so the concept reads as one file)
// =====================================================================

function PressButton({
  children, icon: Icon, variant = 'default', size = 'default', className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-[transform,box-shadow,background-color,border-color] duration-fast ease-out-quart',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'hover:-translate-y-px hover:shadow-hover',
        'active:translate-y-[1px] active:scale-[0.98] active:shadow-press active:duration-75',
        size === 'sm' ? 'text-[12px] h-7 px-2.5' : 'text-[13px] h-9 px-3.5',
        variant === 'default'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border bg-background hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function TabPill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
      active ? 'bg-foreground text-background ring-transparent' : 'bg-muted text-muted-foreground ring-border',
    )}>
      {children}
    </span>
  );
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'active' | 'expiring' | 'expired' | 'missing' | 'info' }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
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

function SectionHeader({ title, hint, rightSlot }: { title: string; hint?: string; rightSlot?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      {rightSlot}
    </div>
  );
}

function SystemPill({ icon: Icon, label, status, detail }: { icon: React.ComponentType<{ className?: string }>; label: string; status: 'ok' | 'warn' | 'down'; detail: string }) {
  const tone =
    status === 'ok'   ? 'ring-status-active/20 bg-status-active-soft/50 text-status-active'
    : status === 'warn' ? 'ring-status-expiring/20 bg-status-expiring-soft/50 text-status-expiring'
    : 'ring-status-expired/20 bg-status-expired-soft/50 text-status-expired';
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3 ring-1 ring-inset', tone)}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <div className="text-[12px] font-semibold tracking-tight">{label}</div>
        <span className="ml-auto text-[10px] uppercase tracking-wide font-medium">{status}</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ActionRow({ title, owner, severity, due }: { title: string; owner: string; severity: 'critical' | 'warning' | 'info'; due: string }) {
  return (
    <button
      type="button"
      className={cn(
        'group w-full flex items-center gap-4 px-5 py-3.5 text-left',
        'transition-colors duration-fast hover:bg-muted/40 active:bg-muted/60',
      )}
    >
      <span className={cn(
        'h-2 w-2 rounded-full shrink-0',
        severity === 'critical' && 'bg-status-expired shadow-[0_0_8px_hsl(var(--status-expired)/0.55)]',
        severity === 'warning'  && 'bg-status-expiring',
        severity === 'info'     && 'bg-status-info',
      )} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-snug">{title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="uppercase tracking-wide">{owner}</span>
          <span>·</span>
          <span>{due}</span>
        </div>
      </div>
      <Chip tone={severity === 'critical' ? 'expired' : severity === 'warning' ? 'expiring' : 'info'}>
        {severity}
      </Chip>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

function QuickAction({ icon: Icon, title, detail, badge, badgeTone }: { icon: React.ComponentType<{ className?: string }>; title: string; detail: string; badge: string; badgeTone: 'expiring' | 'expired' | 'info' }) {
  return (
    <button
      type="button"
      className={cn(
        'group w-full flex items-center gap-3 px-4 py-3 text-left',
        'transition-colors duration-fast hover:bg-muted/40 active:bg-muted/60',
      )}
    >
      <span className="h-8 w-8 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0 group-hover:bg-background group-hover:text-foreground transition-colors duration-fast">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-snug">{title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{detail}</div>
      </div>
      <Chip tone={badgeTone}>{badge}</Chip>
    </button>
  );
}

function RiskLane({ title, tone, count, children, collapsed }: { title: string; tone: 'expired' | 'expiring' | 'active'; count: number; children: React.ReactNode; collapsed?: boolean }) {
  const [open, setOpen] = React.useState(!collapsed);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        <span className={cn(
          'h-2.5 w-2.5 rounded-full shrink-0',
          tone === 'expired'  && 'bg-status-expired',
          tone === 'expiring' && 'bg-status-expiring',
          tone === 'active'   && 'bg-status-active',
        )} aria-hidden="true" />
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        <Chip tone={tone === 'expired' ? 'expired' : tone === 'expiring' ? 'expiring' : 'active'}>{count}</Chip>
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors duration-fast">
          {open ? 'Collapse' : 'Expand'}
        </span>
      </button>
      {open && (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {children}
        </div>
      )}
    </section>
  );
}

function EmployeeRiskRow({ e }: { e: { id: string; fullName: string; fullNameArabic: string; department: string; jobTitle: string; employeeNumber: string; identityNumber: string; issues: string[]; contracts: number; insurance: number } }) {
  return (
    <button
      type="button"
      className={cn(
        'group w-full flex items-center gap-4 px-5 py-3 text-left',
        'transition-colors duration-fast hover:bg-muted/40 active:bg-muted/60',
      )}
    >
      <div className="h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[12px] font-semibold shrink-0">
        {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-snug truncate">{e.fullName}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground tabular flex flex-wrap items-center gap-x-2">
          <span>Emp # {e.employeeNumber}</span>
          <span>·</span>
          <span>{e.department}</span>
          <span>·</span>
          <span>{e.jobTitle}</span>
        </div>
      </div>
      <div className="hidden md:flex gap-1.5 flex-wrap justify-end max-w-md">
        {e.issues.map((i) => <Chip key={i} tone="expired">{i}</Chip>)}
        {e.issues.length === 0 && <Chip tone="active">No issues</Chip>}
      </div>
      <div className="hidden lg:flex items-center gap-3 text-[11px] text-muted-foreground tabular w-24 justify-end">
        <span><FileText className="h-3 w-3 inline mr-0.5" aria-hidden="true" />{e.contracts}</span>
        <span><HeartPulse className="h-3 w-3 inline mr-0.5" aria-hidden="true" />{e.insurance}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

function SnapshotCard({ icon: Icon, label, primary, sub, tone, footer }: { icon: React.ComponentType<{ className?: string }>; label: string; primary: string; sub: string; tone: 'active' | 'expiring' | 'expired'; footer: string }) {
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
          <div className="mt-2 text-[15px] font-semibold tracking-tight truncate">{primary}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground tabular truncate">{sub}</div>
        </div>
        <div className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset',
          tone === 'active'   && 'bg-status-active-soft   text-status-active   ring-status-active/15',
          tone === 'expiring' && 'bg-status-expiring-soft text-status-expiring ring-status-expiring/15',
          tone === 'expired'  && 'bg-status-expired-soft  text-status-expired  ring-status-expired/15',
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn(
        'mt-3 text-[11px] font-medium inline-flex items-center gap-1.5',
        tone === 'active'   && 'text-status-active',
        tone === 'expiring' && 'text-status-expiring',
        tone === 'expired'  && 'text-status-expired',
      )}>
        <TrendingUp className="h-3 w-3" aria-hidden="true" /> {footer}
      </div>
    </article>
  );
}

function DetailField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</dt>
      <dd className="mt-0.5 text-foreground truncate">{children}</dd>
    </div>
  );
}

// Silence unused warnings — these primitives ship with the concept but the
// final layout doesn't reference all icons; kept for future iteration.
void Sparkles; void Activity; void Layers;
