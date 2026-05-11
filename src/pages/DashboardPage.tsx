/**
 * Dashboard — operational control room.
 *
 * Reads real DB data via DatasetContext (employees / contracts / insurance /
 * importJobs / reviewItems / auditEvents). Computes:
 *   - 10 KPI cards with date-window math for contract expirations
 *   - "Action Required" — review queue + unmatched + expiring
 *   - "Recent Imports" — last 5 import_jobs
 *   - "Data Quality" — missing/unmatched counts per entity
 *   - "Quick Actions" — links to the operational pages
 *
 * No demo button. No placeholder counts. Export downloads the KPI snapshot
 * as XLSX.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, FileText, Clock, AlertTriangle, CalendarX,
  HeartPulse, ShieldOff, Upload, UserCog, RefreshCw,
} from 'lucide-react';
import {
  useEmployees, useContracts, useInsurance,
  useImportJobs, useReviewQueue,
} from '@/lib/api/hooks';
import { useMe } from '@/lib/api/use-me';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ExportButton } from '@/components/common/ExportButton';
import { routes } from '@/lib/routes';
import { formatDateTime } from '@/lib/dates';

type Kpi = { label: string; value: number };

const DASHBOARD_EXPORT_COLUMNS = [
  { header: 'KPI', value: (k: Kpi) => k.label },
  { header: 'Value', value: (k: Kpi) => k.value },
];

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return Infinity;
  const now = Date.now();
  return Math.floor((d - now) / (1000 * 60 * 60 * 24));
}

export function DashboardPage() {
  // Phase 3A: react-query direct — the dashboard MUST surface errors. The
  // old version read from `useDataset()` which silently mapped failures to
  // empty arrays, so "Total Employees: 0" looked authoritative even when
  // the real cause was a failed fetch / zod-validation gap.
  const empQuery = useEmployees();
  const conQuery = useContracts();
  const insQuery = useInsurance();
  const impQuery = useImportJobs();
  const revQuery = useReviewQueue();
  const employees   = useMemo(() => empQuery.data?.items ?? [], [empQuery.data]);
  const contracts   = useMemo(() => conQuery.data?.items ?? [], [conQuery.data]);
  const insurance   = useMemo(() => insQuery.data?.items ?? [], [insQuery.data]);
  const importJobs  = useMemo(() => impQuery.data?.items ?? [], [impQuery.data]);
  const reviewItems = useMemo(() => revQuery.data?.items ?? [], [revQuery.data]);
  const isLoading =
    empQuery.isLoading || conQuery.isLoading || insQuery.isLoading
    || impQuery.isLoading || revQuery.isLoading;
  const isFetching =
    empQuery.isFetching || conQuery.isFetching || insQuery.isFetching
    || impQuery.isFetching || revQuery.isFetching;
  const queryErrors: Array<{ slice: string; message: string }> = [];
  if (empQuery.error) queryErrors.push({ slice: 'employees',  message: String(empQuery.error.message ?? empQuery.error) });
  if (conQuery.error) queryErrors.push({ slice: 'contracts',  message: String(conQuery.error.message ?? conQuery.error) });
  if (insQuery.error) queryErrors.push({ slice: 'insurance',  message: String(insQuery.error.message ?? insQuery.error) });
  if (impQuery.error) queryErrors.push({ slice: 'importJobs', message: String(impQuery.error.message ?? impQuery.error) });
  if (revQuery.error) queryErrors.push({ slice: 'reviewItems', message: String(revQuery.error.message ?? revQuery.error) });

  function refetchAll() {
    empQuery.refetch();
    conQuery.refetch();
    insQuery.refetch();
    impQuery.refetch();
    revQuery.refetch();
  }
  const navigate = useNavigate();
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;

  const k = useMemo(() => {
    const activeEmployees = employees.filter((e) => e.status === 'active').length;
    const activeContracts = contracts.filter((c) => c.status === 'active').length;
    const expiredContracts = contracts.filter((c) => c.status === 'expired').length;
    let exp30 = 0, exp60 = 0;
    for (const c of contracts) {
      if (c.status === 'expired') continue;
      const dn = daysUntil(c.endDate);
      if (dn >= 0 && dn <= 30) exp30++;
      if (dn >= 0 && dn <= 60) exp60++;
    }
    const activeInsurance = insurance.filter((i) => i.status === 'active').length;
    const expiredOrMissingInsurance = insurance.filter((i) => i.status === 'expired' || i.status === 'missing').length;
    const openReview = reviewItems.filter((r) => r.status === 'open').length;

    // Data quality
    const employeesMissingIdentity = employees.filter((e) => !e.identityNumber).length
      + reviewItems.filter((r) => r.entity === 'employee' && r.reason === 'missing_identity' && r.status === 'open').length;
    const insuranceMissingPolicy = insurance.filter((i) => !i.policyNumber).length;
    const contractsUnknownTemplate = reviewItems.filter((r) => r.entity === 'contract' && r.reason === 'missing_identity' && r.status === 'open').length;
    const contractsUnmatched = reviewItems.filter((r) => r.entity === 'contract' && r.reason === 'unmatched_contract' && r.status === 'open').length;
    const insuranceUnmatched = insurance.filter((i) => !i.matched).length;

    const last = importJobs[0];

    return {
      totalEmployees: employees.length,
      activeEmployees,
      activeInsurance,
      expiredOrMissingInsurance,
      activeContracts,
      contractsExpiring30: exp30,
      contractsExpiring60: exp60,
      expiredContracts,
      openReview,
      lastImport: last ?? null,
      employeesMissingIdentity,
      insuranceMissingPolicy,
      contractsUnknownTemplate,
      contractsUnmatched,
      insuranceUnmatched,
    };
  }, [employees, contracts, insurance, importJobs, reviewItems]);

  const exportRows: Kpi[] = [
    { label: 'Total employees', value: k.totalEmployees },
    { label: 'Active employees', value: k.activeEmployees },
    { label: 'Active contracts', value: k.activeContracts },
    { label: 'Contracts expiring in 30 days', value: k.contractsExpiring30 },
    { label: 'Contracts expiring in 60 days', value: k.contractsExpiring60 },
    { label: 'Contracts expired', value: k.expiredContracts },
    { label: 'Active insurance', value: k.activeInsurance },
    { label: 'Expired or missing insurance', value: k.expiredOrMissingInsurance },
    { label: 'Open review queue', value: k.openReview },
    { label: 'Employees missing identity', value: k.employeesMissingIdentity },
    { label: 'Insurance missing policy', value: k.insuranceMissingPolicy },
    { label: 'Contracts unknown template', value: k.contractsUnknownTemplate },
    { label: 'Contracts unmatched to employee', value: k.contractsUnmatched },
    { label: 'Insurance unmatched to employee', value: k.insuranceUnmatched },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          isLoading
            ? 'Loading operational snapshot from D1…'
            : queryErrors.length > 0
              ? `Partial snapshot — ${queryErrors.length} endpoint(s) failed (see banner).`
              : 'Operational snapshot. All counts come from D1 — no static numbers, no demo data.'
        }
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={refetchAll}
              disabled={isFetching}
              title="Refresh all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <ExportButton
              filename="dashboard-snapshot"
              sheet="KPIs"
              rows={exportRows}
              columns={DASHBOARD_EXPORT_COLUMNS}
              summary={[
                { label: 'Generated at', value: new Date().toISOString() },
                { label: 'Total employees', value: k.totalEmployees },
                { label: 'Total active contracts', value: k.activeContracts },
                { label: 'Total active insurance', value: k.activeInsurance },
                { label: 'Open review queue', value: k.openReview },
              ]}
            />
          </>
        }
      />

      {queryErrors.length > 0 ? (
        <div className="mb-4 rounded-md border border-status-expired/40 bg-status-expired-soft px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-expired mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-status-expired">
                {queryErrors.length} endpoint{queryErrors.length === 1 ? '' : 's'} failed — KPI cards may show zero
              </div>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {queryErrors.map((e) => (
                  <li key={e.slice} className="break-all">
                    <span className="font-medium">{e.slice}:</span> {e.message}
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" className="mt-2 h-7" onClick={refetchAll}>
                <RefreshCw className="h-3 w-3" /> Retry all
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Total Employees"      value={k.totalEmployees}            icon={Users}        tone="info" />
        <KpiCard label="Active Employees"     value={k.activeEmployees}           icon={UserCheck}    tone="active" />
        <KpiCard label="Active Contracts"     value={k.activeContracts}           icon={FileText}     tone="active" />
        <KpiCard label="Expiring ≤30d"        value={k.contractsExpiring30}       icon={Clock}        tone="expiring" hint="Next 30 days" />
        <KpiCard label="Expiring ≤60d"        value={k.contractsExpiring60}       icon={Clock}        tone="expiring" hint="Next 60 days" />
        <KpiCard label="Expired Contracts"    value={k.expiredContracts}          icon={CalendarX}    tone="expired" />
        <KpiCard label="Active Insurance"     value={k.activeInsurance}           icon={HeartPulse}   tone="active" />
        <KpiCard label="Expired/Missing Ins." value={k.expiredOrMissingInsurance} icon={ShieldOff}    tone="missing" />
        <KpiCard label="Open Review"          value={k.openReview}                icon={AlertTriangle} tone="expiring" />
        <KpiCard
          label="Last Import"
          value={k.lastImport ? 1 : 0}
          icon={Upload}
          tone={k.lastImport?.status === 'committed' ? 'active' : k.lastImport?.status === 'failed' ? 'expired' : 'info'}
          hint={k.lastImport ? `${k.lastImport.status} · ${k.lastImport.filename}` : 'No imports yet'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Action Required */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-expiring" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ActionRow
              label={`${k.openReview} open review items`}
              tone={k.openReview > 0 ? 'expiring' : 'active'}
              onClick={() => navigate(routes.review)}
              hint={k.openReview === 0 ? 'All clean' : 'Click to triage'}
            />
            <ActionRow
              label={`${k.contractsUnmatched} contracts not matched to an employee`}
              tone={k.contractsUnmatched > 0 ? 'expired' : 'active'}
              onClick={() => navigate(routes.review)}
              hint={k.contractsUnmatched === 0 ? 'All matched' : 'Open Review Queue'}
            />
            <ActionRow
              label={`${k.contractsExpiring30} contracts expiring in 30 days`}
              tone={k.contractsExpiring30 > 0 ? 'expiring' : 'active'}
              onClick={() => navigate(routes.contracts)}
              hint="Open Contracts"
            />
            <ActionRow
              label={`${k.expiredOrMissingInsurance} insurance policies expired or missing`}
              tone={k.expiredOrMissingInsurance > 0 ? 'expired' : 'active'}
              onClick={() => navigate(routes.insurance)}
              hint="Open Medical Insurance"
            />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2">
            <Button variant="outline" className="justify-start" onClick={() => navigate(routes.imports)}>
              <Upload className="h-4 w-4" /> Open Import Center
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate(routes.review)}>
              <AlertTriangle className="h-4 w-4" /> Open Review Queue
            </Button>
            {isAdmin && (
              <Button variant="outline" className="justify-start" onClick={() => navigate(routes.users)}>
                <UserCog className="h-4 w-4" /> Manage Users
              </Button>
            )}
            <Button variant="outline" className="justify-start" onClick={() => navigate(routes.admin)}>
              <FileText className="h-4 w-4" /> Open Audit Log
            </Button>
          </CardContent>
        </Card>

        {/* Recent Imports */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Imports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {importJobs.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No imports yet.</p>
            ) : (
              <ul className="divide-y">
                {importJobs.slice(0, 5).map((j) => (
                  <li key={j.id} className="px-6 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{j.filename}</div>
                      <div className="text-xs text-muted-foreground tabular">
                        {j.type} · {formatDateTime(j.startedAt)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground tabular shrink-0 hidden md:block">
                      C {j.counts.created} · U {j.counts.updated} · R {j.counts.review} · E {j.counts.error}
                    </div>
                    <StatusBadge
                      status={j.status === 'committed' ? 'active' : j.status === 'failed' ? 'expired' : 'info'}
                      label={j.status}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Data Quality */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Data Quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <QualityRow label="Employees missing identity"  value={k.employeesMissingIdentity} />
            <QualityRow label="Insurance missing policy"    value={k.insuranceMissingPolicy} />
            <QualityRow label="Contracts unknown template"  value={k.contractsUnknownTemplate} />
            <QualityRow label="Contracts unmatched"         value={k.contractsUnmatched} />
            <QualityRow label="Insurance unmatched"         value={k.insuranceUnmatched} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionRow({
  label, tone, onClick, hint,
}: {
  label: string; tone: 'active' | 'expiring' | 'expired'; onClick: () => void; hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/40 transition"
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full bg-status-${tone}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function QualityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular ${value > 0 ? 'text-status-expiring' : 'text-status-active'}`}>{value}</span>
    </div>
  );
}
