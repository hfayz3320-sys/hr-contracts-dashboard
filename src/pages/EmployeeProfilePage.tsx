/**
 * EmployeeProfilePage — A5.0 stub.
 *
 * This page is the FUTURE work surface for Employee 360. A5.0 proves the
 * interaction foundation in its real home; A5.1 wires it to
 * `GET /api/employees/:id` (already live on the deployed Worker version
 * `e5a4b32a`).
 *
 * Hard rules for this stub (per the approved A5.0 plan):
 *   - No fake names, no fake counts, no fake Iqama numbers.
 *   - Empty states for every tab look INTENTIONAL, not "no data yet".
 *   - An info banner clearly tells the operator that A5.1 will bind data.
 *   - Action menu is rendered but DISABLED with a tooltip stating
 *     "Available in A5.1" — proves the slot exists.
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
  Briefcase,
  Gauge,
  Sparkles,
  Pencil,
  Upload,
  MoreHorizontal,
  ArrowUpRight,
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
import { routes } from '@/lib/routes';

const STAGE_CHIP = 'A5.1 wires this up';

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

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const safeId = id ?? 'unknown';

  // No fake data. We DO show the raw id from the URL so an HR tester can
  // verify the routing works.
  const stubChips: ProfileHeaderChip[] = [
    { key: 'stage', label: 'A5.0 — interaction foundation', tone: 'info' },
  ];

  const stubActions = (
    <>
      <PressableButton
        variant="outline"
        size="sm"
        disabled
        tooltip="Available in A5.1"
        aria-label="Edit employee (disabled until A5.1)"
      >
        <Pencil className="h-4 w-4" />
        Edit
      </PressableButton>
      <ActionMenu
        ariaLabel="More employee actions"
        variant="outline"
        size="icon"
        disabled
        title="Available in A5.1"
        items={[
          { key: 'placeholder', label: 'Available in A5.1', disabled: true },
        ]}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee profile"
        breadcrumb={[
          { label: 'Employees', to: routes.employees },
          { label: safeId },
        ]}
      />

      <ProfileHeader
        initials="—"
        name={<span className="font-mono text-lg align-middle">— employee profile —</span>}
        subtitle="Full identity, contracts, insurance, documents, transactions, audit, and data quality will appear here in A5.1."
        meta={<>id: <span className="text-foreground/80">{safeId}</span></>}
        chips={stubChips}
        actions={stubActions}
      />

      <AnimatedTabs urlKey="tab" defaultValue="summary">
        <TabList aria-label="Employee profile sections">
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key}>
              {t.label}
            </Tab>
          ))}
        </TabList>

        <TabPanel value="summary">
          <EmptyState
            icon={Gauge}
            tone="info"
            title="Summary at a glance"
            description="KPI strip, action-required items, recent activity, and quick actions will live here, sourced from GET /api/employees/:id."
            stage={STAGE_CHIP}
          />
        </TabPanel>

        <TabPanel value="personal">
          <EmptyState
            icon={User}
            title="Personal information"
            description="Name (English + Arabic), date of birth, nationality, redacted Iqama with admin reveal, contact info, and emergency contact."
            stage={STAGE_CHIP}
          />
        </TabPanel>

        <TabPanel value="job">
          <EmptyState
            icon={Briefcase}
            title="Job information"
            description="Department, job title, site, project, sponsor, legal entity, hire date, and the current + historical employee numbers."
            stage={STAGE_CHIP}
          />
        </TabPanel>

        <TabPanel value="contracts">
          <EmptyState
            icon={FileText}
            title="Contracts"
            description="Versioned contract history with source PDFs, lifecycle status (active / expiring / expired), data-quality flag, and link/unlink actions."
            stage={STAGE_CHIP}
            action={
              <PressableButton
                variant="outline"
                size="sm"
                disabled
                tooltip="Available in A5.1"
              >
                <Upload className="h-4 w-4" />
                Add contract
              </PressableButton>
            }
          />
        </TabPanel>

        <TabPanel value="insurance">
          <EmptyState
            icon={HeartPulse}
            title="Medical insurance"
            description="Policies grouped by provider with computed status, member number, class, dates, and unmatched-link resolution."
            stage={STAGE_CHIP}
          />
        </TabPanel>

        <TabPanel value="documents">
          <EmptyState
            icon={FolderOpen}
            title="Documents"
            description="Iqama, passport, visa, work permit, insurance card, and other documents grouped by type, with current/history view and expiry chips."
            stage={STAGE_CHIP}
            action={
              <PressableButton
                variant="outline"
                size="sm"
                disabled
                tooltip="Available in A5.1"
              >
                <Upload className="h-4 w-4" />
                Add document
              </PressableButton>
            }
          />
        </TabPanel>

        <TabPanel value="transactions">
          <EmptyState
            icon={ClipboardList}
            title="HR transactions"
            description="The life-ledger: flight tickets, iqama renewals, vacation, salary adjustments, warnings, document requests, training, and more. Idempotent creates supported via the backend."
            stage={STAGE_CHIP}
            action={
              <PressableButton
                variant="outline"
                size="sm"
                disabled
                tooltip="Available in A5.1"
              >
                <MoreHorizontal className="h-4 w-4" />
                New transaction
              </PressableButton>
            }
          />
        </TabPanel>

        <TabPanel value="audit">
          <EmptyState
            icon={ScrollText}
            title="Audit trail"
            description="Append-only timeline of every action against this employee and their related records — who did what, when, and from which source."
            stage={STAGE_CHIP}
          />
        </TabPanel>

        <TabPanel value="dataQuality">
          <EmptyState
            icon={AlertTriangle}
            title="Data quality report"
            description="Read-time issues such as missing date of birth, expired Iqama, no active contract, or a contract with a data-quality flag — with deep links to the responsible record."
            stage={STAGE_CHIP}
          />
        </TabPanel>
      </AnimatedTabs>

      {/* Operator info banner — explicit honest disclosure that A5.0 is the
          interaction foundation, A5.1 wires real data. No fake numbers. */}
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-status-info/20 bg-status-info-soft/60 p-4 text-[13px] text-foreground"
      >
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-status-info" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">A5.0 ships the interaction foundation</div>
          <p className="mt-0.5 text-muted-foreground leading-relaxed">
            Premium hover rail, animated tabs, press-down buttons, and intentional empty
            states. A5.1 will wire this page to{' '}
            <span className="font-mono text-[12px] text-foreground/80">
              GET /api/employees/:id
            </span>{' '}
            — already live on the deployed Worker (version{' '}
            <span className="font-mono text-[12px] text-foreground/80">e5a4b32a</span>
            ).
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
