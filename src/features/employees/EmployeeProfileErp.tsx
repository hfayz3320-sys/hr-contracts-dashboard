/**
 * EmployeeProfileErp — Phase 7A → Phase 9 default.
 *
 * Official Employee 360 profile layout. The old layout remains mounted
 * behind `?profile=legacy` for emergency rollback; there is NO UI link
 * to it. Renders the SAME real data that the legacy profile uses; no mocks.
 *
 *   ┌──────────────────────────────────────┬──────────────┐
 *   │  HERO (avatar · name · chips)        │              │
 *   │  SMART BUTTONS (counts of real data) │  ACTIVITY     │
 *   ├──────────────────────────────────────┤  (real audit)│
 *   │  TABS                                │              │
 *   │  ┌────────────────────────────────┐  │  Composer is │
 *   │  │  tab content                   │  │  read-only   │
 *   │  └────────────────────────────────┘  │  (POST not   │
 *   │                                       │   wired yet) │
 *   └──────────────────────────────────────┴──────────────┘
 *
 * Forbidden in this component:
 *   - no CHATTER_SALIM or any mock chatter
 *   - no fake AI suggestions
 *   - no mock payroll lines (Compensation tab is "Not configured" if no data)
 *   - no decorative KPI deltas
 *   - no drag-and-drop, no org-chart canvas, no app-shell replacement
 *
 * Edit / write affordances stay disabled (mirrors the default profile's
 * A5.2 gating). Composer is visible but disabled with a tooltip.
 */
