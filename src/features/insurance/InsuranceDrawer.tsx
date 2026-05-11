import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { DetailDrawer } from '@/components/common/DetailDrawer';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useDataset } from '@/app/dataset-context';
import { formatDate } from '@/lib/dates';
import { routes } from '@/lib/routes';
import type { Insurance } from '@/types/domain';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm">{children ?? '—'}</div>
    </div>
  );
}

export function InsuranceDrawer({
  open,
  onOpenChange,
  insurance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insurance: Insurance | null;
}) {
  const { employees } = useDataset();
  const navigate = useNavigate();

  if (!insurance) {
    return (
      <DetailDrawer open={open} onOpenChange={onOpenChange} title="Insurance record">
        <p className="text-sm text-muted-foreground">No record selected.</p>
      </DetailDrawer>
    );
  }

  const employee = insurance.employeeId ? employees.find((e) => e.id === insurance.employeeId) : null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-3">
          <span>{insurance.provider}</span>
          <StatusBadge status={insurance.status} />
        </div>
      }
      description={<span className="font-mono tabular text-xs">{insurance.policyNumber}</span>}
      footer={
        employee && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              onOpenChange(false);
              navigate(`${routes.employees}?drawer=emp&id=${employee.id}`);
            }}
          >
            <ExternalLink className="h-4 w-4" /> Open employee profile
          </Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Provider">{insurance.provider}</Field>
        <Field label="Policy">{insurance.policyNumber}</Field>
        <Field label="Start">{formatDate(insurance.startDate)}</Field>
        <Field label="End">{formatDate(insurance.endDate)}</Field>
        <Field label="Identity Number">
          <span className="font-mono tabular">{insurance.identityNumber ?? '—'}</span>
        </Field>
        <Field label="Matched">
          {insurance.matched ? (
            <StatusBadge status="active" label="Matched" />
          ) : (
            <StatusBadge status="missing" label="Unmatched" />
          )}
        </Field>
      </div>

      {!insurance.matched && (
        <div className="mt-6 rounded-md border border-status-missing/30 bg-status-missing-soft px-3 py-2.5 text-xs text-status-missing">
          This row could not be auto-matched to an employee. Reason:{' '}
          <strong>{insurance.unmatchedReason ?? 'unknown'}</strong>. Resolve from the Review Queue.
        </div>
      )}
    </DetailDrawer>
  );
}
