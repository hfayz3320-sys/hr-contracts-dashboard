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
  AlertTriangle, MessageSquare, PencilLine, Bell, Upload, Plus,
  ChevronRight, UserPlus, Eye, Download as DownloadIcon,
  Building2, BadgeCheck, History as HistoryIcon, Calendar, CheckCircle2,
  ScrollText, User, Gauge, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { openBlobInNewTab, saveBlobAs } from '@/lib/file-actions';
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
// Phase 10 — new entity types.
import type {
  EmployeeTimelineEntry, EmployeeActivity,
  EmployeeCompensationLine, EmployeeLearningRecord,
  AppUser,
} from '@shared/api-contract';

// Phase 11 — shape of the server-derived "current" payload.
interface CurrentCompensationView {
  currency: string;
  monthlyTotal: number;
  sourceContractId: string | null;
  lines: EmployeeCompensationLine[];
}

import { AliveButton } from '@/components/ui-foundation/AliveButton';
import { Chip } from '@/components/ui-foundation/Chip';
import { SmartButton } from '@/components/ui-foundation/SmartButton';
import { Panel } from '@/components/ui-foundation/Panel';
import { FormRow } from '@/components/ui-foundation/FormRow';
import { TabBar } from '@/components/ui-foundation/TabBar';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { AuditTimeline } from '@/components/common/AuditTimeline';
import { Link } from 'react-router-dom';
import { EmployeeActionsHost, type EmployeeActionKey } from './EmployeeActions';
import { canPerformAdminWrites } from '@/lib/auth';
import { useMe } from '@/lib/api/use-me';

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
  // Phase 10 — optional collections. Default to empty arrays for older
  // Worker responses that haven't been redeployed yet.
  timeline?: EmployeeTimelineEntry[];
  activities?: EmployeeActivity[];
  compensation?: EmployeeCompensationLine[];
  learning?: EmployeeLearningRecord[];
  /** The app_users row linked to this employee, or null. Pre-migration-0007
   *  workers don't return this — undefined is interpreted as "unknown". */
  linkedUser?: AppUser | null;
  /** Phase 11 — server-derived current contract (window covers today). */
  currentContract?: Contract | null;
  /** Phase 11 — server-derived current monthly compensation. */
  currentCompensation?: CurrentCompensationView | null;
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
    dataQuality, canSeeDataQuality, redactedIdentity,
  } = props;
  // isAdmin is kept on the prop interface for future use; it's not read
  // here because `canPerformAdminWrites(me)` is the authoritative check.
  void props.isAdmin;
  // Phase 10 — default to empty arrays so older worker responses don't crash.
  const timeline    = props.timeline    ?? [];
  const activities  = props.activities  ?? [];
  const compensation= props.compensation?? [];
  const learning    = props.learning    ?? [];

  const { data: me } = useMe();
  const canWrite = canPerformAdminWrites(me);
  // hr_manager is a read-only role for write actions by design (see
  // src/lib/auth.ts policy block + worker/src/lib/auth.ts requireAdmin).
  // The tooltip names the role so the message is actionable, not generic.
  const writeTooltip = canWrite
    ? undefined
    : me?.role === 'hr_manager'
      ? 'HR Manager role is read-only for Employee 360 writes. Ask an admin to mutate this employee.'
      : 'Only admin users can perform this action.';

  const [tab, setTab] = React.useState<TabKey>('summary');
  const [action, setAction] = React.useState<EmployeeActionKey>(null);

  const split = splitContractsByLifecycle(contracts);
  const currentEmployeeNumber = e.employeeNumberHistory.find((h) => h.to == null)?.number ?? null;
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

              {/* Phase 10 — linked-user chip when an app_users row already
                  points at this employee. Hide the Create user button so
                  we don't accidentally create a second login for the same
                  person; re-link / role change goes through /admin/users. */}
              {props.linkedUser ? (
                <Chip tone="info" icon={<UserPlus className="h-3 w-3" />}>
                  Login: {props.linkedUser.email} ({props.linkedUser.role})
                </Chip>
              ) : (
                <AliveButton variant="ghost" size="xs" disabled={!canWrite} title={writeTooltip} icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAction('create-user')}>Create user</AliveButton>
              )}
              <AliveButton variant="ghost" size="xs" disabled={!canWrite} title={writeTooltip} icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={() => setAction('message')}>Send message</AliveButton>
              <AliveButton variant="ghost" size="xs" disabled={!canWrite} title={writeTooltip} icon={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setAction('note')}>Log note</AliveButton>
              <AliveButton variant="ghost" size="xs" disabled={!canWrite} title={writeTooltip} icon={<Bell className="h-3.5 w-3.5" />} onClick={() => setAction('activity')}>Activity</AliveButton>
              <AliveButton variant="ghost"   size="xs" disabled={!canWrite} title={writeTooltip} icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setAction('document')}>Upload</AliveButton>
              <AliveButton variant="primary" size="xs" disabled={!canWrite} title={writeTooltip} icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAction('transaction')}>Transaction</AliveButton>
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
              {/* Phase 10 — real counts from new tables. */}
              <SmartButton count={activities.length}            label="Activities"    icon={<Bell className="h-3.5 w-3.5" />}          onClick={() => setTab('audit')} />
              <SmartButton count={compensation.length}          label="Compensation"  icon={<Wallet className="h-3.5 w-3.5" />}        onClick={() => setTab('payroll')}      active={tab === 'payroll'} />
              <SmartButton count={learning.length}              label="Learning"      icon={<GraduationCap className="h-3.5 w-3.5" />} onClick={() => setTab('learning')}     active={tab === 'learning'} />
              <SmartButton count={reviewIssuesCount}            label="Review"        icon={<AlertTriangle className="h-3.5 w-3.5" />} onClick={() => setTab('audit')}        active={tab === 'audit'} />
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
          {tab === 'summary'      && <SummarySection split={split} insurance={insurance} documents={documents.length} transactions={transactions.length} dq={dataQuality} currentContract={props.currentContract ?? split.current ?? null} currentCompensation={props.currentCompensation ?? null} />}
          {tab === 'personal'     && <PersonalSection employee={e} redactedIdentity={redactedIdentity} />}
          {tab === 'job'          && <JobSection employee={e} currentEmployeeNumber={currentEmployeeNumber} />}
          {tab === 'contracts'    && <ContractsLifecycle split={split} />}
          {tab === 'insurance'    && <InsuranceSection rows={insurance} />}
          {tab === 'documents'    && <DocumentsSection rows={documents} employeeId={e.id} />}
          {tab === 'transactions' && <TransactionsSection rows={transactions} />}
          {tab === 'payroll'      && <PayrollSection lines={compensation} contracts={contracts} canWrite={canWrite} onAdd={() => setAction('compensation')} />}
          {tab === 'learning'     && <LearningSection records={learning} canWrite={canWrite} onAdd={() => setAction('learning')} />}
          {tab === 'audit'        && <AuditAndDataQualitySection audit={audit} dq={dataQuality} reviewCount={split.reviewRequired.length} canSee={canSeeDataQuality} />}
        </div>
      </div>

      {/* RIGHT CHATTER PANEL — real audit + timeline + activities feed, with
          a working composer when the user can write. */}
      <ChatterPanel
        audit={audit}
        timeline={timeline}
        activities={activities}
        canWrite={canWrite}
        onCompose={(kind) => setAction(kind === 'message' ? 'message' : kind === 'note' ? 'note' : 'activity')}
      />

      {/* Phase 10 — modals for all 8 wired actions. */}
      <EmployeeActionsHost
        employeeId={e.id}
        employeeName={e.fullName || e.id}
        open={action}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

