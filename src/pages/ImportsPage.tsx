import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, CheckCircle2, AlertTriangle, Activity, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { ImportWizard } from '@/features/imports/ImportWizard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CountCard } from '@/components/ui-foundation/CountCard';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { useDataset } from '@/app/dataset-context';
import { formatDateTime } from '@/lib/dates';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function ImportsPage() {
  const { importJobs } = useDataset();
  const navigate = useNavigate();
  const isNew = location.pathname === routes.importsNew;

  const summary = useMemo(() => {
    const total = importJobs.length;
    const committed = importJobs.filter((j) => j.status === 'committed').length;
    const failed = importJobs.filter((j) => j.status === 'failed').length;
    const running = importJobs.filter((j) => j.status === 'running').length;
    return { total, committed, failed, running };
  }, [importJobs]);

  if (isNew) {
    return (
      <div>
        <PageHeader
          title="New import"
          description="Upload a file, validate, preview, review conflicts, and commit."
          actions={
            <Button variant="outline" onClick={() => navigate(routes.imports)}>
              Cancel
            </Button>
          }
        />
        <ImportWizard />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Import Center"
        description="Upload Excel files of employees / insurance, or batches of contract PDFs."
        actions={
          <Button onClick={() => navigate(routes.importsNew)} className="gap-2">
            <Plus className="h-4 w-4" /> New import
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <CountCard
          label="Total Jobs"
          value={summary.total}
          icon={Upload}
          tone="info"
          hint="All time"
        />
        <CountCard
          label="Committed"
          value={summary.committed}
          icon={CheckCircle2}
          tone="active"
          hint={summary.total > 0 ? `${Math.round((summary.committed / summary.total) * 100)}% success` : '—'}
        />
        <CountCard
          label="Running"
          value={summary.running}
          icon={Activity}
          tone={summary.running > 0 ? 'expiring' : 'default'}
          hint={summary.running > 0 ? 'In progress' : 'Idle'}
        />
        <CountCard
          label="Failed"
          value={summary.failed}
          icon={AlertTriangle}
          tone={summary.failed > 0 ? 'expired' : 'active'}
          hint={summary.failed > 0 ? 'Needs review' : 'All clean'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {importJobs.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No imports yet"
              description="Use the New import button above to load employees, insurance, or contract PDFs."
            />
          ) : (
            <ul className="divide-y">
              {importJobs.map((j) => (
                <li
                  key={j.id}
                  className={cn(
                    'px-6 py-3 flex items-center gap-4',
                    'transition-colors duration-fast ease-out-quart hover:bg-muted/40',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{j.filename}</div>
                    <div className="text-xs text-muted-foreground tabular">
                      {j.type} · started {formatDateTime(j.startedAt)} · {j.triggeredBy}
                    </div>
                  </div>
                  <div className="hidden md:flex gap-3 text-xs tabular">
                    <Counter label="Created" value={j.counts.created} />
                    <Counter label="Updated" value={j.counts.updated} />
                    <Counter label="Review"  value={j.counts.review} />
                    <Counter label="Errors"  value={j.counts.error} />
                  </div>
                  <StatusBadge
                    status={
                      j.status === 'committed' ? 'active'
                      : j.status === 'failed'  ? 'expired'
                      : j.status === 'running' ? 'info'
                      : 'expiring'
                    }
                    label={j.status}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
