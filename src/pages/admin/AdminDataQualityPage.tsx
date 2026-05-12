/**
 * Admin → Data Quality (Phase 8).
 *
 * Per-employee data-quality is computed at READ time in the worker (see
 * `worker/src/lib/employee-data-quality.ts`) and surfaced on each
 * profile's Data Quality tab. An AGGREGATE summary across all employees
 * is not wired today, so this page is honest about that limitation and
 * points the admin at the existing facilities.
 *
 * NO fake numbers. Two real signals ARE available cheaply from existing
 * endpoints and are shown:
 *   - open review-queue items grouped by reason (from /api/review-queue)
 *   - contracts with a `dataQualityIssue` server flag (from /api/contracts)
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, AlertTriangle, ShieldCheck, FileText } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { PathBackButton } from '@/components/common/PathBackButton';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { Panel } from '@/components/ui-foundation/Panel';
import { Chip } from '@/components/ui-foundation/Chip';
import { useReviewQueue, useContracts } from '@/lib/api/hooks';
import { reviewReasonLabels, type ReviewReason } from '@/types/domain';
import { routes } from '@/lib/routes';

export function AdminDataQualityPage() {
  const review = useReviewQueue('open');
  const contracts = useContracts(true, { includeEmployee: true });

  const reviewByReason = useMemo(() => {
    const m = new Map<ReviewReason, number>();
    for (const r of review.data?.items ?? []) {
      m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [review.data]);

  const contractIssues = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contracts.data?.items ?? []) {
      if (c.dataQualityIssue) m.set(c.dataQualityIssue, (m.get(c.dataQualityIssue) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [contracts.data]);

  return (
    <div className="space-y-4">
      <PathBackButton />
      <PageHeader
        title="Data Quality"
        description="Aggregate data-quality signals from the review queue and the contracts read-time classifier. The per-employee report is computed on each profile's Data Quality tab."
        breadcrumb={[{ label: 'Admin', to: routes.admin }, { label: 'Data Quality' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title={<span className="inline-flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Open review queue · by reason</span>}
        >
          {review.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : review.error ? (
            <div className="text-[12px] text-status-expired">Review queue unavailable.</div>
          ) : reviewByReason.length === 0 ? (
            <div className="inline-flex items-center gap-2 text-[12.5px] text-status-active">
              <ShieldCheck className="h-3.5 w-3.5" />
              No open review items.
            </div>
          ) : (
            <ul className="divide-y">
              {reviewByReason.map(([reason, n]) => (
                <li key={reason} className="flex items-center justify-between py-2">
                  <span className="text-[13px]">{reviewReasonLabels[reason] ?? reason}</span>
                  <Chip tone="expiring">{n}</Chip>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Link to={routes.adminReview} className="text-[12px] text-status-info hover:underline">
              Open review queue →
            </Link>
          </div>
        </Panel>

        <Panel
          title={<span className="inline-flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Contracts · data-quality flags</span>}
        >
          {contracts.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : contracts.error ? (
            <div className="text-[12px] text-status-expired">Contracts feed unavailable.</div>
          ) : contractIssues.length === 0 ? (
            <div className="inline-flex items-center gap-2 text-[12.5px] text-status-active">
              <ShieldCheck className="h-3.5 w-3.5" />
              No flagged contracts.
            </div>
          ) : (
            <ul className="divide-y">
              {contractIssues.map(([issue, n]) => (
                <li key={issue} className="flex items-center justify-between py-2">
                  <span className="text-[13px] capitalize">{issue.replace(/_/g, ' ')}</span>
                  <Chip
                    tone={
                      issue === 'duration_over_3_years' || issue === 'duration_under_30_days'
                        ? 'info'
                        : 'expired'
                    }
                  >
                    {n}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Link to={routes.contracts} className="text-[12px] text-status-info hover:underline">
              Open contracts →
            </Link>
          </div>
        </Panel>
      </div>

      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Gauge}
            tone="info"
            title="Workforce-wide aggregate not wired"
            description={
              <>
                Each employee's data-quality report (missing DOB, expired Iqama, no active contract,
                etc.) is computed server-side and shown on the profile's Data Quality tab. A
                cross-employee summary endpoint lands in a future phase — until then, the two
                aggregates above are the most accurate signals available.
              </>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
