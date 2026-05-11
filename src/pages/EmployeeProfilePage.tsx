/**
 * EmployeeProfilePage — A5.1: live data binding.
 *
 * Source: `GET /api/employees/:id` via `useEmployee360(id)`. Returns
 * employee + contracts + insurance + audit + documents + transactions +
 * dataQuality. A5.0 shipped the layout shell; A5.1 wires the real data.
 *
 * Hard rules (see `memory/contract_lifecycle_rule.md`):
 *   - Old / expired / long / short contracts are HISTORY, not defects.
 *   - Only end<start / missing dates / unknown template / unmatched are
 *     review flags. The Contract tab partitions into:
 *       Current · Future · History · Review Required.
 *
 * Honest empty states everywhere:
 *   - No fake data, no fake counts.
 *   - When a list is empty the EmptyState says exactly why.
 *   - Identity (Iqama) is shown verbatim only to admins; redacted otherwise.
 *
 * Edit / write actions stay disabled in A5.1; A5.2 adds the patch flows
 * (Edit profile, transactions create, document upload). Tooltips on every
 * disabled control state the gating phase.
 */
import { useParams } from 'react-router-dom';
import {
  FileText,
  HeartPulse,
  FolderOpen,
  ClipboardList,
  ScrollText,
  AlertTriangle,
  User,
  Gauge,
  Pencil,
  Upload,
  MoreHorizontal,
  Calendar,
  Mail,
  IdCard,
  Sparkles,
  ArrowUpRight,
  History,
  Inbox,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-foundation/PageHeader';
import { ProfileHeader, type ProfileHeaderChip } from '@/components/ui-foundation/ProfileHeader';
import {
  AnimatedTabs,
  TabList,
  Tab,
  TabPanel,
} from '@/components/ui-foundation/AnimatedTabs';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { PressableButton } from '@/components/ui-foundation/PressableButton';
import { ActionMenu } from '@/components/ui-foundation/ActionMenu';
import { ApiErrorState } from '@/components/common/ApiErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { AuditTimeline } from '@/components/common/AuditTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmployee360 } from '@/lib/api/hooks';
import { useMe } from '@/lib/api/use-me';
import { formatDate } from '@/lib/dates';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import {
  splitContractsByLifecycle,
  contractDataQualityLabel,
  isInformationalDataQualityFlag,
} from '@/lib/contract-lifecycle';
import type { Contract, Insurance, AuditEvent, EmployeeDataQualityIssue } from '@shared/domain';

const TABS = [
  { key: 'summary',     label: 'Summary' },
  { key: 'personal',    label: 'Personal Info' },
  { key: 'job',         label: 'Job Info' },
  { key: 'contracts',   label: 'Contracts' },
  { key: 'insurance',   label: 'Medical Insurance' },
  { key: 'documents',   label: 'Documents' },
  { key: 'transactions',label: 'Transactions' },
  { key: 'audit',       label: 'Audit Trail' },
  { key: 'dataQuality', label: 'Data Quality' },
] as const;

const A52_TOOLTIP = 'Editing lands in A5.2';

function initialsFromName(name: string | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts[1]?.charAt(0) ?? '';
  const initials = (first + second).toUpperCase();
  return initials || '—';
}

