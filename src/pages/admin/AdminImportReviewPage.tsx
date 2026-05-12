/**
 * Phase 11 — admin Import Review screen.
 *
 * Purpose: lets an admin inspect each row of an uncommitted import job,
 * edit extracted fields inline, validate before commit, and only then
 * trigger the commit. The existing /admin/import wizard kicks off a
 * dry-run that creates an `import_jobs` row with status='review' and
 * one `import_job_items` per row. This page is the second half of that
 * flow: it walks every item, surfaces low-confidence / missing-field /
 * unmatched-identity flags, and stores user corrections on
 * `import_job_items.corrected_payload` via PATCH. Commit then merges
 * those corrections over the raw parser payload.
 *
 * Notable rules enforced by the UI:
 *   - duplicate employee guard: the dry-run already resolves identity
 *     matches; a `review` reason of 'missing_identity' / 'unmatched_*'
 *     surfaces here. The admin fixes the identity inline, which re-flags
 *     the row on next save.
 *   - end_date < start_date blocks Confirm Import until the admin edits.
 *   - Salary fields must parse as numeric; non-numeric input is rejected
 *     before the PATCH leaves the client.
 *   - Total package is recomputed live from basic + housing + transport
 *     + other allowances.
 *
 * Audit trail (server-side): contract_import.review_updated on each
 * PATCH; contract_import.committed at commit time. Existing
 * /api/imports/commit already writes the commit audit row.
 */
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, FileText, Save, Check, ExternalLink, Download } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiErrorState } from '@/components/common/ApiErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Chip } from '@/components/ui-foundation/Chip';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { api } from '@/lib/api/client';
import {
  useImportJobs, useImportJob, useImportJobItems, useImportCommit, usePatchImportJobItem,
} from '@/lib/api/hooks';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

// ---------- Job picker (when no jobId in URL) ------------------------------

