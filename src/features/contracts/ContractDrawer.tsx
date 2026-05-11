import { FileText, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { DetailDrawer } from '@/components/common/DetailDrawer';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Separator } from '@/components/ui/separator';
import { useDataset } from '@/app/dataset-context';
import { formatDate, relativeDays } from '@/lib/dates';
import type { Contract, ContractDataQualityIssue } from '@/types/domain';

/**
 * Human labels for the Phase 3D data-quality issue codes the worker
 * computes at read time (see worker/src/lib/contract-quality.ts). The
 * map is duplicated FE-side because the FE deliberately doesn't import
 * worker code — drift is prevented by zod schema + tests, not by
 * shared imports.
 */
const DATA_QUALITY_ISSUE_LABEL: Record<ContractDataQualityIssue, string> = {
  duration_negative: 'End date is before start date',
  duration_over_3_years: 'Contract duration exceeds 3 years',
  duration_under_30_days: 'Contract duration is less than 30 days',
  start_date_missing: 'Start date is missing',
  end_date_missing: 'End date is missing',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm">{children ?? '—'}</div>
    </div>
  );
}

export function ContractDrawer({
  open,
  onOpenChange,
  contract,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: Contract | null;
}) {
  const { employees, contracts } = useDataset();

  if (!contract) {
    return (
      <DetailDrawer open={open} onOpenChange={onOpenChange} title="Contract">
        <p className="text-sm text-muted-foreground">No contract selected.</p>
      </DetailDrawer>
    );
  }

  const employee = employees.find((e) => e.id === contract.employeeId);
  const versions = contracts
    .filter((c) => c.employeeId === contract.employeeId && c.contractType === contract.contractType)
    .sort((a, b) => b.version - a.version);

  function openPdf() {
    toast.info('PDF view coming in Phase 3', {
      description: 'Secure private R2 streaming will be wired up with an authenticated API endpoint.',
    });
  }

  const issue = contract.dataQualityIssue;
  const issueLabel = issue ? DATA_QUALITY_ISSUE_LABEL[issue] : null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-3">
          <span>{contract.contractType} · v{contract.version}</span>
          {issue ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-status-expiring bg-status-expiring-soft px-2 py-0.5 text-xs font-medium text-status-expiring"
              title={issueLabel ?? 'Review required'}
            >
              <AlertTriangle className="h-3 w-3" />
              Review required
            </span>
          ) : (
            <StatusBadge status={contract.status} />
          )}
        </div>
      }
      description={
        <span className="font-mono tabular text-xs">
          {contract.id} · {employee?.fullName ?? 'Unknown employee'}
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            File hash: <span className="font-mono">{contract.fileHash}</span>
          </span>
          <Button onClick={openPdf} className="gap-2">
            <Eye className="h-4 w-4" />
            Open PDF
          </Button>
        </div>
      }
    >
      {issue ? (
        <div className="mb-5 rounded-md border border-status-expiring/50 bg-status-expiring-soft px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-expiring mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-status-expiring">Review required: {issueLabel}</div>
              <div className="text-xs text-muted-foreground mt-1">
                The PDF parser produced start/end dates that look implausible.
                Verify against the source PDF and correct via the edit dialog
                before relying on this contract's status. The stored status
                badge is suppressed until the dates are confirmed.
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 tabular">
                Source PDF: <span className="font-mono break-all">{contract.filename}</span>
                {' · '}hash: <span className="font-mono">{contract.fileHash.slice(0, 12)}…</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Identity Number">
          <span className="font-mono tabular">{contract.identityNumber}</span>
        </Field>
        <Field label="Employee">{employee?.fullName ?? '—'}</Field>
        <Field label="Start Date">{formatDate(contract.startDate)}</Field>
        <Field label="End Date">
          {formatDate(contract.endDate)}
          <span className="ml-2 text-xs text-muted-foreground">({relativeDays(contract.endDate)})</span>
        </Field>
        <Field label="Type">{contract.contractType}</Field>
        <Field label="Version">v{contract.version}</Field>
      </div>

      <Separator className="my-6" />

      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Versions
        </div>
        <ul className="space-y-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className={`flex items-center justify-between border rounded-md px-3 py-2.5 ${
                v.id === contract.id ? 'bg-primary/5 border-primary/30' : ''
              }`}
            >
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  v{v.version}
                </div>
                <div className="text-xs text-muted-foreground tabular">
                  {formatDate(v.startDate)} — {formatDate(v.endDate)}
                </div>
              </div>
              <StatusBadge status={v.status} />
            </li>
          ))}
        </ul>
      </div>

      {contract.extractionConfidence !== undefined && contract.extractionConfidence < 0.8 && (
        <div className="mt-6 rounded-md border border-status-expiring/30 bg-status-expiring-soft px-3 py-2.5 text-xs text-status-expiring">
          Low extraction confidence ({Math.round(contract.extractionConfidence * 100)}%) — manual
          verification recommended.
        </div>
      )}
    </DetailDrawer>
  );
}
