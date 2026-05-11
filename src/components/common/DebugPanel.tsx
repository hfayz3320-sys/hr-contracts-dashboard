/**
 * Admin-only floating debug panel — Phase 3A.
 *
 * Shows DB / API / UI counts side-by-side so any discrepancy is obvious at
 * a glance. Renders nothing for non-admin viewers, so a normal HR user
 * never sees an "API count" pill. The panel hugs the bottom-right of the
 * viewport, expands on click, and is dismissable.
 *
 *   DB = `/api/debug/counts` (server-side row counts; no data, no PII)
 *   API = what `useEmployees()` / `useContracts()` / `useInsurance()` got
 *         back through the zod-validated response path
 *   UI  = what `useDataset()` is currently exposing (legacy provider)
 *
 * If DB ≠ API → server-side parse/serialize gap or auth issue
 * If API ≠ UI → react-query / provider drift
 * If all three are 0 → real empty DB (or auth failing across the board)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bug, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMe } from '@/lib/api/use-me';
import {
  useEmployees,
  useContracts,
  useInsurance,
  useReviewQueue,
  useImportJobs,
} from '@/lib/api/hooks';
import { useDataset, useEndpointErrors, useLastFetchAt, useApiState } from '@/app/dataset-context';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

export function DebugPanel() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const isAdmin = me?.isAdmin === true;

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-3 right-3 z-50">
      {open ? (
        <DebugPanelBody onClose={() => setOpen(false)} />
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shadow-md gap-2"
          onClick={() => setOpen(true)}
        >
          <Bug className="h-3.5 w-3.5" />
          Diagnostics
        </Button>
      )}
    </div>
  );
}

function DebugPanelBody({ onClose }: { onClose: () => void }) {
  const dbQuery = useQuery({
    queryKey: ['debug-counts'],
    queryFn: api.debugCounts,
    refetchOnWindowFocus: false,
  });
  const emp = useEmployees();
  const con = useContracts();
  const ins = useInsurance();
  const rev = useReviewQueue();
  const imp = useImportJobs();
  const dataset = useDataset();
  const endpointErrors = useEndpointErrors();
  const lastFetchAt = useLastFetchAt();
  const apiState = useApiState();

  const db = dbQuery.data?.db;
  const schemaHealth = dbQuery.data?.schemaHealth;

  const rows: Array<{
    label: string;
    db: number | undefined;
    api: number | undefined;
    ui: number;
    apiError?: string | null;
    contextError?: string | null;
  }> = [
    {
      label: 'Employees',
      db: db?.employees,
      api: emp.data?.items.length,
      ui: dataset.employees.length,
      apiError: emp.error ? String(emp.error.message ?? emp.error) : null,
      contextError: endpointErrors.employees,
    },
    {
      label: 'Contracts',
      db: db?.contracts,
      api: con.data?.items.length,
      ui: dataset.contracts.length,
      apiError: con.error ? String(con.error.message ?? con.error) : null,
      contextError: endpointErrors.contracts,
    },
    {
      label: 'Insurance',
      db: db?.insurance,
      api: ins.data?.items.length,
      ui: dataset.insurance.length,
      apiError: ins.error ? String(ins.error.message ?? ins.error) : null,
      contextError: endpointErrors.insurance,
    },
    {
      label: 'Review (open)',
      db: db?.reviewOpen,
      api: rev.data?.items.filter((r) => r.status === 'open').length,
      ui: dataset.reviewItems.filter((r) => r.status === 'open').length,
      apiError: rev.error ? String(rev.error.message ?? rev.error) : null,
      contextError: endpointErrors.reviewItems,
    },
    {
      label: 'Import jobs',
      db: db?.importJobs,
      api: imp.data?.items.length,
      ui: dataset.importJobs.length,
      apiError: imp.error ? String(imp.error.message ?? imp.error) : null,
      contextError: endpointErrors.importJobs,
    },
  ];

  return (
    <Card className="w-[420px] shadow-lg">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bug className="h-3.5 w-3.5" /> Diagnostics
          <Badge variant="outline" className="text-[10px] py-0">{apiState}</Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => { dbQuery.refetch(); emp.refetch(); con.refetch(); ins.refetch(); rev.refetch(); imp.refetch(); }}
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', dbQuery.isFetching && 'animate-spin')} />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-[1fr_60px_60px_60px] gap-1 font-medium border-b pb-1">
          <div>Source</div>
          <div className="text-right">DB</div>
          <div className="text-right">API</div>
          <div className="text-right">UI</div>
        </div>
        {rows.map((r) => {
          const dbN = r.db ?? '—';
          const apiN = r.api ?? '—';
          const uiN = r.ui;
          const drift =
            typeof r.db === 'number' && typeof r.api === 'number' && r.db !== r.api
              ? 'db-api'
              : typeof r.api === 'number' && r.api !== uiN
                ? 'api-ui'
                : null;
          return (
            <div key={r.label} className="space-y-0.5">
              <div className={cn(
                'grid grid-cols-[1fr_60px_60px_60px] gap-1 tabular',
                drift && 'text-status-expired',
              )}>
                <div>{r.label}</div>
                <div className="text-right">{dbN}</div>
                <div className="text-right">{apiN}</div>
                <div className="text-right">{uiN}</div>
              </div>
              {r.apiError && (
                <div className="text-[10px] text-status-expired pl-2">
                  api: {truncate(r.apiError, 120)}
                </div>
              )}
              {r.contextError && r.contextError !== r.apiError && (
                <div className="text-[10px] text-status-expired pl-2">
                  ctx: {truncate(r.contextError, 120)}
                </div>
              )}
              {drift === 'db-api' && (
                <div className="text-[10px] text-status-expired pl-2">
                  ⚠ DB and API disagree — server-side serialize or zod-validate gap.
                </div>
              )}
              {drift === 'api-ui' && (
                <div className="text-[10px] text-status-expired pl-2">
                  ⚠ API and UI disagree — provider / react-query drift.
                </div>
              )}
            </div>
          );
        })}

        {schemaHealth && (
          <div className="pt-2 border-t">
            <div className="font-medium mb-1">Schema health</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              <Row label="Employees missing identity" value={schemaHealth.employeesMissingIdentity} />
              <Row label="Employees missing name" value={schemaHealth.employeesMissingName} />
              <Row label="Contracts missing hash" value={schemaHealth.contractsMissingHash} />
              <Row label="Contracts missing filename" value={schemaHealth.contractsMissingFilename} />
              <Row label="Contracts conf out of [0,1]" value={schemaHealth.contractsConfidenceOutOfRange} />
              <Row label="Insurance missing policy#" value={schemaHealth.insuranceMissingPolicyNumber} />
              <Row label="Insurance missing start" value={schemaHealth.insuranceMissingStart} />
            </div>
          </div>
        )}

        {dbQuery.error && (
          <div className="text-[10px] text-status-expired border-t pt-2">
            debugCounts error: {truncate(String(dbQuery.error.message ?? dbQuery.error), 200)}
          </div>
        )}

        <div className="pt-2 border-t text-[10px] text-muted-foreground">
          Last context fetch: {lastFetchAt ? new Date(lastFetchAt).toLocaleTimeString() : '—'}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn('flex items-center justify-between gap-2', value > 0 && 'text-status-expiring')}>
      <span className="truncate">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}
