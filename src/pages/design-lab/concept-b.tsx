/**
 * Concept B — Employee Life Record.
 *
 * Design intent: the employee profile is the HERO of the system, not a
 * tab inside a dashboard. The day-to-day workflow is:
 *
 *   pick an employee → see their LIFE RECORD timeline → act
 *
 * The Dashboard exists but it's a thin "starting line" page that
 * surfaces who's at risk and feeds the user into a profile. Tabs are
 * secondary; the central timeline is the experience.
 *
 * Mock data only.
 */
import * as React from 'react';
import {
  ChevronRight, Search, IdCard, Briefcase, Calendar, Globe, Plane, BookOpen,
  FileText, HeartPulse, FolderOpen, ClipboardList, ScrollText, AlertTriangle,
  Sparkles, Filter, ArrowUpRight, ShieldCheck, ShieldAlert, ChevronLeft,
  RefreshCw, ServerCrash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAB_EMPLOYEES, LAB_CONTRACTS, LAB_INSURANCE, LAB_DOCUMENTS, LAB_TRANSACTIONS,
  LAB_TIMELINE_SALIM, LAB_AGGREGATE,
} from './mock-data';

export function ConceptB({ screen }: { screen: 'dashboard' | 'employees' | 'profile' | 'contracts' | 'error' }) {
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
// Dashboard — minimal entry that drives toward profiles
// =====================================================================

function Dashboard() {
  const featured = LAB_EMPLOYEES.slice(0, 4);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      <div className="space-y-8">
        <header>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Good morning, Hamza</div>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight leading-tight">Pick a person to work on.</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Every record in this system has a life of its own — hiring, contracts, insurance, documents, transactions. Open a profile to see the full timeline.
          </p>
        </header>

        <section>
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-[14px] font-semibold tracking-tight">Pinned profiles</h2>
            <a className="text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-fast inline-flex items-center gap-1">
              View all employees <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {featured.map((e) => <ProfileCard key={e.id} e={e} />)}
          </ul>
        </section>

        <section>
          <h2 className="text-[14px] font-semibold tracking-tight mb-3">Recent activity across the workforce</h2>
          <ol className="rounded-xl border bg-card overflow-hidden">
            {LAB_TIMELINE_SALIM.slice(-5).reverse().map((t, i) => (
              <li key={`${t.date}-${i}`} className={cn('flex items-start gap-4 px-5 py-3', i > 0 && 'border-t')}>
                <TimelineDot kind={t.kind} tone={t.tone ?? 'default'} small />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium leading-snug">{t.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular">{t.date} · {t.detail}</div>
                </div>
                <div className="text-[11px] text-muted-foreground hidden md:block">Salim Al-Qahtani</div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="space-y-6">
        <div className="rounded-2xl border bg-gradient-to-br from-muted/40 via-card to-card p-5">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Workforce</div>
          <div className="mt-3 text-[36px] font-semibold tabular leading-none tracking-tight">{LAB_AGGREGATE.employees}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">active people on record</div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <Stat label="Contracts" value={LAB_AGGREGATE.contracts} />
            <Stat label="Insurance" value={LAB_AGGREGATE.insurance} />
            <Stat label="In review" value={LAB_AGGREGATE.reviewQueueOpen} tone="expiring" />
            <Stat label="Unmatched" value={LAB_AGGREGATE.unmatchedContracts + LAB_AGGREGATE.unmatchedInsurance} tone="expired" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h3 className="text-[13px] font-semibold tracking-tight">Watchlist</h3>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            People with iqama, contract, or insurance expiring soon.
          </p>
          <ol className="mt-3 space-y-2">
            {[
              { name: 'Bilal Sharif',        why: 'Iqama in 3 days',      tone: 'expired'  as const },
              { name: 'Ahmed Hassan',        why: 'Insurance lapsed',     tone: 'expiring' as const },
              { name: 'Faisal Khan',         why: 'Contract in review',   tone: 'expired'  as const },
              { name: 'Yousef Al-Otaibi',    why: 'No insurance yet',     tone: 'expiring' as const },
            ].map((w, i) => (
              <li key={i} className="flex items-center gap-3 py-1">
                <span className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  w.tone === 'expired'  && 'bg-status-expired',
                  w.tone === 'expiring' && 'bg-status-expiring',
                )} aria-hidden="true" />
                <span className="text-[13px] font-medium flex-1 truncate">{w.name}</span>
                <span className="text-[11px] text-muted-foreground">{w.why}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

// =====================================================================
// Employees — searchable picker, not a generic table
// =====================================================================

function Employees() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="text-center">
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Workforce</div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Pick a person.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search by name, Iqama, or employee number.</p>
      </header>

      {/* Hero search */}
      <div className="relative max-w-2xl mx-auto">
        <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          className={cn(
            'w-full h-14 pl-12 pr-32 rounded-2xl border-2 bg-card text-[15px]',
            'focus:outline-none focus:border-foreground transition-colors duration-fast',
            'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
          )}
          placeholder="Search 501 employees…"
          defaultValue="al-"
        />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded border bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground">
          ⌘ K
        </kbd>
      </div>

      <div className="max-w-2xl mx-auto flex items-center gap-2 flex-wrap justify-center">
        <FilterChip>All departments</FilterChip>
        <FilterChip active>Active only · 487</FilterChip>
        <FilterChip>With current contract</FilterChip>
        <FilterChip tone="expiring">Issues open · 14</FilterChip>
      </div>

      {/* Search results — profile-style cards, not a row table */}
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl mx-auto">
        {LAB_EMPLOYEES.filter((e) => e.fullName.toLowerCase().includes('al-')).map((e) => (
          <ProfileCard key={e.id} e={e} />
        ))}
      </ol>
    </div>
  );
}

// =====================================================================
// Profile — left identity · center life timeline · right alerts
// =====================================================================

function Profile() {
  const e = LAB_EMPLOYEES[0]!;          // Salim — richest timeline
  const contracts = LAB_CONTRACTS.filter((c) => c.employeeId === e.id);
  const current = contracts.find((c) => c.state === 'current');
  const insurance = LAB_INSURANCE.find((i) => i.employeeId === e.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6">
      {/* LEFT — identity */}
      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
          <div className="px-5 pb-5 -mt-9">
            <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground ring-4 ring-card flex items-center justify-center text-[20px] font-semibold tracking-wide">
              {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
            <h2 className="mt-3 text-[17px] font-semibold tracking-tight leading-tight">{e.fullName}</h2>
            <div className="mt-0.5 text-[13px] text-muted-foreground leading-snug" dir="rtl">{e.fullNameArabic}</div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Chip tone="active">Active</Chip>
              <Chip tone="info">6 years tenure</Chip>
            </div>

            <dl className="mt-5 space-y-3 text-[12px]">
              <DetailRow icon={IdCard}     label="Iqama"          value={e.identityNumber} mono />
              <DetailRow icon={Briefcase}  label="Department"     value={e.department} />
              <DetailRow icon={Globe}      label="Nationality"    value={e.nationality} />
              <DetailRow icon={Calendar}   label="Hired"          value={e.hireDate} />
              <DetailRow icon={ScrollText} label="Employee #"     value={e.employeeNumber} mono />
            </dl>

            <div className="mt-5 flex items-center gap-2">
              <FlatButton variant="default" className="flex-1">Edit profile</FlatButton>
              <FlatButton variant="outline">⋯</FlatButton>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h3 className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground font-medium">At a glance</h3>
          <div className="mt-3 space-y-2.5 text-[12px]">
            <GlanceRow icon={FileText}    label="Current contract" value={current ? `${current.contractType} v${current.version}` : 'None'} tone={current ? 'active' : 'expired'} />
            <GlanceRow icon={HeartPulse}  label="Insurance"        value={insurance ? insurance.provider : 'Not enrolled'} tone={insurance?.status === 'active' ? 'active' : 'expired'} />
            <GlanceRow icon={FolderOpen}  label="Documents"        value="2 on file" tone="active" />
            <GlanceRow icon={ClipboardList} label="Transactions"   value="2 in last 90 days" tone="active" />
          </div>
        </div>
      </aside>

      {/* CENTER — life timeline (the HERO) */}
      <div className="min-w-0">
        <header className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">Life record</div>
            <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Timeline since hire</h1>
          </div>
          <div className="flex items-center gap-2">
            <FilterChip active>All events</FilterChip>
            <FilterChip>Contracts</FilterChip>
            <FilterChip>Insurance</FilterChip>
            <FilterChip>Documents</FilterChip>
            <FilterChip>Transactions</FilterChip>
          </div>
        </header>

        <ol className="relative pl-8 border-l-2 border-border space-y-6 pb-4">
          {[...LAB_TIMELINE_SALIM].reverse().map((t, i) => (
            <li key={`${t.date}-${i}`} className="relative">
              <span className="absolute -left-[37px] top-1.5">
                <TimelineDot kind={t.kind} tone={t.tone ?? 'default'} />
              </span>
              <article className={cn(
                'rounded-xl border bg-card px-5 py-4 transition-shadow hover:shadow-hover',
                t.tone === 'active' && 'ring-1 ring-inset ring-status-active/15',
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-snug">{t.title}</div>
                    {t.detail && <div className="mt-1 text-[12px] text-muted-foreground leading-snug">{t.detail}</div>}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular shrink-0 whitespace-nowrap">{t.date}</div>
                </div>
              </article>
            </li>
          ))}
          {/* terminus — hire */}
          <li className="relative">
            <span className="absolute -left-[37px] top-1.5">
              <span className="block h-3 w-3 rounded-full bg-primary ring-4 ring-background" aria-hidden="true" />
            </span>
            <div className="rounded-xl border bg-primary/5 px-5 py-4">
              <div className="text-[12px] font-medium tracking-wide uppercase text-primary">Start of record</div>
            </div>
          </li>
        </ol>
      </div>

      {/* RIGHT — alerts + quick actions */}
      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="text-[13px] font-semibold tracking-tight">Open alerts</h3>
          <p className="text-[11px] text-muted-foreground mt-1">No critical issues for {e.fullName.split(' ')[0]}.</p>
          <ol className="mt-3 space-y-2">
            <li className="flex items-start gap-3">
              <span className="h-2 w-2 rounded-full bg-status-info mt-1.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[12px] font-medium">Iqama expires in 16 months</div>
                <div className="text-[11px] text-muted-foreground">2027-09-15</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-[12px] font-medium">Insurance renews automatically</div>
                <div className="text-[11px] text-muted-foreground">2026-05-31</div>
              </div>
            </li>
          </ol>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h3 className="text-[13px] font-semibold tracking-tight">Quick actions</h3>
          <div className="mt-3 space-y-1.5">
            <QuickRow icon={FileText}    label="New contract" />
            <QuickRow icon={HeartPulse}  label="Insurance event" />
            <QuickRow icon={FolderOpen}  label="Upload document" />
            <QuickRow icon={ClipboardList} label="New transaction" />
            <QuickRow icon={Plane}       label="Vacation request" />
            <QuickRow icon={BookOpen}    label="Training entry" />
          </div>
        </div>
      </aside>
    </div>
  );
}

// =====================================================================
// Contracts — timeline-style lifecycle (still 4 sections, but as a story)
// =====================================================================

function Contracts() {
  const e = LAB_EMPLOYEES[4]!;          // Ahmed Hassan — current + future + 2 history
  const cs = LAB_CONTRACTS.filter((c) => c.employeeId === e.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const current = cs.find((c) => c.state === 'current');
  const future  = cs.filter((c) => c.state === 'future');
  const history = cs.filter((c) => c.state === 'history').reverse();
  const review  = cs.filter((c) => c.state === 'review');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{e.fullName}</div>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Contract lifecycle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each contract is a chapter. Old chapters stay — they're history, not defects.
        </p>
      </header>

      {/* Current — single hero card */}
      {current && (
        <section>
          <SectionLabel tone="active">Current chapter</SectionLabel>
          <article className="mt-3 rounded-2xl border-2 border-status-active/20 bg-status-active-soft/30 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] uppercase tracking-wide text-status-active font-semibold">In effect today</div>
                <h3 className="mt-1 text-[18px] font-semibold tracking-tight">{current.contractType} <span className="text-muted-foreground font-normal">v{current.version}</span></h3>
                <div className="mt-1 text-[12px] text-muted-foreground tabular">{current.startDate} → {current.endDate} · {current.filename}</div>
              </div>
              <Chip tone="active">Current</Chip>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <FlatButton variant="default" size="sm">View PDF</FlatButton>
              <FlatButton variant="outline" size="sm">Start renewal</FlatButton>
            </div>
          </article>
        </section>
      )}

      {/* Future */}
      {future.length > 0 && (
        <section>
          <SectionLabel tone="info">Next chapter</SectionLabel>
          <ol className="mt-3 space-y-2">
            {future.map((c) => (
              <ContractStrip key={c.id} c={c} tone="info" subline="Scheduled to start" />
            ))}
          </ol>
        </section>
      )}

      {/* History — timeline */}
      {history.length > 0 && (
        <section>
          <SectionLabel tone="default">History</SectionLabel>
          <ol className="mt-3 relative pl-6 border-l-2 border-border space-y-3">
            {history.map((c) => (
              <li key={c.id} className="relative">
                <span className="absolute -left-[29px] top-2 h-3 w-3 rounded-full bg-muted-foreground/30 ring-4 ring-background" aria-hidden="true" />
                <ContractStrip c={c} tone="default" subline="Past chapter" />
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Review */}
      {review.length > 0 && (
        <section>
          <SectionLabel tone="expired">Review required</SectionLabel>
          <ol className="mt-3 space-y-2">
            {review.map((c) => (
              <ContractStrip key={c.id} c={c} tone="expired" subline={c.reviewReason ?? 'Defect'} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// =====================================================================
// Error — designed pause page
// =====================================================================

function ErrorState() {
  return (
    <div className="max-w-2xl mx-auto py-16 text-center">
      <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-status-expired-soft text-status-expired ring-1 ring-inset ring-status-expired/20 mb-6">
        <ServerCrash className="h-9 w-9" aria-hidden="true" />
      </div>
      <h1 className="text-[28px] font-semibold tracking-tight">We can't reach this person right now.</h1>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
        The HR API returned an unexpected response. It usually means the local preview isn't authenticated against production. Hard-refresh or sign in again.
      </p>
      <div className="mt-6 inline-flex items-center gap-2">
        <FlatButton variant="default"><RefreshCw className="h-4 w-4" /> Retry</FlatButton>
        <FlatButton variant="outline"><ChevronLeft className="h-4 w-4" /> Back to employees</FlatButton>
      </div>
      <details className="mt-8 max-w-sm mx-auto text-left">
        <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground">Technical details</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] font-mono leading-snug text-muted-foreground whitespace-pre-wrap break-words">
{`API /api/employees/emp_001 returned invalid payload — <root>: Unexpected token '<', "<!doctype "... is not valid JSON`}
        </pre>
      </details>
    </div>
  );
}

// =====================================================================
// Concept-B primitives
// =====================================================================

function ProfileCard({ e }: { e: { id: string; fullName: string; fullNameArabic: string; department: string; jobTitle: string; identityNumber: string } }) {
  return (
    <li>
      <article
        className={cn(
          'group rounded-2xl border bg-card p-5 cursor-pointer',
          'transition-[transform,box-shadow,border-color] duration-fast ease-out-quart',
          'hover:-translate-y-px hover:shadow-hover hover:border-foreground/20',
          'active:translate-y-0 active:duration-75',
        )}
      >
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center text-[14px] font-semibold tracking-wide shrink-0">
            {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold tracking-tight truncate">{e.fullName}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground truncate" dir="rtl">{e.fullNameArabic}</div>
            <div className="mt-2 text-[11px] text-muted-foreground tabular">
              {e.department} · {e.jobTitle}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </article>
    </li>
  );
}

function TimelineDot({ kind, tone, small }: { kind: 'hire' | 'contract' | 'insurance' | 'document' | 'transaction' | 'alert'; tone: 'default' | 'active' | 'expiring' | 'expired' | 'info'; small?: boolean }) {
  const ICON: Record<typeof kind, React.ComponentType<{ className?: string }>> = {
    hire:        Sparkles,
    contract:    FileText,
    insurance:   HeartPulse,
    document:    FolderOpen,
    transaction: ClipboardList,
    alert:       AlertTriangle,
  };
  const Icon = ICON[kind];
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full ring-4 ring-background shrink-0',
      small ? 'h-6 w-6' : 'h-7 w-7',
      tone === 'active'   && 'bg-status-active   text-white',
      tone === 'expiring' && 'bg-status-expiring text-white',
      tone === 'expired'  && 'bg-status-expired  text-white',
      tone === 'info'     && 'bg-status-info     text-white',
      tone === 'default'  && 'bg-card text-muted-foreground border',
    )} aria-hidden="true">
      <Icon className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
    </span>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'expiring' | 'expired' }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        'mt-0.5 text-[18px] font-semibold tabular leading-none',
        tone === 'default'  && 'text-foreground',
        tone === 'expiring' && 'text-status-expiring',
        tone === 'expired'  && 'text-status-expired',
      )}>{value}</div>
    </div>
  );
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'active' | 'expiring' | 'expired' | 'info' }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
      tone === 'default'  && 'bg-muted text-muted-foreground ring-border',
      tone === 'active'   && 'bg-status-active-soft   text-status-active   ring-status-active/20',
      tone === 'expiring' && 'bg-status-expiring-soft text-status-expiring ring-status-expiring/20',
      tone === 'expired'  && 'bg-status-expired-soft  text-status-expired  ring-status-expired/20',
      tone === 'info'     && 'bg-status-info-soft     text-status-info     ring-status-info/20',
    )}>
      {children}
    </span>
  );
}

function FilterChip({ children, active, tone }: { children: React.ReactNode; active?: boolean; tone?: 'expiring' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset',
        'transition-[background-color,color,box-shadow] duration-fast ease-out-quart',
        'hover:shadow-hover active:translate-y-[1px] active:duration-75',
        active
          ? 'bg-foreground text-background ring-transparent'
          : tone === 'expiring'
            ? 'bg-status-expiring-soft text-status-expiring ring-status-expiring/20 hover:bg-status-expiring-soft/70'
            : 'bg-card text-muted-foreground ring-border hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function DetailRow({ icon: Icon, label, value, mono }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('text-[13px] font-medium truncate', mono && 'font-mono')}>{value}</div>
      </div>
    </div>
  );
}

function GlanceRow({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone: 'active' | 'expiring' | 'expired' }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn(
        'h-7 w-7 rounded-md flex items-center justify-center shrink-0',
        tone === 'active'   && 'bg-status-active-soft   text-status-active',
        tone === 'expiring' && 'bg-status-expiring-soft text-status-expiring',
        tone === 'expired'  && 'bg-status-expired-soft  text-status-expired',
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-[12px] font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function QuickRow({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      type="button"
      className={cn(
        'group w-full flex items-center gap-3 px-2 py-2 rounded-md text-left',
        'transition-colors duration-fast hover:bg-muted',
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-[12px] font-medium flex-1">{label}</span>
      <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

function SectionLabel({ children, tone }: { children: React.ReactNode; tone: 'default' | 'active' | 'expiring' | 'expired' | 'info' }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        tone === 'default'  && 'bg-muted-foreground/40',
        tone === 'active'   && 'bg-status-active',
        tone === 'expiring' && 'bg-status-expiring',
        tone === 'expired'  && 'bg-status-expired',
        tone === 'info'     && 'bg-status-info',
      )} aria-hidden="true" />
      <h2 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{children}</h2>
    </div>
  );
}

function ContractStrip({ c, tone, subline }: { c: { id: string; contractType: string; startDate: string; endDate: string; version: number; filename: string; reviewReason?: string }; tone: 'active' | 'info' | 'default' | 'expired'; subline: string }) {
  return (
    <article className={cn(
      'rounded-xl border bg-card px-4 py-3 transition-shadow hover:shadow-hover',
      tone === 'expired' && 'ring-1 ring-inset ring-status-expired/20',
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-snug">{c.contractType} <span className="text-muted-foreground font-normal">v{c.version}</span></div>
          <div className="mt-0.5 text-[11px] text-muted-foreground tabular">{c.startDate} → {c.endDate}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{subline}</div>
        </div>
        <Chip tone={tone === 'active' ? 'active' : tone === 'info' ? 'info' : tone === 'expired' ? 'expired' : 'default'}>
          {tone === 'active' ? 'Current' : tone === 'info' ? 'Future' : tone === 'expired' ? 'Review' : 'History'}
        </Chip>
      </div>
      {c.reviewReason && (
        <div className="mt-2 text-[11px] text-status-expired bg-status-expired-soft px-2 py-1 rounded">{c.reviewReason}</div>
      )}
    </article>
  );
}

function FlatButton({ children, variant = 'default', size = 'default', className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline'; size?: 'default' | 'sm' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
        'transition-[transform,box-shadow,background-color,border-color] duration-fast ease-out-quart',
        'hover:-translate-y-px hover:shadow-hover',
        'active:translate-y-[1px] active:scale-[0.98] active:shadow-press active:duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        size === 'sm' ? 'text-[12px] h-7 px-2.5' : 'text-[13px] h-9 px-3.5',
        variant === 'default'
          ? 'bg-foreground text-background hover:bg-foreground/90'
          : 'border bg-background hover:bg-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

void Filter; void ShieldCheck; void ShieldAlert; void LAB_DOCUMENTS; void LAB_TRANSACTIONS;