import * as React from 'react';
import {
  IdCard, Globe, Mail, ShieldCheck, ShieldAlert, FileText,
  HeartPulse, FolderOpen, ClipboardList, GraduationCap, Wallet,
  AlertTriangle, MessageSquare, PencilLine, Bell, Upload, Plus, Send,
  AtSign, Paperclip, ChevronRight, UserPlus,
  Building2, BadgeCheck, History, Calendar, CheckCircle2,
  ScrollText, User, Gauge, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dates';
import { routes } from '@/lib/routes';
import {
  splitContractsByLifecycle,
  contractDataQualityLabel,
  isInformationalDataQualityFlag,
  type ContractLifecycleSplit,
} from '@/lib/contract-lifecycle';
import type {
  Contract, Insurance, AuditEvent, Employee, EmployeeDocument,
  EmployeeTransaction, EmployeeDataQualityIssue, EmployeeDataQualityReport,
} from '@shared/domain';

import { AliveButton } from '@/components/ui-foundation/AliveButton';
import { Chip } from '@/components/ui-foundation/Chip';
import { SmartButton } from '@/components/ui-foundation/SmartButton';
import { Panel } from '@/components/ui-foundation/Panel';
import { FormRow } from '@/components/ui-foundation/FormRow';
import { TabBar } from '@/components/ui-foundation/TabBar';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { AuditTimeline } from '@/components/common/AuditTimeline';
import { Link } from 'react-router-dom';

// ---- Data shape ----------------------------------------------------------

export interface EmployeeProfileErpProps {
  employee: Employee;
  contracts: Contract[];
  insurance: Insurance[];
  documents: EmployeeDocument[];
  transactions: EmployeeTransaction[];
  audit: AuditEvent[];
  dataQuality?: EmployeeDataQualityReport;
  isAdmin: boolean;
  /** Visible to admins + hr_managers; controls the data-quality tab visibility. */
  canSeeDataQuality: boolean;
  /** Redacted iqama string (same logic as the default profile). */
  redactedIdentity: string;
}

const TABS = [
  { key: 'summary',     label: 'Summary'             },
  { key: 'personal',    label: 'Personal Info'       },
  { key: 'job',         label: 'Job Info'            },
  { key: 'contracts',   label: 'Contracts'           },
  { key: 'insurance',   label: 'Medical Insurance'   },
  { key: 'documents',   label: 'Documents'           },
  { key: 'transactions',label: 'Transactions'        },
  { key: 'payroll',     label: 'Payroll / Compensation' },
  { key: 'learning',    label: 'Learning / Experience'  },
  { key: 'audit',       label: 'Audit Trail'         },
] as const;
type TabKey = typeof TABS[number]['key'];

const A52_TOOLTIP = 'Write actions ship in a later phase';

function initialsFromName(name: string | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts[1]?.charAt(0) ?? '';
  const initials = (first + second).toUpperCase();
  return initials || '—';
}

// ============================================================
// Main component
// ============================================================

export function EmployeeProfileErp(props: EmployeeProfileErpProps) {
  const {
    employee: e, contracts, insurance, documents, transactions, audit,
    dataQuality, isAdmin, canSeeDataQuality, redactedIdentity,
  } = props;

  const [tab, setTab] = React.useState<TabKey>('summary');

  const split = splitContractsByLifecycle(contracts);
  const currentEmployeeNumber = e.employeeNumberHistory.find((h) => h.to == null)?.number ?? null;
  const activeInsurance = insurance.filter((i) => i.status === 'active').length;
  const reviewIssuesCount = (dataQuality?.issues.length ?? 0) + split.reviewRequired.length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-0 -mx-6 -mb-6">
      {/* MAIN COLUMN */}
      <div className="min-w-0 px-6 pb-6">
        {/* HERO */}
        <header className="rounded-lg border bg-card mb-4 overflow-hidden">
          <div className="px-6 pt-5 pb-3">
            {/* Top toolbar — disabled write actions */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11.5px] text-muted-foreground mb-3">
              <Link
                to={routes.employees}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors duration-fast"
              >
                Employees
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{e.fullName || e.id}</span>

              <div className="flex-1" />

              <AliveButton variant="ghost" size="xs" disabled title={A52_TOOLTIP} icon={<UserPlus className="h-3.5 w-3.5" />}>Create user</AliveButton>
              <AliveButton variant="ghost" size="xs" disabled title={A52_TOOLTIP} icon={<MessageSquare className="h-3.5 w-3.5" />}>Send message</AliveButton>
              <AliveButton variant="ghost" size="xs" disabled title={A52_TOOLTIP} icon={<PencilLine className="h-3.5 w-3.5" />}>Log note</AliveButton>
              <AliveButton variant="ghost" size="xs" disabled title={A52_TOOLTIP} icon={<Bell className="h-3.5 w-3.5" />}>Activity</AliveButton>
              <AliveButton variant="ghost" size="xs" disabled title={A52_TOOLTIP} icon={<Upload className="h-3.5 w-3.5" />}>Upload</AliveButton>
              <AliveButton variant="primary" size="xs" disabled title={A52_TOOLTIP} icon={<Plus className="h-3.5 w-3.5" />}>Transaction</AliveButton>
            </div>

            {/* Identity */}
            <div className="flex items-start gap-5">
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-primary/10 text-primary border border-primary/15 font-semibold tracking-wide text-[24px] shrink-0"
              >
                {initialsFromName(e.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-[24px] font-semibold tracking-tight leading-tight">
                  {e.fullName || <span className="font-mono text-muted-foreground">—</span>}
                </h1>
                {e.fullNameArabic && (
                  <div className="text-[14px] text-muted-foreground" dir="rtl">{e.fullNameArabic}</div>
                )}
                {e.jobTitle && (
                  <div className="mt-1 text-[13px] text-muted-foreground">
                    {e.jobTitle}{e.department ? ` · ${e.department}` : ''}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <Chip tone={e.status === 'active' ? 'active' : 'missing'} icon={<BadgeCheck className="h-3 w-3" />}>
                    {e.status === 'active' ? 'Active' : 'Inactive'}
                  </Chip>
                  <Chip tone="info" icon={<IdCard className="h-3 w-3" />}>Iqama {redactedIdentity}</Chip>
                  {currentEmployeeNumber && <Chip tone="info">Emp #{currentEmployeeNumber}</Chip>}
                  {e.nationality && <Chip tone="default" icon={<Globe className="h-3 w-3" />}>{e.nationality}</Chip>}
                  {reviewIssuesCount > 0 ? (
                    <Chip tone="review" icon={<AlertTriangle className="h-3 w-3" />}>
                      {reviewIssuesCount} review {reviewIssuesCount === 1 ? 'issue' : 'issues'}
                    </Chip>
                  ) : (
                    <Chip tone="active" icon={<ShieldCheck className="h-3 w-3" />}>Data clean</Chip>
                  )}
                </div>
              </div>
            </div>

            {/* Smart buttons — wired to REAL counts */}
            <div className="mt-5 inline-flex border rounded-lg overflow-x-auto bg-card max-w-full">
              <SmartButton count={contracts.length}             label="Contracts"     icon={<FileText className="h-3.5 w-3.5" />}      onClick={() => setTab('contracts')}    active={tab === 'contracts'} />
              <SmartButton count={insurance.length}             label="Insurance"     icon={<HeartPulse className="h-3.5 w-3.5" />}    onClick={() => setTab('insurance')}    active={tab === 'insurance'} />
              <SmartButton count={documents.length}             label="Documents"     icon={<FolderOpen className="h-3.5 w-3.5" />}    onClick={() => setTab('documents')}    active={tab === 'documents'} />
              <SmartButton count={transactions.length}          label="Transactions"  icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setTab('transactions')} active={tab === 'transactions'} />
              <SmartButton count={split.history.length}         label="History"       icon={<History className="h-3.5 w-3.5" />}       onClick={() => setTab('contracts')} />
              <SmartButton count={reviewIssuesCount}            label="Review"        icon={<AlertTriangle className="h-3.5 w-3.5" />} onClick={() => setTab('audit')}        active={tab === 'audit'} />
              <SmartButton count={activeInsurance}              label="Active ins."   icon={<ShieldCheck className="h-3.5 w-3.5" />}   onClick={() => setTab('insurance')} />
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6">
            <TabBar
              tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
              value={tab}
              onChange={(k) => setTab(k as TabKey)}
              ariaLabel="Employee profile sections"
            />
          </div>
        </header>

        {/* TAB CONTENT */}
        <div className="space-y-4">
          {tab === 'summary'      && <SummarySection split={split} insurance={insurance} documents={documents.length} transactions={transactions.length} dq={dataQuality} />}
          {tab === 'personal'     && <PersonalSection employee={e} redactedIdentity={redactedIdentity} />}
          {tab === 'job'          && <JobSection employee={e} currentEmployeeNumber={currentEmployeeNumber} />}
          {tab === 'contracts'    && <ContractsLifecycle split={split} />}
          {tab === 'insurance'    && <InsuranceSection rows={insurance} />}
          {tab === 'documents'    && <DocumentsSection rows={documents} />}
          {tab === 'transactions' && <TransactionsSection rows={transactions} />}
          {tab === 'payroll'      && <PayrollSection />}
          {tab === 'learning'     && <LearningSection />}
          {tab === 'audit'        && <AuditAndDataQualitySection audit={audit} dq={dataQuality} reviewCount={split.reviewRequired.length} canSee={canSeeDataQuality} />}
        </div>
      </div>

      {/* RIGHT CHATTER PANEL — real audit events, read-only composer */}
      <ChatterPanel audit={audit} isAdmin={isAdmin} />
    </div>
  );
}

// ============================================================
// Tab sections
// ============================================================

function SummarySection({
  split, insurance, documents, transactions, dq,
}: {
  split: ContractLifecycleSplit;
  insurance: Insurance[];
  documents: number;
  transactions: number;
  dq?: EmployeeDataQualityReport;
}) {
  const activeInsurance = insurance.filter((i) => i.status === 'active').length;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Lifecycle">
        <dl>
          <FormRow
            label="Current contract"
            value={
              split.current
                ? <>{split.current.contractType} <span className="font-mono text-muted-foreground text-[11px]">v{split.current.version}</span></>
                : <span className="text-muted-foreground">None active</span>
            }
            hint={split.current ? `${formatDate(split.current.startDate)} → ${formatDate(split.current.endDate)}` : 'No contract window covers today'}
          />
          <FormRow label="Future contracts" value={split.future.length} />
          <FormRow label="History"          value={split.history.length} hint="Expired / superseded — kept as record" />
          <FormRow
            label="Review required"
            value={
              split.reviewRequired.length > 0
                ? <Chip tone="expiring">{split.reviewRequired.length}</Chip>
                : <Chip tone="active">0</Chip>
            }
          />
        </dl>
      </Panel>
      <Panel title="On file">
        <dl>
          <FormRow
            label="Insurance"
            value={
              activeInsurance > 0
                ? <Chip tone="active">{activeInsurance} active</Chip>
                : <Chip tone="missing">None active</Chip>
            }
            hint={`${insurance.length} total on file`}
          />
          <FormRow label="Documents"    value={documents}    hint={documents > 0 ? 'On file' : 'None on file'} />
          <FormRow label="Transactions" value={transactions} hint={transactions > 0 ? 'Recorded' : 'None recorded'} />
          <FormRow
            label="Data quality"
            value={
              (dq?.issues.length ?? 0) > 0
                ? <Chip tone="expiring">{dq!.issues.length} {dq!.issues.length === 1 ? 'issue' : 'issues'}</Chip>
                : <Chip tone="active"><ShieldCheck className="h-3 w-3" />Clean</Chip>
            }
          />
        </dl>
      </Panel>
    </div>
  );
}

function PersonalSection({ employee: e, redactedIdentity }: { employee: Employee; redactedIdentity: string }) {
  return (
    <Panel title="Personal details">
      <dl>
        <FormRow label="Full name"     value={e.fullName || <span className="text-muted-foreground">—</span>} />
        <FormRow label="Arabic name"   value={e.fullNameArabic ? <span dir="rtl">{e.fullNameArabic}</span> : <span className="text-muted-foreground">—</span>} />
        <FormRow label="Iqama"         value={redactedIdentity} mono />
        <FormRow label="Nationality"   value={e.nationality || <span className="text-muted-foreground">—</span>} />
        <FormRow label="Date of birth" value={e.dateOfBirth ? formatDate(e.dateOfBirth) : <span className="text-muted-foreground">—</span>} />
        <FormRow
          label="Email"
          value={
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Not on file
            </span>
          }
        />
      </dl>
    </Panel>
  );
}

function JobSection({ employee: e, currentEmployeeNumber }: { employee: Employee; currentEmployeeNumber: string | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Position">
        <dl>
          <FormRow label="Department"   value={e.department ? <span className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{e.department}</span> : <span className="text-muted-foreground">—</span>} />
          <FormRow label="Job title"    value={e.jobTitle || <span className="text-muted-foreground">—</span>} />
          <FormRow label="Hire date"    value={e.hireDate ? formatDate(e.hireDate) : <span className="text-muted-foreground">—</span>} />
          <FormRow label="Status"       value={<Chip tone={e.status === 'active' ? 'active' : 'missing'}>{e.status}</Chip>} />
        </dl>
      </Panel>
      <Panel title="Employee number">
        <dl>
          <FormRow label="Current"      value={currentEmployeeNumber ? <span className="font-mono">{currentEmployeeNumber}</span> : <span className="text-muted-foreground">—</span>} />
          <FormRow label="Changes"      value={e.employeeNumberHistory.length} />
        </dl>
        {e.employeeNumberHistory.length > 0 && (
          <ul className="mt-3 divide-y border rounded">
            {e.employeeNumberHistory.map((h, i) => (
              <li key={`${h.number}-${h.from}-${i}`} className="px-3 py-2 flex items-center gap-3">
                <span className="text-[12px] font-mono">{h.number}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums flex-1">
                  {formatDate(h.from)} → {h.to ? formatDate(h.to) : 'present'}
                </span>
                {h.to === null && <Chip tone="active">Current</Chip>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ContractsLifecycle({ split }: { split: ContractLifecycleSplit }) {
  return (
    <div className="space-y-4">
      <ContractRowsPanel
        title="Current contract"
        icon={<CheckCircle2 className="h-4 w-4 text-status-active" />}
        tone="active"
        rows={split.current ? [split.current] : []}
        emptyTitle="No active contract"
        emptyHint="No contract window currently covers today. The history below shows superseded contracts."
      />
      <ContractRowsPanel
        title="Future contracts"
        icon={<Calendar className="h-4 w-4 text-status-info" />}
        tone="info"
        rows={split.future}
        emptyTitle="No upcoming contracts"
        emptyHint="Future contracts will appear here until their start date passes."
      />
      <ContractRowsPanel
        title="Contract history"
        icon={<History className="h-4 w-4 text-muted-foreground" />}
        tone="default"
        rows={split.history}
        emptyTitle="No history yet"
        emptyHint="Old / expired contracts are history records, not defects."
      />
      <ContractRowsPanel
        title="Review required"
        icon={<AlertTriangle className="h-4 w-4 text-status-expired" />}
        tone="expired"
        rows={split.reviewRequired}
        emptyTitle="No review items"
        emptyHint="All contracts on this profile have intact dates and a known template."
      />
    </div>
  );
}

function ContractRowsPanel({
  title, icon, tone, rows, emptyTitle, emptyHint,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'active' | 'info' | 'default' | 'expired';
  rows: Contract[];
  emptyTitle: string;
  emptyHint: string;
}) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
          <span className="text-muted-foreground tabular-nums normal-case font-normal">· {rows.length}</span>
        </span>
      }
      dense
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={Inbox} title={emptyTitle} description={emptyHint} />
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((c) => {
            const issueLabel = contractDataQualityLabel(c.dataQualityIssue);
            const informational = isInformationalDataQualityFlag(c.dataQualityIssue);
            return (
              <li key={c.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors duration-fast">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium flex items-center gap-2 flex-wrap">
                    {c.contractType || <span className="text-muted-foreground italic">no template</span>}
                    <span className="text-[11px] text-muted-foreground font-mono">v{c.version}</span>
                    {issueLabel && (
                      <Chip tone={informational ? 'info' : 'expired'}>{issueLabel}</Chip>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                    {formatDate(c.startDate)} → {formatDate(c.endDate)}
                    {' · '}
                    <span className="font-mono">{c.filename}</span>
                  </div>
                </div>
                <Chip tone={tone === 'expired' ? 'expired' : tone}>
                  {c.status}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function InsuranceSection({ rows }: { rows: Insurance[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="Medical insurance">
        <EmptyState
          icon={ShieldAlert}
          title="No medical insurance on file"
          description="Policies are imported from the Bupa CCHI export and linked by Iqama."
        />
      </Panel>
    );
  }
  return (
    <Panel title="Medical insurance" dense>
      <ul className="divide-y">
        {rows.map((i) => (
          <li key={i.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/30 transition-colors duration-fast">
            <HeartPulse className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{i.provider}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                Policy <span className="font-mono">{i.policyNumber}</span>
                {i.memberNumber ? <> · Member <span className="font-mono">{i.memberNumber}</span></> : null}
                {' · '}{formatDate(i.startDate)} → {i.endDate ? formatDate(i.endDate) : '—'}
              </div>
            </div>
            <Chip tone={i.status === 'active' ? 'active' : i.status === 'expired' ? 'expired' : 'missing'}>{i.status}</Chip>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DocumentsSection({ rows }: { rows: EmployeeDocument[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="Documents">
        <EmptyState
          icon={FolderOpen}
          title="No documents on file"
          description="Iqama, passport, visa, work permit, and insurance card uploads will appear here. Upload + manage flows ship in a later phase."
        />
      </Panel>
    );
  }
  return (
    <Panel title="Documents" dense>
      <ul className="divide-y">
        {rows.map((d) => {
          const status = d.computedStatus ?? d.status;
          return (
            <li key={d.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/30 transition-colors duration-fast">
              <FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium capitalize">{d.type.replace(/_/g, ' ')}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                  {d.docNumber ? <span className="font-mono">{d.docNumber}</span> : <span className="text-muted-foreground/70">no number</span>}
                  {d.expiresAt ? <> · expires {formatDate(d.expiresAt)}</> : null}
                </div>
              </div>
              <Chip
                tone={
                  status === 'active' ? 'active' :
                  status === 'expired' ? 'expired' :
                  status === 'review_required' ? 'review' :
                  'default'
                }
              >
                {status}
              </Chip>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function TransactionsSection({ rows }: { rows: EmployeeTransaction[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="Transactions">
        <EmptyState
          icon={ClipboardList}
          title="No HR transactions yet"
          description="Flight tickets, iqama renewals, vacation, salary adjustments, warnings, document requests, and training. Create + workflow ships in a later phase."
        />
      </Panel>
    );
  }
  return (
    <Panel title="Transactions" dense>
      <ul className="divide-y">
        {rows.map((t) => (
          <li key={t.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/30 transition-colors duration-fast">
            <ClipboardList className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t.title}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                <span className="capitalize">{t.type.replace(/_/g, ' ')}</span>
                {t.effectiveDate ? <> · {formatDate(t.effectiveDate)}</> : null}
                {t.endDate ? <> → {formatDate(t.endDate)}</> : null}
              </div>
            </div>
            <Chip
              tone={
                t.status === 'completed' || t.status === 'approved' ? 'active' :
                t.status === 'rejected' || t.status === 'cancelled' ? 'expired' :
                'info'
              }
            >
              {t.status}
            </Chip>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PayrollSection() {
  // Phase 7A: compensation is configured at the HR-config level but not yet
  // attached per employee. Honest empty state — no mock numbers.
  return (
    <Panel title="Payroll / Compensation">
      <EmptyState
        icon={Wallet}
        tone="info"
        title="Compensation not configured"
        description="Payroll components are seeded in HR config (basic, housing, transport, etc.), but per-employee compensation lines are not yet wired. This tab will populate once compensation entry ships."
      />
    </Panel>
  );
}

function LearningSection() {
  // Phase 7A: learning categories are configured but learning records are
  // not yet a wired entity. Honest empty state — no mock skills.
  return (
    <Panel title="Learning / Experience">
      <EmptyState
        icon={GraduationCap}
        tone="info"
        title="No learning records yet"
        description="Certifications, training, skills, and prior experience will appear here. Tracking ships in a later phase."
      />
    </Panel>
  );
}

const DATA_QUALITY_LABEL: Record<EmployeeDataQualityIssue, string> = {
  missing_date_of_birth:        'Date of birth missing',
  missing_nationality:          'Nationality missing',
  missing_hire_date:            'Hire date missing',
  no_current_employee_number:   'No current employee number',
  iqama_expiring_soon_30d:      'Iqama expiring within 30 days',
  iqama_expired:                'Iqama expired',
  passport_expiring_soon_180d:  'Passport expiring within 180 days',
  passport_expired:             'Passport expired',
  no_active_contract:           'No active contract',
  no_active_insurance:          'No active medical insurance',
  contract_with_quality_flag:   'A contract on this profile is flagged for review',
};

function AuditAndDataQualitySection({
  audit, dq, reviewCount, canSee,
}: {
  audit: AuditEvent[];
  dq?: EmployeeDataQualityReport;
  reviewCount: number;
  canSee: boolean;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Audit trail">
        {audit.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit events"
            description="Every mutation against this employee appears here — actor, action, target, status, and source."
          />
        ) : (
          <AuditTimeline events={audit.slice(0, 25)} />
        )}
      </Panel>
      <Panel title="Data quality">
        {!canSee ? (
          <EmptyState
            icon={Gauge}
            tone="info"
            title="Admin-visible only"
            description="Sign in with an admin or HR-manager role to see data-quality issues."
          />
        ) : (dq?.issues.length ?? 0) === 0 && reviewCount === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            tone="info"
            title="No data-quality issues"
            description="Identity, contracts, insurance, and documents look intact."
          />
        ) : (
          <ul className="divide-y">
            {(dq?.issues ?? []).map((kind, idx) => (
              <li key={`${kind}-${idx}`} className="py-2 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-status-expiring mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{DATA_QUALITY_LABEL[kind] ?? kind}</div>
                  <div className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">{kind}</div>
                </div>
              </li>
            ))}
            {reviewCount > 0 && (
              <li className="py-2 text-[12px] text-muted-foreground">
                {reviewCount} contract{reviewCount === 1 ? '' : 's'} flagged for review — see Contracts → Review Required.
              </li>
            )}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ============================================================
// Right chatter panel — REAL audit events, composer DISABLED
// ============================================================

function ChatterPanel({ audit, isAdmin }: { audit: AuditEvent[]; isAdmin: boolean }) {
  const [composer, setComposer] = React.useState<'message' | 'note' | 'activity'>('message');

  return (
    <aside className="border-l bg-card flex flex-col min-h-0 xl:sticky xl:top-0 xl:max-h-screen xl:overflow-hidden">
      <header className="px-4 py-3 border-b flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] flex-1">Activity</h3>
        <span className="text-[10.5px] text-muted-foreground tabular-nums">{audit.length}</span>
      </header>

      {/* Disabled composer — POST not wired yet */}
      <div className="px-4 pt-3 border-b">
        <div className="flex items-center gap-1 text-[12px]">
          {[
            { key: 'message',  label: 'Send Message', icon: MessageSquare },
            { key: 'note',     label: 'Log Note',     icon: PencilLine },
            { key: 'activity', label: 'Activity',     icon: Bell },
          ].map((t) => {
            const sel = composer === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setComposer(t.key as typeof composer)}
                aria-pressed={sel}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md font-medium',
                  'transition-[background-color,color,transform] duration-fast ease-out-quart',
                  'active:translate-y-[1px] active:duration-75',
                  sel ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div
          className="mt-3 mb-3 rounded-md border bg-muted/30 cursor-not-allowed"
          title={A52_TOOLTIP}
        >
          <textarea
            rows={2}
            disabled
            placeholder={`Compose a ${composer}… (write actions ship in a later phase)`}
            className="w-full bg-transparent text-[12.5px] px-3 py-2 resize-none focus:outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-1 px-2 py-1.5 border-t">
            <button disabled title={A52_TOOLTIP} className="h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground/60 cursor-not-allowed">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button disabled title={A52_TOOLTIP} className="h-7 w-7 rounded inline-flex items-center justify-center text-muted-foreground/60 cursor-not-allowed">
              <AtSign className="h-3.5 w-3.5" />
            </button>
            <div className="flex-1" />
            <AliveButton variant="primary" size="xs" disabled title={A52_TOOLTIP} icon={<Send className="h-3.5 w-3.5" />}>Send</AliveButton>
          </div>
        </div>
        <p className="text-[10.5px] text-muted-foreground mb-3">
          {isAdmin
            ? 'Composer is read-only — write endpoints land in a later phase.'
            : 'Only admins / HR managers can post here.'}
        </p>
      </div>

      {/* Real audit feed */}
      <ol className="flex-1 overflow-auto px-4 py-3 space-y-3 min-h-[300px]">
        {audit.length === 0 ? (
          <li className="text-[12px] text-muted-foreground text-center py-8">
            No activity yet. Every change to this employee will appear here.
          </li>
        ) : (
          audit.slice(0, 50).map((entry) => <ChatterEntry key={entry.id} entry={entry} />)
        )}
      </ol>
    </aside>
  );
}

function ChatterEntry({ entry }: { entry: AuditEvent }) {
  const actorInitials = (entry.actor ?? '')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  // Map status to a chip tone.
  const tone: 'active' | 'expiring' | 'expired' | 'info' =
    entry.status === 'ok'      ? 'active'   :
    entry.status === 'warning' ? 'expiring' :
    entry.status === 'error'   ? 'expired'  : 'info';

  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-primary/15 text-primary"
      >
        {actorInitials || <User className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12px] font-semibold truncate" title={entry.actor}>{entry.actor || 'system'}</span>
          <span className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">{entry.at.slice(0, 16).replace('T', ' ')}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <Chip tone={tone}>{entry.action}</Chip>
          {entry.status !== 'ok' && <Chip tone={tone}>{entry.status}</Chip>}
        </div>
        {entry.details && (
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground line-clamp-3">{entry.details}</p>
        )}
        <div className="mt-1 text-[10.5px] text-muted-foreground font-mono truncate" title={entry.target}>
          target: {entry.target}
        </div>
      </div>
    </li>
  );
}