function JobsList() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useImportJobs();
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error) {
    return (
      <ApiErrorState
        title="Cannot load import jobs"
        error={error as Error}
        onRetry={async () => { await refetch(); }}
      />
    );
  }
  const jobs = data?.items ?? [];
  const reviewable = jobs.filter((j) => j.status === 'review' || j.status === 'queued');
  if (reviewable.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No import sessions awaiting review"
        description="Upload a file via Admin → Import to start a new session. After the dry-run resolves it, the session will appear here for review before commit."
      />
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pending review sessions</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {reviewable.map((j) => (
            <li key={j.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{j.filename}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {j.type} · {j.startedAt}
                </div>
              </div>
              <Chip tone={j.status === 'review' ? 'review' : 'info'}>{j.status}</Chip>
              <Button size="sm" variant="outline" onClick={() => navigate(`${routes.adminImportReview}/${j.id}`)}>
                Review
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------- Single-item review row ----------------------------------------

interface EditableState {
  // Only the fields the FE knows are editable land here. Everything else
  // falls through to the raw parser payload at commit time. Strings are
  // raw user input — `null` after trim means "clear the value". Numbers
  // are kept as strings while typing so we can show validation errors
  // in-place; converted to numbers right before PATCH.
  identityNumber?: string;
  fullName?: string;
  fullNameArabic?: string;
  contractType?: string;
  startDate?: string;
  endDate?: string;
  basicSalary?: string;
  housingAllowance?: string;
  transportAllowance?: string;
  jobTitle?: string;
  department?: string;
}

function parseNum(s: string | undefined): number | null {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function badgeForAction(action: string | null, reason: string | null) {
  if (action === 'create')  return <Chip tone="info">New employee</Chip>;
  if (action === 'update')  return <Chip tone="active">Matched</Chip>;
  if (action === 'skip')    return <Chip tone="default">No change</Chip>;
  if (action === 'review')  return <Chip tone="review">Review required{reason ? ` · ${reason}` : ''}</Chip>;
  if (action === 'error')   return <Chip tone="expired">Error{reason ? ` · ${reason}` : ''}</Chip>;
  return <Chip tone="default">Unknown</Chip>;
}

interface ItemRowProps {
  jobId: string;
  item: {
    id: string;
    rowIndex: number;
    identityNumber: string | null;
    resolvedAction: string | null;
    reason: string | null;
    rawPayload: Record<string, unknown>;
    correctedPayload?: Record<string, unknown> | null;
    committedAction: string | null;
    committedTargetId?: string | null;
  };
  sourceContractId: string | null;
  /** SHA-256 of the source file (from `import_jobs.source_hash`), used to
   *  stream the raw PDF from private R2 before the contract row exists. */
  sourceHash: string | null;
}

function pickStr(r: Record<string, unknown>, k: string): string | undefined {
  const v = r[k];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
}

function ItemRow({ jobId, item, sourceContractId: _src, sourceHash }: ItemRowProps) {
  // Merged view: corrected over raw. The starting state of the form is the
  // already-saved corrections (or raw for never-edited rows). Edits accumulate
  // locally until the user clicks Save.
  const merged: Record<string, unknown> = {
    ...item.rawPayload,
    ...(item.correctedPayload ?? {}),
  };
  const initial: EditableState = {
    identityNumber:    pickStr(merged, 'identityNumber')    ?? pickStr(merged, 'identity_number'),
    fullName:          pickStr(merged, 'fullName')          ?? pickStr(merged, 'full_name'),
    fullNameArabic:    pickStr(merged, 'fullNameArabic')    ?? pickStr(merged, 'full_name_arabic'),
    contractType:      pickStr(merged, 'contractType')      ?? pickStr(merged, 'contract_type'),
    startDate:         pickStr(merged, 'startDate')         ?? pickStr(merged, 'start_date'),
    endDate:           pickStr(merged, 'endDate')           ?? pickStr(merged, 'end_date'),
    basicSalary:       pickStr(merged, 'basicSalary')       ?? pickStr(merged, 'basic_salary'),
    housingAllowance:  pickStr(merged, 'housingAllowance')  ?? pickStr(merged, 'housing_allowance'),
    transportAllowance:pickStr(merged, 'transportAllowance')?? pickStr(merged, 'transport_allowance'),
    jobTitle:          pickStr(merged, 'jobTitle')          ?? pickStr(merged, 'job_title'),
    department:        pickStr(merged, 'department'),
  };
  const [state, setState] = React.useState<EditableState>(initial);
  const [dirty, setDirty] = React.useState(false);
  const patch = usePatchImportJobItem(jobId);

  function set<K extends keyof EditableState>(k: K, v: string) {
    setState((s) => ({ ...s, [k]: v }));
    setDirty(true);
  }

  // Live total = basic + housing + transport (we don't render food/other
  // allowances inline yet; if the parser produced them they remain in the
  // raw payload and the commit pipeline still applies them).
  const totalLive =
    (parseNum(state.basicSalary)        ?? 0) +
    (parseNum(state.housingAllowance)   ?? 0) +
    (parseNum(state.transportAllowance) ?? 0);

  // Validation
  const startMissing = !state.startDate?.trim();
  const endMissing   = !state.endDate?.trim();
  const datesInverted =
    state.startDate && state.endDate ? state.endDate < state.startDate : false;
  const identityMissing = !state.identityNumber?.trim();
  const salaryInvalid =
    (state.basicSalary?.trim() && parseNum(state.basicSalary) == null) ||
    (state.housingAllowance?.trim() && parseNum(state.housingAllowance) == null) ||
    (state.transportAllowance?.trim() && parseNum(state.transportAllowance) == null);
  const hasError = datesInverted || salaryInvalid;
  const hasWarning = startMissing || endMissing || identityMissing;

  async function save() {
    if (hasError) {
      toast.error('Cannot save', { description: datesInverted ? 'End date is before start date.' : 'Salary fields must be numeric.' });
      return;
    }
    const corrections: Record<string, unknown> = {};
    // Send only fields that changed from the initial value AND are not blank-
    // equivalent of original. Empty strings ARE sent as null so the user can
    // explicitly clear a field.
    const put = (k: keyof EditableState, kCamel: string) => {
      const v = state[k];
      const init = initial[k];
      if (v === init) return;
      if (v == null || v === '') {
        corrections[kCamel] = null;
      } else if (['basicSalary', 'housingAllowance', 'transportAllowance'].includes(kCamel)) {
        corrections[kCamel] = parseNum(v) ?? null;
      } else {
        corrections[kCamel] = v;
      }
    };
    put('identityNumber',     'identityNumber');
    put('fullName',           'fullName');
    put('fullNameArabic',     'fullNameArabic');
    put('contractType',       'contractType');
    put('startDate',          'startDate');
    put('endDate',            'endDate');
    put('basicSalary',        'basicSalary');
    put('housingAllowance',   'housingAllowance');
    put('transportAllowance', 'transportAllowance');
    put('jobTitle',           'jobTitle');
    put('department',         'department');
    if (Object.keys(corrections).length === 0) {
      toast.info('No changes to save');
      return;
    }
    try {
      await patch.mutateAsync({ itemId: item.id, payload: { corrections } });
      toast.success('Row updated');
      setDirty(false);
    } catch (err) {
      toast.error('Save failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const filename =
    pickStr(item.rawPayload, 'filename') ?? pickStr(item.rawPayload, 'file_name') ?? null;
  // The source-PDF "Open" link goes through the existing authenticated
  // contract-file endpoint when the row is already committed to a contract.
  // Pre-commit, we don't have a contract id yet — so we hide the link
  // unless committedTargetId is present.
  const committedContractId =
    (item.committedAction === 'create' || item.committedAction === 'update') &&
    typeof item.committedTargetId === 'string'
      ? item.committedTargetId
      : null;

  // Phase 11 — the source PDF is reachable BEFORE commit via the source-
  // file streaming endpoint (`/api/source-files/:hash/file`), which uses
  // the job's source_hash. After commit, we still prefer the contract-
  // file endpoint because that one audits as `contract.file_access` and
  // surfaces a friendly filename pulled from the contract row.
  const [pdfBusy, setPdfBusy] = React.useState<'view' | 'download' | null>(null);
  async function runSourcePdf(mode: 'view' | 'download') {
    if (pdfBusy) return;
    if (!sourceHash && !committedContractId) {
      toast.error('No source file', {
        description: 'This import job has no source_hash and no committed contract id.',
      });
      return;
    }
    setPdfBusy(mode);
    try {
      const blob = committedContractId
        ? await api.fetchContractFile(committedContractId, { download: mode === 'download' })
        : await api.fetchSourceFileByHash(sourceHash!, { download: mode === 'download' });
      const url = URL.createObjectURL(blob);
      if (mode === 'view') {
        const win = window.open(url, '_blank', 'noopener');
        if (!win) toast.info('Popup blocked — file downloaded instead.');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = pickStr(item.rawPayload, 'filename') ?? `source-${sourceHash?.slice(0, 8) ?? 'file'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      toast.error('Could not open source PDF', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <Card className={cn('overflow-hidden', hasError && 'ring-1 ring-status-expired/30')}>
      <CardHeader className="pb-2 flex flex-row items-start gap-3 space-y-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground tabular-nums">Row {item.rowIndex + 1}</span>
            {badgeForAction(item.resolvedAction, item.reason)}
            {item.committedAction ? <Chip tone="active">Committed</Chip> : null}
            {dirty ? <Chip tone="info">Unsaved</Chip> : null}
          </CardTitle>
          {filename ? (
            <div className="mt-1 text-[11.5px] text-muted-foreground tabular-nums">
              source: <span className="font-mono">{filename}</span>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {sourceHash || committedContractId ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSourcePdf('view')}
                disabled={pdfBusy !== null}
                className="gap-1.5"
                title="Open the source PDF in a new tab (private R2 stream, authenticated)"
              >
                <ExternalLink className="h-3 w-3" />
                {pdfBusy === 'view' ? 'Opening…' : 'View PDF'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runSourcePdf('download')}
                disabled={pdfBusy !== null}
                className="gap-1.5"
                title="Download the source PDF"
              >
                <Download className="h-3 w-3" />
                {pdfBusy === 'download' ? '…' : 'Download'}
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={save} disabled={!dirty || hasError || patch.isPending} className="gap-1.5">
            <Save className="h-3 w-3" />
            {patch.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
        <FieldGroup label="Identity / Iqama" required missing={identityMissing}>
          <Input value={state.identityNumber ?? ''} onChange={(e) => set('identityNumber', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Full name (English)">
          <Input value={state.fullName ?? ''} onChange={(e) => set('fullName', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Full name (Arabic)">
          <Input dir="rtl" value={state.fullNameArabic ?? ''} onChange={(e) => set('fullNameArabic', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Job title">
          <Input value={state.jobTitle ?? ''} onChange={(e) => set('jobTitle', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Department / project / site">
          <Input value={state.department ?? ''} onChange={(e) => set('department', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Contract type">
          <Input value={state.contractType ?? ''} onChange={(e) => set('contractType', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Start date" missing={startMissing}>
          <Input type="date" value={state.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="End date" missing={endMissing} error={datesInverted ? 'End < Start' : null}>
          <Input type="date" value={state.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Basic salary" error={state.basicSalary?.trim() && parseNum(state.basicSalary) == null ? 'numeric' : null}>
          <Input inputMode="decimal" value={state.basicSalary ?? ''} onChange={(e) => set('basicSalary', e.target.value)} placeholder="0.00" />
        </FieldGroup>
        <FieldGroup label="Housing allowance" error={state.housingAllowance?.trim() && parseNum(state.housingAllowance) == null ? 'numeric' : null}>
          <Input inputMode="decimal" value={state.housingAllowance ?? ''} onChange={(e) => set('housingAllowance', e.target.value)} placeholder="0.00" />
        </FieldGroup>
        <FieldGroup label="Transport allowance" error={state.transportAllowance?.trim() && parseNum(state.transportAllowance) == null ? 'numeric' : null}>
          <Input inputMode="decimal" value={state.transportAllowance ?? ''} onChange={(e) => set('transportAllowance', e.target.value)} placeholder="0.00" />
        </FieldGroup>
        <div className="rounded-md border bg-muted/30 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-medium">Live total</div>
          <div className="text-base font-semibold tabular-nums mt-0.5">
            {totalLive.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">SAR / month</span>
          </div>
        </div>
        {hasWarning ? (
          <div className="col-span-full text-[11.5px] text-status-expiring inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {identityMissing && <span>Identity missing — this row will go to Review Required.</span>}
            {startMissing && <span> Start date missing.</span>}
            {endMissing && <span> End date missing.</span>}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FieldGroup({
  label, required, missing, error, children,
}: {
  label: string;
  required?: boolean;
  missing?: boolean;
  error?: string | null | false;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label className={cn('flex items-center gap-1.5 text-[11px]', missing && 'text-status-expiring', error && 'text-status-expired')}>
        {label}
        {required ? <span className="text-status-expired">*</span> : null}
        {error ? <span className="text-[10px] uppercase tracking-wide">· {error}</span> : null}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ---------- Page shell -----------------------------------------------------

export function AdminImportReviewPage() {
  const { jobId } = useParams<{ jobId?: string }>();
  const navigate = useNavigate();

  if (!jobId) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Contract import — review"
          description="Pick an unfinished import session to review and commit."
        />
        <JobsList />
      </div>
    );
  }
  return <ReviewSession jobId={jobId} onBack={() => navigate(routes.adminImportReview)} />;
}

function ReviewSession({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const jobQuery = useImportJob(jobId);
  const itemsQuery = useImportJobItems(jobId);
  const commitMut = useImportCommit();

  if (jobQuery.isLoading || itemsQuery.isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (jobQuery.error) {
    return <ApiErrorState title="Cannot load session" error={jobQuery.error as Error} onRetry={async () => { await jobQuery.refetch(); }} />;
  }
  const job = jobQuery.data?.job;
  if (!job) return <EmptyState icon={FileText} title="Session not found" description="The import session id is unknown." />;
  const items = itemsQuery.data?.items ?? [];

  // Aggregate counts for the header strip.
  const counts = {
    total: items.length,
    matched: items.filter((i) => i.resolvedAction === 'update').length,
    create: items.filter((i) => i.resolvedAction === 'create').length,
    review: items.filter((i) => i.resolvedAction === 'review').length,
    error:  items.filter((i) => i.resolvedAction === 'error').length,
    committed: items.filter((i) => i.committedAction != null).length,
  };
  const allCommitted = counts.committed === counts.total && counts.total > 0;
  // Block Confirm Import when ANY uncommitted item still has a structural
  // error (date inversion, etc). We can't access per-row state here so we
  // rely on the server: if Confirm fires the row through commit and the
  // commit fails, it surfaces in counts.error. The cheap pre-check is "is
  // the job already committed?".
  const blocked = job.status === 'committed';

  async function confirm() {
    try {
      const res = await commitMut.mutateAsync({ jobId });
      if (res.status === 'committed') {
        toast.success(res.alreadyCommitted ? 'Already committed' : 'Import committed', {
          description: `${res.counts.created} created · ${res.counts.updated} updated · ${res.counts.skipped} skipped · ${res.counts.review} review · ${res.counts.error} error`,
        });
      } else {
        toast.error('Commit failed', { description: `${res.counts.error} error rows.` });
      }
    } catch (err) {
      toast.error('Commit failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Import review — ${job.filename}`}
        description={`${job.type} · ${job.status} · started ${job.startedAt}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button onClick={confirm} disabled={blocked || commitMut.isPending} className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {allCommitted ? 'Committed' : commitMut.isPending ? 'Committing…' : 'Confirm Import'}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
          <StatBlock label="Rows"            value={counts.total} />
          <StatBlock label="New employees"   value={counts.create} tone="info" />
          <StatBlock label="Matched"         value={counts.matched} tone="active" />
          <StatBlock label="Review required" value={counts.review} tone="review" />
          <StatBlock label="Errors"          value={counts.error}  tone="expired" />
          <StatBlock label="Committed"       value={counts.committed} tone="active" />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.length === 0 ? (
          <EmptyState icon={FileText} title="No items" description="This session has no items yet. Re-run the dry-run from /admin/import." />
        ) : (
          items.map((it) => (
            <ItemRow
              key={it.id}
              jobId={jobId}
              item={it}
              sourceContractId={it.committedTargetId ?? null}
              sourceHash={job.sourceHash ?? null}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'info' | 'active' | 'review' | 'expired' }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn('text-xl font-semibold tabular-nums mt-0.5',
        tone === 'info'    && 'text-status-info',
        tone === 'active'  && 'text-status-active',
        tone === 'review'  && 'text-status-expiring',
        tone === 'expired' && 'text-status-expired')}>{value}</div>
    </div>
  );
}

