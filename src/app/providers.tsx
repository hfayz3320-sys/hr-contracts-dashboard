import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { loadDataset } from '@/data/fixtures';
import type { Dataset } from '@/data/fixtures.types';
import {
  DatasetContext,
  emptyDataset,
  emptyEndpointErrors,
  type ApiState,
  type DatasetContextValue,
  type EndpointErrors,
} from './dataset-context';
import { queryClient } from '@/lib/api/query-client';
import { api, ApiUnavailableError, API_BASE_URL } from '@/lib/api/client';
import { isDev, isProd } from '@/lib/env';

function reasonMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  try { return JSON.stringify(reason); } catch { return String(reason); }
}

function DatasetProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset>(emptyDataset);
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [endpointErrors, setEndpointErrors] = useState<EndpointErrors>(emptyEndpointErrors);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadLiveData(): Promise<{ data: Dataset; errors: EndpointErrors }> {
      // Per-call settle: tolerate individual endpoint failures without wiping
      // out the rest. A single 403 (e.g. on /api/audit-events for a non-admin)
      // used to take the whole dashboard down. Phase 3A: silent fallback is
      // gone — every failed endpoint now records an error string that pages
      // can surface as a red banner via `useEndpointError(slice)`.
      const results = await Promise.allSettled([
        api.employees(),
        api.contracts(),
        api.insurance(),
        api.importJobs(),
        api.reviewQueue(),
        api.auditEvents(),
      ]);
      const [emp, con, ins, imp, rev, aud] = results;
      const errors: EndpointErrors = {
        employees:   emp.status === 'rejected' ? reasonMessage(emp.reason) : null,
        contracts:   con.status === 'rejected' ? reasonMessage(con.reason) : null,
        insurance:   ins.status === 'rejected' ? reasonMessage(ins.reason) : null,
        importJobs:  imp.status === 'rejected' ? reasonMessage(imp.reason) : null,
        reviewItems: rev.status === 'rejected' ? reasonMessage(rev.reason) : null,
        auditEvents: aud.status === 'rejected' ? reasonMessage(aud.reason) : null,
      };
      if (import.meta.env.DEV) {
        for (const [k, v] of Object.entries(errors)) {
          if (v) {
            // eslint-disable-next-line no-console
            console.warn(`[dataset] ${k} endpoint failed:`, v);
          }
        }
      }
      return {
        data: {
          employees:   emp.status === 'fulfilled' ? emp.value.items : [],
          contracts:   con.status === 'fulfilled' ? con.value.items : [],
          insurance:   ins.status === 'fulfilled' ? ins.value.items : [],
          importJobs:  imp.status === 'fulfilled' ? imp.value.items : [],
          reviewItems: rev.status === 'fulfilled' ? rev.value.items : [],
          auditEvents: aud.status === 'fulfilled' ? aud.value.items : [],
          sourceFiles: [],
        },
        errors,
      };
    }

    /**
     * Determine apiState from the HEALTH endpoint alone, decoupled from the
     * per-table data fetches above. The top-bar "API" pill now reflects:
     *
     *   live  — /api/health returned 200 AND (in production) all of
     *           environment=production, db=reachable, r2=reachable,
     *           cfAccess=configured. Anything weaker is treated as error.
     *   synthetic — dev mode with no VITE_API_BASE_URL; fixtures kick in.
     *   error — health check failed (network, schema, or any weak field
     *           in production).
     */
    async function probeHealth(): Promise<{ state: ApiState; message: string | null }> {
      try {
        const h = await api.health();
        if (isProd) {
          const fullGreen =
            h.environment === 'production' &&
            h.db === 'reachable' &&
            h.r2 === 'reachable' &&
            h.cfAccess === 'configured';
          if (!fullGreen) {
            const parts: string[] = [];
            if (h.environment !== 'production') parts.push(`environment=${h.environment ?? 'unknown'}`);
            if (h.db !== 'reachable') parts.push(`db=${h.db}`);
            if (h.r2 !== 'reachable') parts.push(`r2=${h.r2 ?? 'unknown'}`);
            if (h.cfAccess !== 'configured') parts.push(`cfAccess=${h.cfAccess ?? 'unknown'}`);
            return { state: 'error', message: `API degraded: ${parts.join(', ')}` };
          }
        }
        return { state: 'live', message: null };
      } catch (err) {
        return {
          state: 'error',
          message: err instanceof Error ? err.message : 'Health check failed',
        };
      }
    }

    (async () => {
      // Dev with no API configured → synthetic everything, never reach Worker.
      if (!API_BASE_URL && isDev) {
        const synthetic = await loadDataset();
        if (mounted) {
          setData(synthetic);
          setApiState('synthetic');
          setErrorMessage(null);
          setEndpointErrors(emptyEndpointErrors);
          setLastFetchAt(new Date().toISOString());
        }
        return;
      }

      // 1) Drive apiState pill from /api/health ONLY.
      const probe = await probeHealth();
      if (mounted) {
        setApiState(probe.state);
        setErrorMessage(probe.message);
      }

      // 2) Independently attempt to load dataset for legacy consumers.
      //    Failures here no longer change apiState — react-query on each
      //    page will handle per-query loading/error states.
      try {
        const live = await loadLiveData();
        if (mounted) {
          setData(live.data);
          setEndpointErrors(live.errors);
          setLastFetchAt(new Date().toISOString());
        }
      } catch (err) {
        if (err instanceof ApiUnavailableError && isDev) {
          const synthetic = await loadDataset();
          if (mounted) {
            setData(synthetic);
            setApiState('synthetic');
            setErrorMessage(`API unreachable in dev; using synthetic data (${err.message}).`);
            setEndpointErrors(emptyEndpointErrors);
            setLastFetchAt(new Date().toISOString());
          }
        }
        // In prod we do nothing — apiState already reflects /api/health
        // and individual pages show per-query errors via react-query.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<DatasetContextValue>(
    () => ({ data, apiState, errorMessage, endpointErrors, lastFetchAt }),
    [data, apiState, errorMessage, endpointErrors, lastFetchAt],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <DatasetProvider>
          {children}
          <Toaster />
        </DatasetProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