function redactIdentity(iqama: string | undefined, isAdmin: boolean): string {
  if (!iqama) return '—';
  if (isAdmin) return iqama;
  if (iqama.length < 4) return '••••';
  return `${iqama.slice(0, 2)}••••${iqama.slice(-2)}`;
}

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const safeId = id ?? 'unknown';
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const query = useEmployee360(id ?? null);

  // ------ Loading state — skeleton that matches the real layout ----------
  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employee profile" breadcrumb={[{ label: 'Employees', to: routes.employees }, { label: safeId }]} />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-5">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-96" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ------ 404 — employee not found ---------------------------------------
  const error = query.error as (Error & { status?: number }) | null;
  if (error && error.status === 404) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <PageHeader title="Employee profile" breadcrumb={[{ label: 'Employees', to: routes.employees }, { label: safeId }]} />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={User}
              tone="info"
              title="Employee not found"
              description={
                <>
                  No employee exists with id <span className="font-mono text-foreground/80">{safeId}</span>.
                  It may have been removed, or the URL was typed incorrectly.
                </>
              }
              action={
                <PressableButton asChild variant="outline">
                  <a href={routes.employees}>Back to Employees</a>
                </PressableButton>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ------ Other errors — designed ApiErrorState --------------------------
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employee profile" breadcrumb={[{ label: 'Employees', to: routes.employees }, { label: safeId }]} />
        <ApiErrorState
          title="Cannot load this employee"
          error={error}
          onRetry={async () => { await query.refetch(); }}
        />
      </div>
    );
  }

  // ------ Happy path — bind real data ------------------------------------
  const data = query.data!;
  const e = data.employee;
  const contracts = data.contracts;
  const insurance = data.insurance;
  const audit = data.audit;
  const documents = data.documents;
  const transactions = data.transactions;
  const dq = data.dataQuality;

  const currentEmployeeNumber =
    e.employeeNumberHistory.find((h) => h.to == null)?.number ?? null;
  const split = splitContractsByLifecycle(contracts);

  // Header chips — status, dept, current employee number, review count.
  const chips: ProfileHeaderChip[] = [];
  chips.push({
    key: 'status',
    label: e.status === 'active' ? 'Active' : 'Inactive',
    tone: e.status === 'active' ? 'active' : 'missing',
  });
  if (e.department) chips.push({ key: 'dept', label: e.department, tone: 'default' });
  if (currentEmployeeNumber) {
    chips.push({ key: 'empno', label: <>Emp # {currentEmployeeNumber}</>, tone: 'info' });
  }
  if (dq && dq.issues.length > 0) {
    chips.push({
      key: 'review',
      label: `${dq.issues.length} review issue${dq.issues.length === 1 ? '' : 's'}`,
      tone: 'expiring',
    });
  }

  const headerActions = (
    <>
      <PressableButton
        variant="outline"
        size="sm"
        disabled
        tooltip={A52_TOOLTIP}
        aria-label="Edit employee (disabled until A5.2)"
      >
        <Pencil className="h-4 w-4" />
        Edit
      </PressableButton>
      <ActionMenu
        ariaLabel="More employee actions"
        variant="outline"
        size="icon"
        disabled
        title={A52_TOOLTIP}
        items={[{ key: 'placeholder', label: A52_TOOLTIP, disabled: true }]}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee profile"
        breadcrumb={[
          { label: 'Employees', to: routes.employees },
          { label: e.fullName || safeId },
        ]}
      />

      <ProfileHeader
        initials={initialsFromName(e.fullName)}
        name={e.fullName || <span className="font-mono text-lg align-middle">—</span>}
        subtitle={
          <>
            {e.fullNameArabic ? <span className="block">{e.fullNameArabic}</span> : null}
            {e.jobTitle ? <span>{e.jobTitle}</span> : null}
          </>
        }
        meta={
          <>
            <span>Iqama: <span className="text-foreground/80">{redactIdentity(e.identityNumber, isAdmin)}</span></span>
            <span className="text-muted-foreground/60"> · </span>
            <span>ID: <span className="text-foreground/80">{e.id}</span></span>
          </>
        }
        chips={chips}
        actions={headerActions}
      />

      <AnimatedTabs urlKey="tab" defaultValue="summary">
        <TabList aria-label="Employee profile sections">
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key}>
              {t.label}
            </Tab>
          ))}
        </TabList>

        {/* ----- Summary ----- */}
        <TabPanel value="summary">
          <SummaryTab
            current={split.current}
            futureCount={split.future.length}
            historyCount={split.history.length}
            reviewCount={split.reviewRequired.length}
            insurance={insurance}
            transactions={transactions.length}
            documents={documents.length}
            dataQualityIssues={dq?.issues.length ?? 0}
          />
        </TabPanel>

        {/* ----- Personal Info ----- */}
        <TabPanel value="personal">
          <PersonalInfoTab
            fullName={e.fullName}
            fullNameArabic={e.fullNameArabic}
            identityNumber={redactIdentity(e.identityNumber, isAdmin)}
            nationality={e.nationality}
            dateOfBirth={e.dateOfBirth}
          />
        </TabPanel>

        {/* ----- Job Info ----- */}
        <TabPanel value="job">
          <JobInfoTab
            employeeNumber={currentEmployeeNumber}
            history={e.employeeNumberHistory}
            department={e.department}
            jobTitle={e.jobTitle}
            hireDate={e.hireDate}
            status={e.status}
          />
        </TabPanel>

        {/* ----- Contracts (4 lifecycle sections) ----- */}
        <TabPanel value="contracts">
          <ContractsTab split={split} />
        </TabPanel>

        {/* ----- Medical Insurance ----- */}
        <TabPanel value="insurance">
          <InsuranceTab rows={insurance} />
        </TabPanel>

        {/* ----- Documents (empty until A5.2 + write flows) ----- */}
        <TabPanel value="documents">
          {documents.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="No documents on file"
              description="Iqama, passport, visa, work permit, and insurance card uploads will appear here. Upload + manage flows ship in A5.2."
              action={
                <PressableButton variant="outline" size="sm" disabled tooltip={A52_TOOLTIP}>
                  <Upload className="h-4 w-4" />
                  Add document
                </PressableButton>
              }
            />
          ) : (
            <DocumentsList rows={documents} />
          )}
        </TabPanel>

        {/* ----- Transactions (empty until A5.2 + write flows) ----- */}
        <TabPanel value="transactions">
          {transactions.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No HR transactions yet"
              description="Flight tickets, iqama renewals, vacation, salary adjustments, warnings, document requests, and training. Create + workflow ships in A5.2."
              action={
                <PressableButton variant="outline" size="sm" disabled tooltip={A52_TOOLTIP}>
                  <MoreHorizontal className="h-4 w-4" />
                  New transaction
                </PressableButton>
              }
            />
          ) : (
            <TransactionsList rows={transactions} />
          )}
        </TabPanel>

        {/* ----- Audit Trail ----- */}
        <TabPanel value="audit">
          <AuditTab rows={audit} />
        </TabPanel>

        {/* ----- Data Quality ----- */}
        <TabPanel value="dataQuality">
          <DataQualityTab
            issues={dq?.issues ?? []}
            isAdminVisible={isAdmin || me?.role === 'hr_manager'}
            reviewCount={split.reviewRequired.length}
          />
        </TabPanel>
      </AnimatedTabs>

      {/* A5.2 forward-looking disclosure — informational, not blocking. */}
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-status-info/20 bg-status-info-soft/60 p-4 text-[13px] text-foreground"
      >
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-status-info" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">A5.1 binds Employee 360 read-only</div>
          <p className="mt-0.5 text-muted-foreground leading-relaxed">
            Live data is now wired through{' '}
            <span className="font-mono text-[12px] text-foreground/80">GET /api/employees/:id</span>.
            Edit, add document, and new transaction land in A5.2.
          </p>
          <a
            href="https://hr-contracts-api-v2-production.hfayz3320.workers.dev/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-status-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Check worker health <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Per-tab components — small + co-located to keep the page readable.
