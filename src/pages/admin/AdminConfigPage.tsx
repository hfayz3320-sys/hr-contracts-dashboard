/**
 * Admin → HR Configuration (Phase 8).
 *
 * Read-only summary of the 14 reference tables seeded in production
 * during Phase 6A-2. The /api/config/* endpoints are live but no FE
 * editor exists yet — this page documents what's there and points to
 * the worker endpoints. Edit lands in a future phase.
 *
 * NO fake numbers. Counts come from /api/config/hr if the call succeeds;
 * otherwise an empty/loading state.
 */
import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, Wallet, GraduationCap, Settings as SettingsIcon, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { ApiErrorState } from '@/components/common/ApiErrorState';
import { Panel } from '@/components/ui-foundation/Panel';
import { FormRow } from '@/components/ui-foundation/FormRow';
import { routes } from '@/lib/routes';

type HrConfigBundle = {
  orgUnits?: unknown[];
  jobTitles?: unknown[];
  positions?: unknown[];
  grades?: unknown[];
  trades?: unknown[];
  contractTypes?: unknown[];
  payrollComponents?: unknown[];
  medicalProviders?: unknown[];
  medicalPolicyClasses?: unknown[];
  documentTypes?: unknown[];
  transactionTypes?: unknown[];
  activityTypes?: unknown[];
  learningCategories?: unknown[];
  socialInsuranceRules?: unknown[];
};

async function fetchHrConfig(): Promise<HrConfigBundle> {
  const r = await fetch('/api/config/hr', { credentials: 'include' });
  if (!r.ok) {
    const err = new Error(`HR config /api/config/hr → ${r.status}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export function AdminConfigPage() {
  const cfg = useQuery<HrConfigBundle, Error>({
    queryKey: ['admin', 'hr-config'],
    queryFn: fetchHrConfig,
    staleTime: 5 * 60 * 1000,
    retry: (n, err) => {
      const status = (err as Error & { status?: number }).status;
      if (status === 401 || status === 403) return false;
      return n < 1;
    },
  });

  const len = (k: keyof HrConfigBundle): number | null => {
    const v = cfg.data?.[k];
    return Array.isArray(v) ? v.length : null;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="HR Configuration"
        description="Reference tables backing the HR module. Seeded in production during Phase 6A-2. Read-only in this phase — the editor ships later."
        breadcrumb={[{ label: 'Admin', to: routes.admin }, { label: 'HR Configuration' }]}
      />

      {cfg.isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ) : cfg.error ? (
        <ApiErrorState
          title="Cannot load HR configuration"
          error={cfg.error}
          onRetry={async () => { await cfg.refetch(); }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title={<span className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Organisation</span>}>
            <dl>
              <FormRow label="Org units"   value={<TableSize n={len('orgUnits')} />} />
              <FormRow label="Job titles"  value={<TableSize n={len('jobTitles')} />} />
              <FormRow label="Positions"   value={<TableSize n={len('positions')} />} />
              <FormRow label="Grades"      value={<TableSize n={len('grades')} />} />
              <FormRow label="Trades"      value={<TableSize n={len('trades')} />} />
            </dl>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Contracts & Documents</span>}>
            <dl>
              <FormRow label="Contract types"   value={<TableSize n={len('contractTypes')} />} />
              <FormRow label="Document types"   value={<TableSize n={len('documentTypes')} />} />
              <FormRow label="Transaction types"value={<TableSize n={len('transactionTypes')} />} />
              <FormRow label="Activity types"   value={<TableSize n={len('activityTypes')} />} />
            </dl>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-2"><Wallet className="h-3.5 w-3.5" /> Payroll & Insurance</span>}>
            <dl>
              <FormRow label="Payroll components"      value={<TableSize n={len('payrollComponents')} />} />
              <FormRow label="Medical providers"       value={<TableSize n={len('medicalProviders')} />} />
              <FormRow label="Medical policy classes"  value={<TableSize n={len('medicalPolicyClasses')} />} />
              <FormRow label="Social insurance rules"  value={<TableSize n={len('socialInsuranceRules')} />} />
            </dl>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5" /> Learning</span>}>
            <dl>
              <FormRow label="Learning categories" value={<TableSize n={len('learningCategories')} />} />
            </dl>
          </Panel>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={SettingsIcon}
            tone="info"
            title="Editor not yet wired"
            description={
              <>
                The 14 reference tables are exposed read-only via{' '}
                <span className="font-mono text-[12px]">GET /api/config/hr</span>{' '}
                and per-table GETs. CRUD endpoints land in a future phase; until then,
                changes happen via D1 migrations + seed.
              </>
            }
          />
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
        <ScrollText className="h-3 w-3" />
        Production deploy: Phase 6A-2 (migration 0006 + seed-hr-config).
      </p>
    </div>
  );
}

function TableSize({ n }: { n: number | null }) {
  if (n == null) return <span className="text-muted-foreground italic">empty</span>;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[14px] font-semibold tabular-nums">{n}</span>
      <span className="text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">{n === 1 ? 'row' : 'rows'}</span>
    </span>
  );
}