// ============================================================
// Tab sections
// ============================================================

function SummarySection({
  split, insurance, documents, transactions, dq, currentContract, currentCompensation,
}: {
  split: ContractLifecycleSplit;
  insurance: Insurance[];
  documents: number;
  transactions: number;
  dq?: EmployeeDataQualityReport;
  currentContract: Contract | null;
  currentCompensation: CurrentCompensationView | null;
}) {
  const activeInsurance = insurance.filter((i) => i.status === 'active').length;
  // Days to expiry — positive when in the future, negative when past.
  const daysToExpiry = currentContract && currentContract.endDate
    ? Math.round(
        (new Date(currentContract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Current contract">
        <dl>
          <FormRow
            label="Type & version"
            value={
              currentContract
                ? <>{currentContract.contractType} <span className="font-mono text-muted-foreground text-[11px]">v{currentContract.version}</span></>
                : <span className="text-muted-foreground">None active</span>
            }
            hint={currentContract ? `${formatDate(currentContract.startDate)} → ${formatDate(currentContract.endDate)}` : 'No contract window covers today'}
          />
          {currentContract ? (
            <FormRow
              label="Days to expiry"
              value={
                daysToExpiry == null
                  ? <span className="text-muted-foreground">—</span>
                  : daysToExpiry < 0
                    ? <Chip tone="expired">{Math.abs(daysToExpiry)} day(s) past</Chip>
                    : daysToExpiry <= 30
                      ? <Chip tone="expiring">{daysToExpiry} days</Chip>
                      : <Chip tone="active">{daysToExpiry} days</Chip>
              }
            />
          ) : null}
          <FormRow
            label="Basic salary"
            value={
              currentContract?.basicSalary != null
                ? <span className="tabular-nums font-medium">{currentContract.basicSalary.toLocaleString()} {currentContract.currency ?? 'SAR'}</span>
                : <span className="text-muted-foreground">—</span>
            }
          />
          <FormRow
            label="Monthly package"
            value={
              currentCompensation && currentCompensation.monthlyTotal > 0
                ? <span className="tabular-nums font-semibold">{currentCompensation.monthlyTotal.toLocaleString()} {currentCompensation.currency}</span>
                : currentContract?.totalSalary != null
                  ? <span className="tabular-nums font-semibold">{currentContract.totalSalary.toLocaleString()} {currentContract.currency ?? 'SAR'}</span>
                  : <span className="text-muted-foreground">—</span>
            }
            hint={
              currentCompensation && currentCompensation.lines.length > 0
                ? `${currentCompensation.lines.length} component${currentCompensation.lines.length === 1 ? '' : 's'} from current contract`
                : undefined
            }
          />
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
        icon={<HistoryIcon className="h-4 w-4 text-muted-foreground" />}
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
                {i.memberName ? <> · Name <span>{i.memberName}</span></> : null}
                {i.planClass ? <> · Class <span>{i.planClass}</span></> : null}
                {i.nationality ? <> · Nationality <span>{i.nationality}</span></> : null}
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

function DocumentsSection({ rows, employeeId }: { rows: EmployeeDocument[]; employeeId: string }) {
  if (rows.length === 0) {
    return (
      <Panel title="Documents">
        <EmptyState
          icon={FolderOpen}
          title="No documents on file"
          description="Iqama, passport, visa, work permit, and insurance card uploads will appear here. Use the Upload button in the profile toolbar to add one."
        />
      </Panel>
    );
  }
  return (
    <Panel title="Documents" dense>
      <ul className="divide-y">
        {rows.map((d) => {
          const status = d.computedStatus ?? d.status;
          // A row is downloadable iff its metadata carries an R2 object key
          // (set by the Upload modal). Metadata-only rows registered by
          // earlier admin flows have no file and surface as "no file".
          const hasFile = typeof d.metadata?.['r2ObjectKey'] === 'string';
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
              <DocumentFileActions employeeId={employeeId} docId={d.id} hasFile={hasFile} />
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

function DocumentFileActions({
  employeeId, docId, hasFile,
}: {
  employeeId: string;
  docId: string;
  hasFile: boolean;
}) {
  const [busy, setBusy] = React.useState<'view' | 'download' | null>(null);
  if (!hasFile) {
    return (
      <span className="text-[10.5px] text-muted-foreground italic mr-2 self-center" title="No file uploaded — metadata only">
        no file
      </span>
    );
  }
  async function run(kind: 'view' | 'download') {
    if (busy) return;
    setBusy(kind);
    try {
      const blob = await api.fetchEmployeeDocumentFile(employeeId, docId, {
        download: kind === 'download',
      });
      // Filename for save-as: server set Content-Disposition with the
      // original name; the blob itself doesn't carry it, so we use a
      // generic fallback. The browser respects the server header for
      // direct downloads anyway; this path is only when we open as blob.
      if (kind === 'view') openBlobInNewTab(blob);
      else saveBlobAs(blob, `document-${docId}.bin`);
    } catch (err) {
      toast.error(kind === 'view' ? 'Could not open file' : 'Could not download', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex items-center gap-1 mr-1">
      <AliveButton
        variant="ghost"
        size="xs"
        icon={<Eye className="h-3.5 w-3.5" />}
        onClick={() => run('view')}
        disabled={busy !== null}
        title="View in new tab"
      >
        {busy === 'view' ? '…' : 'View'}
      </AliveButton>
      <AliveButton
        variant="ghost"
        size="xs"
        icon={<DownloadIcon className="h-3.5 w-3.5" />}
        onClick={() => run('download')}
        disabled={busy !== null}
        title="Download"
      >
        {busy === 'download' ? '…' : 'Download'}
      </AliveButton>
    </div>
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

/**
 * Phase 11 — Compensation panel.
 *
 * Splits the raw `employee_compensation_lines` into four bands:
 *   - Basic           (component_code === 'PAY_BASIC')
 *   - Housing         (PAY_HOUSING)
 *   - Transportation  (PAY_TRANSPORT)
 *   - Other           (everything else; food / role / one-off / etc.)
 *
 * Filters out lines whose effective window is fully in the past so the
 * "Current" view doesn't pollute with retired components. Old comp lines
 * are NOT deleted — they live in the contract history; the panel just
 * doesn't display them here.
 *
 * Each line carries its `sourceContractId` set by the commit pipeline.
 * We resolve the contract version from the `contracts` array passed in
 * (the same one the Contracts tab uses) so the row label can read
 * "Basic salary · from contract v3 (PERMANENT)".
 */
function PayrollSection({
  lines, contracts, canWrite, onAdd,
}: {
  lines: EmployeeCompensationLine[];
  contracts: Contract[];
  canWrite: boolean;
  onAdd: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // "Current" = monthly lines whose effective window covers today (or has
  // no end date yet). Yearly / one-time lines are shown separately.
  const current = lines.filter((l) => {
    if (l.effectiveFrom > today) return false;
    if (l.effectiveTo && l.effectiveTo < today) return false;
    return true;
  });

  // Index contracts by id so we can resolve `sourceContractId -> v{n}`.
  const contractById = new Map(contracts.map((c) => [c.id, c]));

  function band(line: EmployeeCompensationLine): 'basic' | 'housing' | 'transport' | 'other' {
    switch (line.componentCode) {
      case 'PAY_BASIC':     return 'basic';
      case 'PAY_HOUSING':   return 'housing';
      case 'PAY_TRANSPORT': return 'transport';
      default:              return 'other';
    }
  }

  const grouped = {
    basic:     current.filter((l) => band(l) === 'basic'),
    housing:   current.filter((l) => band(l) === 'housing'),
    transport: current.filter((l) => band(l) === 'transport'),
    other:     current.filter((l) => band(l) === 'other'),
  };
  // Sum only monthly lines; yearly/one_time shown but excluded from the
  // running monthly subtotal so the "Monthly package" isn't misleading.
  const monthlyTotal = current
    .filter((l) => l.frequency === 'monthly')
    .reduce((s, l) => s + l.amount, 0);
  const annualTotal  = monthlyTotal * 12 + current
    .filter((l) => l.frequency === 'yearly')
    .reduce((s, l) => s + l.amount, 0);
  const currency = current[0]?.currency ?? 'SAR';

  if (current.length === 0) {
    return (
      <Panel
        title="Compensation"
        action={
          canWrite ? (
            <AliveButton variant="primary" size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
              Add line
            </AliveButton>
          ) : undefined
        }
      >
        <EmptyState
          icon={Wallet}
          tone="info"
          title="No active compensation lines"
          description={canWrite
            ? 'Import a contract or add a line manually. Contract imports populate basic / housing / transport automatically.'
            : 'Admin can add components from the profile actions.'}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Compensation"
      action={
        canWrite ? (
          <AliveButton variant="primary" size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
            Add line
          </AliveButton>
        ) : undefined
      }
    >
      {/* Totals strip — currency stays explicit so the user knows what
          we're summing; mixed-currency rows would show the first one's
          currency but we don't combine across currencies anywhere. */}
      <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
        <TotalsTile label="Monthly total"  value={monthlyTotal} currency={currency} emphasis />
        <TotalsTile label="Annualized"     value={annualTotal}  currency={currency} />
        <TotalsTile label="Components"     value={current.length} currency={null} />
        <TotalsTile label="As of"          value={today}        currency={null} />
      </div>

      <CompBand title="Basic salary"            tone="active"  lines={grouped.basic}     contractById={contractById} />
      <CompBand title="Housing allowance"       tone="info"    lines={grouped.housing}   contractById={contractById} />
      <CompBand title="Transportation"          tone="info"    lines={grouped.transport} contractById={contractById} />
      <CompBand title="Other allowances"        tone="default" lines={grouped.other}     contractById={contractById} />
    </Panel>
  );
}

function TotalsTile({
  label, value, currency, emphasis,
}: {
  label: string;
  value: number | string;
  currency: string | null;
  emphasis?: boolean;
}) {
  const display = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <div className={cn(
      'rounded-md border px-3 py-2',
      emphasis ? 'bg-primary/5 border-primary/20' : 'bg-muted/30',
    )}>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn('mt-0.5 tabular-nums', emphasis ? 'text-[16px] font-semibold' : 'text-[13px] font-medium')}>
        {display}{currency ? <span className="ml-1 text-[10.5px] text-muted-foreground font-normal">{currency}</span> : null}
      </div>
    </div>
  );
}

function CompBand({
  title, tone, lines, contractById,
}: {
  title: string;
  tone: 'active' | 'info' | 'default';
  lines: EmployeeCompensationLine[];
  contractById: Map<string, Contract>;
}) {
  if (lines.length === 0) {
    return (
      <div className="mb-3 last:mb-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
          {title}
        </div>
        <div className="text-[12px] text-muted-foreground italic">Not configured</div>
      </div>
    );
  }
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {title}
        </div>
        <Chip tone={tone}>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</Chip>
      </div>
      <ul className="border rounded-md divide-y">
        {lines.map((l) => {
          // `sourceContractId` lives on the line when the import commit
          // pipeline wrote it. The Contract.version + Contract.contractType
          // come from the contracts array passed in by the page.
          const src = l.sourceContractId ? contractById.get(l.sourceContractId) : null;
          return (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors duration-fast">
              <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{l.componentName}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  <span className="font-mono">{l.componentCode}</span>
                  {' · effective '}{formatDate(l.effectiveFrom)}
                  {l.effectiveTo ? ` → ${formatDate(l.effectiveTo)}` : ' → open'}
                  {src ? (
                    <>
                      {' · '}
                      <span className="font-medium text-foreground/70">
                        contract <span className="font-mono">v{src.version}</span> ({src.contractType})
                      </span>
                    </>
                  ) : l.source === 'manual' ? (
                    <> · <span className="text-muted-foreground/80">manual entry</span></>
                  ) : null}
                  {l.notes ? <> · <span className="italic">{l.notes}</span></> : null}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-[13px] font-semibold">
                  {l.amount.toLocaleString()} <span className="text-[10.5px] text-muted-foreground font-normal">{l.currency}</span>
                </div>
                <div className="text-[10.5px] text-muted-foreground uppercase tracking-wide">
                  {l.frequency.replace('_', ' ')}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LearningSection({ records, canWrite, onAdd }: { records: EmployeeLearningRecord[]; canWrite: boolean; onAdd: () => void }) {
  return (
    <Panel
      title="Learning / Experience"
      action={
        canWrite ? (
          <AliveButton variant="primary" size="xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
            Add record
          </AliveButton>
        ) : undefined
      }
    >
      {records.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          tone="info"
          title="No learning records yet"
          description={canWrite
            ? 'Add a certification, training, skill, or prior experience entry.'
            : 'Admin can add learning records from the profile actions.'}
        />
      ) : (
        <ul className="divide-y">
          {records.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <GraduationCap className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{r.title}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  <span className="capitalize">{r.recordType}</span>
                  {r.provider ? ` · ${r.provider}` : ''}
                  {r.issueDate ? ` · since ${r.issueDate}` : ''}
                  {r.expiryDate ? ` → ${r.expiryDate}` : ''}
                </div>
              </div>
              <Chip
                tone={r.status === 'active' ? 'active' : r.status === 'expiring' ? 'expiring' : r.status === 'expired' ? 'expired' : 'default'}
              >
                {r.status}
              </Chip>
            </li>
          ))}
        </ul>
      )}
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

function ChatterPanel({
  audit, timeline, activities, canWrite, onCompose,
}: {
  audit: AuditEvent[];
  timeline: EmployeeTimelineEntry[];
  activities: EmployeeActivity[];
  canWrite: boolean;
  onCompose: (kind: 'message' | 'note' | 'activity') => void;
}) {
  // Phase 10 — merge real audit + timeline + activities into a single feed,
  // newest first. Each kind has its own visual style but shares the layout.
  //
  // Dedupe rule: every successful write here ALSO writes an audit_events row
  // (so the immutable audit trail stays complete). We must NOT render the
  // audit copy if the underlying row is already represented as a dedicated
  // feed item, otherwise the user sees the same note twice — once as
  // `employee.note` from the audit feed and once as the timeline-entry
  // card. The set below names every audit action whose dedicated tile is
  // already in this feed; everything else falls through and renders as a
  // plain audit row (so contract.patch, employee_document.uploaded, etc.
  // remain visible — they have no dedicated tile here).
  const FEED_DUPLICATE_AUDIT_ACTIONS = new Set<string>([
    'employee.message',         // covered by timeline (entryType='message')
    'employee.note',            // covered by timeline (entryType='note')
    'employee.activity_create', // covered by activities row
    'employee.activity_update', // shown by the activities row's status
  ]);
  type FeedItem =
    | { kind: 'audit';    at: string; row: AuditEvent }
    | { kind: 'message';  at: string; row: EmployeeTimelineEntry }
    | { kind: 'note';     at: string; row: EmployeeTimelineEntry }
    | { kind: 'activity'; at: string; row: EmployeeActivity };
  const feed: FeedItem[] = [];
  for (const a of audit) {
    if (FEED_DUPLICATE_AUDIT_ACTIONS.has(a.action)) continue;
    feed.push({ kind: 'audit', at: a.at, row: a });
  }
  for (const t of timeline) feed.push({ kind: t.entryType, at: t.createdAt, row: t });
  for (const a of activities) feed.push({ kind: 'activity', at: a.createdAt, row: a });
  feed.sort((a, b) => b.at.localeCompare(a.at));
  const total = feed.length;

  const writeTooltip = canWrite ? undefined : 'Only admin users can post here.';

  return (
    <aside className="border-l bg-card flex flex-col min-h-0 xl:sticky xl:top-0 xl:max-h-screen xl:overflow-hidden">
      <header className="px-4 py-3 border-b flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] flex-1">Activity</h3>
        <span className="text-[10.5px] text-muted-foreground tabular-nums">{total}</span>
      </header>

      {/* Composer triggers — open the matching modal on click. */}
      <div className="px-4 pt-3 pb-3 border-b">
        <div className="flex items-center gap-1 text-[12px]">
          <AliveButton
            variant="secondary"
            size="xs"
            disabled={!canWrite}
            title={writeTooltip}
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            onClick={() => onCompose('message')}
          >
            Send Message
          </AliveButton>
          <AliveButton
            variant="secondary"
            size="xs"
            disabled={!canWrite}
            title={writeTooltip}
            icon={<PencilLine className="h-3.5 w-3.5" />}
            onClick={() => onCompose('note')}
          >
            Log Note
          </AliveButton>
          <AliveButton
            variant="secondary"
            size="xs"
            disabled={!canWrite}
            title={writeTooltip}
            icon={<Bell className="h-3.5 w-3.5" />}
            onClick={() => onCompose('activity')}
          >
            Activity
          </AliveButton>
        </div>
        {!canWrite && (
          <p className="mt-2 text-[10.5px] text-muted-foreground">
            Only admin users can post here.
          </p>
        )}
      </div>

      {/* Real merged feed: audit + timeline + activities, newest first. */}
      <ol className="flex-1 overflow-auto px-4 py-3 space-y-3 min-h-[300px]">
        {total === 0 ? (
          <li className="text-[12px] text-muted-foreground text-center py-8">
            No activity yet. Every change, message, note, and scheduled task appears here.
          </li>
        ) : (
          feed.slice(0, 50).map((item) => <FeedRow key={`${item.kind}-${item.row.id}`} item={item} />)
        )}
      </ol>
    </aside>
  );
}

function FeedRow({ item }: { item:
  | { kind: 'audit';    at: string; row: AuditEvent }
  | { kind: 'message';  at: string; row: EmployeeTimelineEntry }
  | { kind: 'note';     at: string; row: EmployeeTimelineEntry }
  | { kind: 'activity'; at: string; row: EmployeeActivity } }) {
  if (item.kind === 'audit') return <ChatterEntry entry={item.row} />;
  if (item.kind === 'activity') {
    return (
      <li className="flex items-start gap-3">
        <span aria-hidden="true" className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-status-info-soft text-[hsl(var(--status-info))]">
          <Bell className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[12px] font-semibold truncate">{item.row.createdBy}</span>
            <span className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">{item.at.slice(0, 16).replace('T', ' ')}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Chip tone={item.row.status === 'done' ? 'active' : item.row.status === 'cancelled' ? 'expired' : 'info'}>
              {item.row.activityType.replace('_', ' ')} · {item.row.status}
            </Chip>
            {item.row.dueDate && <Chip tone="default">due {item.row.dueDate}</Chip>}
          </div>
          <p className="mt-1 text-[12.5px] leading-snug">{item.row.title}</p>
          {item.row.description && (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground line-clamp-3">{item.row.description}</p>
          )}
        </div>
      </li>
    );
  }
  // message / note
  const isNote = item.kind === 'note';
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
        isNote ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
      )}>
        {isNote ? <PencilLine className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12px] font-semibold truncate">{item.row.createdBy}</span>
          <span className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">{item.at.slice(0, 16).replace('T', ' ')}</span>
        </div>
        <div className="mt-1">
          <Chip tone={isNote ? 'default' : 'info'}>{isNote ? 'note' : 'message'}</Chip>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug whitespace-pre-wrap">{item.row.body}</p>
      </div>
    </li>
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