// ===========================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm break-words">{children || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'active' | 'expiring' | 'expired' | 'info';
}) {
  const TONE = {
    default:  'ring-border',
    active:   'ring-status-active/20',
    expiring: 'ring-status-expiring/20',
    expired:  'ring-status-expired/20',
    info:     'ring-status-info/20',
  };
  return (
    <Card className={cn('ring-1 ring-inset', TONE[tone])}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{label}</div>
        <div className="mt-2 text-[22px] font-semibold tabular leading-none tracking-tight">{value}</div>
        {hint && <div className="mt-2 text-[11px] text-muted-foreground leading-tight">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function SummaryTab({
  current,
  futureCount,
  historyCount,
  reviewCount,
  insurance,
  transactions,
  documents,
  dataQualityIssues,
}: {
  current: Contract | null;
  futureCount: number;
  historyCount: number;
  reviewCount: number;
  insurance: Insurance[];
  transactions: number;
  documents: number;
  dataQualityIssues: number;
}) {
  const activeInsurance = insurance.filter((i) => i.status === 'active').length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat
          label="Current Contract"
          value={current ? 'Active' : '—'}
          hint={current ? `${formatDate(current.startDate)} → ${formatDate(current.endDate)}` : 'No active contract'}
          tone={current ? 'active' : 'expired'}
        />
        <SummaryStat
          label="Contract History"
          value={historyCount}
          hint={`${futureCount} future, ${reviewCount} need review`}
          tone="info"
        />
        <SummaryStat
          label="Active Insurance"
          value={activeInsurance}
          hint={`${insurance.length} total`}
          tone={activeInsurance > 0 ? 'active' : 'expired'}
        />
        <SummaryStat
          label="Review Issues"
          value={dataQualityIssues}
          hint={dataQualityIssues > 0 ? 'Needs attention' : 'All clear'}
          tone={dataQualityIssues > 0 ? 'expiring' : 'active'}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat label="Transactions" value={transactions} hint={transactions > 0 ? 'Recorded' : 'None yet'} tone="default" />
        <SummaryStat label="Documents" value={documents} hint={documents > 0 ? 'On file' : 'None yet'} tone="default" />
        <SummaryStat label="Future Contracts" value={futureCount} hint={futureCount > 0 ? 'Scheduled' : 'None'} tone={futureCount > 0 ? 'info' : 'default'} />
        <SummaryStat label="Review Required (contracts)" value={reviewCount} hint={reviewCount > 0 ? 'Needs triage' : 'Clean'} tone={reviewCount > 0 ? 'expiring' : 'active'} />
      </div>
    </div>
  );
}

function PersonalInfoTab({
  fullName,
  fullNameArabic,
  identityNumber,
  nationality,
  dateOfBirth,
}: {
  fullName: string | undefined;
  fullNameArabic?: string;
  identityNumber: string;
  nationality?: string;
  dateOfBirth?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        <Field label="Full name (English)">{fullName}</Field>
        <Field label="Full name (Arabic)">{fullNameArabic}</Field>
        <Field label="Iqama / Identity">
          <span className="inline-flex items-center gap-1.5 font-mono">
            <IdCard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {identityNumber}
          </span>
        </Field>
        <Field label="Nationality">{nationality}</Field>
        <Field label="Date of birth">{formatDate(dateOfBirth)}</Field>
        <Field label="Email">
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            Not on file — wired in A5.2
          </span>
        </Field>
      </CardContent>
    </Card>
  );
}

function JobInfoTab({
  employeeNumber,
  history,
  department,
  jobTitle,
  hireDate,
  status,
}: {
  employeeNumber: string | null;
  history: { number: string; from: string; to: string | null }[];
  department?: string;
  jobTitle?: string;
  hireDate?: string;
  status: 'active' | 'inactive';
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          <Field label="Department">{department}</Field>
          <Field label="Job title">{jobTitle}</Field>
          <Field label="Hire date">{formatDate(hireDate)}</Field>
          <Field label="Status">
            <StatusBadge status={status === 'active' ? 'active' : 'missing'} label={status} />
          </Field>
          <Field label="Current employee number">
            <span className="font-mono">{employeeNumber ?? '—'}</span>
          </Field>
          <Field label="Number changes">{history.length}</Field>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Employee number history
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {history.map((h, i) => (
                <li key={`${h.number}-${h.from}-${i}`} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-mono">{h.number}</div>
                    <div className="text-xs text-muted-foreground tabular">
                      {formatDate(h.from)} → {h.to ? formatDate(h.to) : 'present'}
                    </div>
                  </div>
                  {h.to === null && <StatusBadge status="active" label="Current" />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----- Contracts tab — 4 lifecycle sections --------------------------------

function ContractRow({ c, dim = false }: { c: Contract; dim?: boolean }) {
  const issueLabel = contractDataQualityLabel(c.dataQualityIssue);
  const informational = isInformationalDataQualityFlag(c.dataQualityIssue);
  return (
    <li className={cn('px-6 py-3 flex items-start justify-between gap-4 transition-colors duration-fast hover:bg-muted/30', dim && 'opacity-90')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {c.contractType}
          <span className="text-xs text-muted-foreground font-mono">v{c.version}</span>
          {issueLabel && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                informational
                  ? 'bg-status-info-soft text-status-info ring-status-info/20'
                  : 'bg-status-expired-soft text-status-expired ring-status-expired/20',
              )}
            >
              {issueLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground tabular">
          {formatDate(c.startDate)} → {formatDate(c.endDate)}
          {' · '}
          <span className="font-mono">{c.filename}</span>
        </div>
      </div>
      <div className="shrink-0">
        <StatusBadge status={c.status} />
      </div>
    </li>
  );
}

function ContractsSection({
  icon: Icon,
  title,
  description,
  rows,
  emptyTitle,
  emptyHint,
  tone = 'default',
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  rows: Contract[];
  emptyTitle: string;
  emptyHint: string;
  tone?: 'default' | 'active' | 'expiring' | 'expired' | 'info';
}) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className={cn(
              'h-4 w-4',
              tone === 'active'   && 'text-status-active',
              tone === 'expiring' && 'text-status-expiring',
              tone === 'expired'  && 'text-status-expired',
              tone === 'info'     && 'text-status-info',
              tone === 'default'  && 'text-muted-foreground',
            )} aria-hidden="true" />
            {title}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 text-xs font-medium tabular text-muted-foreground">
          {rows.length}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={emptyTitle}
            description={emptyHint}
          />
        ) : (
          <ul className="divide-y">
            {rows.map((c) => (
              <ContractRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ContractsTab({ split }: { split: ReturnType<typeof splitContractsByLifecycle> }) {
  const { current, future, history, reviewRequired } = split;

  return (
    <div className="space-y-4">
      {/* Current — single card, not a list */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-status-active" aria-hidden="true" />
              Current Contract
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">The contract whose window covers today, by latest end_date.</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {current ? (
            <ul className="divide-y">
              <ContractRow c={current} />
            </ul>
          ) : (
            <EmptyState
              icon={FileText}
              tone="expired"
              title="No active contract"
              description="No contract window currently covers today's date. The History section below shows superseded contracts; the Review Required section shows rows blocked by a date defect."
            />
          )}
        </CardContent>
      </Card>

      <ContractsSection
        icon={Calendar}
        title="Future Contracts"
        description="Contracts whose start_date is later than today."
        rows={future}
        emptyTitle="No upcoming contracts"
        emptyHint="When a future contract is uploaded or entered, it will appear here until its start date passes."
        tone="info"
      />

      <ContractsSection
        icon={History}
        title="Contract History"
        description="Expired or superseded contracts. Kept as history — old contracts are not defects."
        rows={history}
        emptyTitle="No history yet"
        emptyHint="As contracts end, they slide here automatically. Nothing is auto-archived."
        tone="default"
      />

      <ContractsSection
        icon={AlertTriangle}
        title="Review Required"
        description="Rows with broken date logic, missing template, or no employee link. These are NOT auto-corrected — manual confirmation only."
        rows={reviewRequired}
        emptyTitle="No review items"
        emptyHint="All contracts on this profile have intact dates and a known template."
        tone={reviewRequired.length > 0 ? 'expiring' : 'active'}
      />
    </div>
  );
}

// ----- Insurance / Documents / Transactions / Audit / DataQuality ---------

function InsuranceTab({ rows }: { rows: Insurance[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={HeartPulse}
            title="No medical insurance on file"
            description="Insurance policies are imported from the Bupa CCHI export and linked by Iqama. If a policy exists for this employee but isn't showing, it may be in the unmatched bucket on the Insurance page."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {rows.map((i) => (
            <li key={i.id} className="px-6 py-3 flex items-start justify-between gap-4 transition-colors duration-fast hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{i.provider}</div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular">
                  Policy <span className="font-mono">{i.policyNumber}</span>
                  {i.memberNumber ? <> · Member <span className="font-mono">{i.memberNumber}</span></> : null}
                  {' · '}
                  {formatDate(i.startDate)} → {i.endDate ? formatDate(i.endDate) : '—'}
                </div>
              </div>
              <div className="shrink-0">
                <StatusBadge status={i.status} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DocumentsList({ rows }: { rows: { id: string; type: string; docNumber?: string | null; expiresAt?: string | null; computedStatus?: string }[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {rows.map((d) => (
            <li key={d.id} className="px-6 py-3 flex items-start justify-between gap-4 transition-colors duration-fast hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium capitalize">{d.type.replace(/_/g, ' ')}</div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular">
                  {d.docNumber ? <span className="font-mono">{d.docNumber}</span> : <span className="text-muted-foreground/70">no number</span>}
                  {d.expiresAt ? <> · expires {formatDate(d.expiresAt)}</> : null}
                </div>
              </div>
              {d.computedStatus && (
                <StatusBadge
                  status={
                    d.computedStatus === 'active'   ? 'active'
                    : d.computedStatus === 'expired' ? 'expired'
                    : 'expiring'
                  }
                  label={d.computedStatus}
                />
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TransactionsList({ rows }: { rows: { id: string; type: string; title: string; status: string; effectiveDate?: string | null; endDate?: string | null }[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {rows.map((t) => (
            <li key={t.id} className="px-6 py-3 flex items-start justify-between gap-4 transition-colors duration-fast hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular">
                  <span className="capitalize">{t.type.replace(/_/g, ' ')}</span>
                  {t.effectiveDate ? <> · {formatDate(t.effectiveDate)}</> : null}
                  {t.endDate ? <> → {formatDate(t.endDate)}</> : null}
                </div>
              </div>
              <StatusBadge
                status={
                  t.status === 'completed' || t.status === 'approved' ? 'active'
                  : t.status === 'rejected' || t.status === 'cancelled' ? 'expired'
                  : 'expiring'
                }
                label={t.status}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AuditTab({ rows }: { rows: AuditEvent[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={ScrollText}
            title="No audit events"
            description="Every mutation against this employee will appear here — who did what, when, and from which source."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="py-4">
        <AuditTimeline events={rows.slice(0, 25)} />
      </CardContent>
    </Card>
  );
}

const DATA_QUALITY_LABEL: Record<EmployeeDataQualityIssue, { label: string; severity: 'warning' | 'error' }> = {
  missing_date_of_birth:        { label: 'Date of birth missing',                     severity: 'warning' },
  missing_nationality:          { label: 'Nationality missing',                       severity: 'warning' },
  missing_hire_date:            { label: 'Hire date missing',                         severity: 'warning' },
  no_current_employee_number:   { label: 'No current employee number',                severity: 'error'   },
  iqama_expiring_soon_30d:      { label: 'Iqama expiring within 30 days',             severity: 'warning' },
  iqama_expired:                { label: 'Iqama expired',                             severity: 'error'   },
  passport_expiring_soon_180d:  { label: 'Passport expiring within 180 days',         severity: 'warning' },
  passport_expired:             { label: 'Passport expired',                          severity: 'error'   },
  no_active_contract:           { label: 'No active contract',                        severity: 'warning' },
  no_active_insurance:          { label: 'No active medical insurance',               severity: 'warning' },
  contract_with_quality_flag:   { label: 'A contract on this profile is flagged for review', severity: 'warning' },
};

function DataQualityTab({
  issues,
  isAdminVisible,
  reviewCount,
}: {
  issues: EmployeeDataQualityIssue[];
  isAdminVisible: boolean;
  reviewCount: number;
}) {
  if (!isAdminVisible) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Gauge}
            tone="info"
            title="Data quality is admin-visible"
            description="Sign in with an admin or HR-manager role to see issues affecting this profile."
          />
        </CardContent>
      </Card>
    );
  }
  if (issues.length === 0 && reviewCount === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={CheckCircle2}
            tone="info"
            title="No data-quality issues"
            description="Identity, contracts, insurance, and documents look intact for this employee."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {issues.map((kind, idx) => {
            const meta = DATA_QUALITY_LABEL[kind] ?? { label: kind, severity: 'warning' as const };
            return (
              <li key={`${kind}-${idx}`} className="px-6 py-3 flex items-start gap-3">
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 rounded-full shrink-0',
                    meta.severity === 'error' ? 'bg-status-expired' : 'bg-status-expiring',
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground font-mono">{kind}</div>
                </div>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{meta.severity}</span>
              </li>
            );
          })}
          {reviewCount > 0 && issues.length === 0 && (
            <li className="px-6 py-4 text-sm text-muted-foreground">
              {reviewCount} contract{reviewCount === 1 ? '' : 's'} flagged for review — see the Contracts tab → Review Required section.
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
