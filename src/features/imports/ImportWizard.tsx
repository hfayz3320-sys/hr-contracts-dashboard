/**
 * Phase 2C Import Wizard — real-file pipeline.
 *
 * Flow (now with mandatory R2 raw-bytes upload before commit):
 *   1. Source    — pick file (xlsx for employees/insurance; pdf for contracts).
 *                  Parsing runs IN-BROWSER.
 *   2. Validate  — show parsed sheets/rows and warnings.
 *   3. Preview   — POST /api/imports/upload-raw → R2 (raw bytes), then
 *                  /api/imports/upload → metadata + job, then
 *                  /api/imports/dry-run → counts + per-row resolutions.
 *   4. Review    — list of `review` rows with reasons; admin resolves later.
 *   5. Commit    — POST /api/imports/commit. Server refuses to commit a job
 *                  whose raw bytes are not stored in R2 (production hard
 *                  rule). Reachable only for admins.
 *
 * Authorization model:
 *   - All `/api/imports/*` endpoints are gated server-side by requireAdmin.
 *   - In addition the FE hides the wizard's contract (PDF) source from
 *     non-admin users — Excel imports of employees / insurance are still
 *     visible because of the future HR-Manager role, but commit requires
 *     admin regardless.
 *   - We resolve "am I admin?" from /api/me (the authoritative answer).
 */
import { useState, useCallback } from 'react';
import {
  Check, ChevronRight, FileSpreadsheet, FileText, File as FileIcon,
  AlertTriangle, ShieldCheck, Cloud, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import { sha256OfFile } from '@/lib/parsers/file-hash';
import { parseExcelFile, type ParsedSheet } from '@/lib/parsers/excel';
import { parsePdfFile, type ParsedContract } from '@/lib/parsers/pdf';
import {
  useImportUpload,
  useImportUploadRaw,
  useImportDryRun,
  useImportCommit,
} from '@/lib/api/hooks';
import { useMe } from '@/lib/api/use-me';
import type { ImportDryRunResponse, ImportCommitResponse } from '@shared/api-contract';
import type { ImportJobType } from '@shared/domain';

type Step = 0 | 1 | 2 | 3 | 4;

const STEPS = [
  { key: 'source',   label: 'Source' },
  { key: 'validate', label: 'Validate' },
  { key: 'preview',  label: 'Preview' },
  { key: 'review',   label: 'Review' },
  { key: 'commit',   label: 'Commit' },
] as const;

type SourceKind = 'employees' | 'insurance' | 'contracts';

type ParsedState =
  | { kind: 'idle' }
  | { kind: 'parsing' }
  | { kind: 'parsed-excel'; type: SourceKind; sheets: ParsedSheet[]; warnings: string[]; file: File; filename: string; fileHash: string; fileSize: number }
  | { kind: 'parsed-pdf'; type: 'contracts'; contracts: ParsedContract[]; file: File; filename: string; fileHash: string; fileSize: number }
  | { kind: 'error'; message: string };

type R2State =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'stored'; r2ObjectKey: string }
  | { kind: 'error'; message: string };

const SOURCE_META: Record<SourceKind, {
  label: string;
  description: string;
  accepts: string;
  icon: typeof FileSpreadsheet;
  adminOnly: boolean;
}> = {
  employees: {
    label: 'Employees',
    description: 'Excel (.xlsx) of employee master data — UPSERTed by Iqama / IdentityNumber.',
    accepts: '.xlsx,.xls',
    icon: FileSpreadsheet,
    adminOnly: false,
  },
  insurance: {
    label: 'Medical insurance',
    description: 'Excel (.xlsx) of insurance policies (matched by IdentityNumber; group policies disambiguated by member number).',
    accepts: '.xlsx,.xls',
    icon: FileSpreadsheet,
    adminOnly: false,
  },
  contracts: {
    label: 'Contract PDFs',
    description: 'Signed contract PDFs (old or new MID template). Parsed in-browser; raw bytes stored in the private R2 bucket. Admin only.',
    accepts: '.pdf',
    icon: FileText,
    adminOnly: true,
  },
};

export function ImportWizard() {
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;

  const [step, setStep] = useState<Step>(0);
  const [source, setSource] = useState<SourceKind | null>(null);
  const [parsed, setParsed] = useState<ParsedState>({ kind: 'idle' });
  const [r2, setR2] = useState<R2State>({ kind: 'idle' });
  const [jobId, setJobId] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<ImportDryRunResponse | null>(null);
  const [commit, setCommit] = useState<ImportCommitResponse | null>(null);

  const uploadMeta = useImportUpload();
  const uploadRaw = useImportUploadRaw();
  const dryRunMutation = useImportDryRun();
  const commitMutation = useImportCommit();

  function reset() {
    setStep(0);
    setSource(null);
    setParsed({ kind: 'idle' });
    setR2({ kind: 'idle' });
    setJobId(null);
    setDryRun(null);
    setCommit(null);
  }

  const onPick = useCallback(
    async (file: File) => {
      if (!source) return;
      setParsed({ kind: 'parsing' });
      setR2({ kind: 'idle' });
      try {
        const fileHash = await sha256OfFile(file);
        if (source === 'contracts') {
          const c = await parsePdfFile(file);
          setParsed({
            kind: 'parsed-pdf',
            type: 'contracts',
            contracts: [c],
            file,
            filename: file.name,
            fileHash,
            fileSize: file.size,
          });
        } else {
          // Excel adapter is explicit: the import type the user picked is
          // passed in and a dedicated adapter handles only that type. No
          // cross-domain "classify by header heuristic" — that produces
          // bugs like "Sheet1 skipped — no recognisable schema" against
          // perfectly valid Bupa exports just because the sheet name is
          // generic.
          const wb = await parseExcelFile(file, source);
          setParsed({
            kind: 'parsed-excel',
            type: source,
            sheets: wb.sheets,
            warnings: wb.warnings,
            file,
            filename: file.name,
            fileHash,
            fileSize: file.size,
          });
        }
      } catch (err) {
        setParsed({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to parse file',
        });
      }
    },
    [source],
  );

  /**
   * Step 2 → upload-raw → upload-metadata → dry-run.
   * R2 upload happens FIRST so that, if it fails, we never run a dry-run
   * against a file whose raw bytes can't be persisted — the production
   * commit gate would block us later anyway.
   */
  async function runDryRun() {
    if (parsed.kind !== 'parsed-excel' && parsed.kind !== 'parsed-pdf') return;

    try {
      // 1. Push raw bytes to private R2 first.
      setR2({ kind: 'uploading' });
      const raw = await uploadRaw.mutateAsync({
        file: parsed.file,
        type: parsed.type,
        fileHash: parsed.fileHash,
      });
      setR2({ kind: 'stored', r2ObjectKey: raw.r2ObjectKey ?? '' });

      // 2. Register metadata / get the import job.
      const up = await uploadMeta.mutateAsync({
        type: parsed.type,
        filename: parsed.filename,
        fileHash: parsed.fileHash,
        fileSize: parsed.fileSize,
      });
      setJobId(up.jobId);

      // 3. Build per-row payload for the dry-run resolver.
      const rows: Record<string, unknown>[] =
        parsed.kind === 'parsed-excel'
          ? parsed.sheets.flatMap((s) => s.rows)
          : parsed.contracts.map((c) => ({
              identityNumber: c.identityNumber,
              fullName: c.fullName,
              nationality: c.nationality,
              jobTitle: c.jobTitle,
              contractType: c.contractType ?? 'Fixed-term',
              startDate: c.startDate,
              endDate: c.endDate,
              fileHash: c.fileHash,
              filename: c.filename,
              // Phase 8: pass templateType + extractionConfidence to the
              // dry-run resolver so unknown templates and low-confidence
              // extractions are routed to Review Required, not silently
              // committed.
              templateType: c.templateType,
              extractionConfidence: c.extractionConfidence,
            }));

      const dr = await dryRunMutation.mutateAsync({
        jobId: up.jobId,
        type: parsed.type as ImportJobType,
        filename: parsed.filename,
        fileHash: parsed.fileHash,
        rows,
      });
      setDryRun(dr);
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dry-run failed';
      if (r2.kind === 'uploading') setR2({ kind: 'error', message: msg });
      toast.error(msg);
    }
  }

  async function runCommit() {
    if (!jobId) return;
    try {
      const c = await commitMutation.mutateAsync({ jobId });
      setCommit(c);
      if (c.status === 'committed') {
        toast.success(c.alreadyCommitted ? 'Already committed' : 'Import committed', {
          description: `${c.counts.created} created · ${c.counts.updated} updated · ${c.counts.skipped} skipped · ${c.counts.review} review · ${c.counts.error} error`,
        });
      } else {
        toast.error('Import failed', { description: `${c.counts.error} errors` });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit failed');
    }
  }

  const canAdvanceFromSource =
    parsed.kind === 'parsed-excel' || parsed.kind === 'parsed-pdf';
  const canAdvanceFromValidate = canAdvanceFromSource;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Stepper */}
        <div className="flex items-center px-6 py-4 gap-1 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const isDone = idx < step;
            const isCurrent = idx === step;
            return (
              <div key={s.key} className="flex items-center gap-1 shrink-0">
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
                    isCurrent && 'bg-primary/10 text-primary font-medium',
                    isDone && 'text-muted-foreground',
                    !isCurrent && !isDone && 'text-muted-foreground/60',
                  )}
                >
                  <span
                    className={cn(
                      'h-5 w-5 rounded-full text-[11px] inline-flex items-center justify-center',
                      isDone && 'bg-status-active text-white',
                      isCurrent && 'bg-primary text-primary-foreground',
                      !isCurrent && !isDone && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : idx + 1}
                  </span>
                  {s.label}
                </div>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
        <Separator />

        {/* Content */}
        <div className="px-6 py-6 min-h-[280px]">
          {step === 0 && (
            <StepSource
              source={source}
              onSelectSource={setSource}
              parsed={parsed}
              onPickFile={onPick}
              isAdmin={isAdmin}
            />
          )}
          {step === 1 && <StepValidate parsed={parsed} />}
          {step === 2 && <StepPreview dryRun={dryRun} r2={r2} />}
          {step === 3 && <StepReview dryRun={dryRun} />}
          {step === 4 && (
            <StepCommit
              dryRun={dryRun}
              commit={commit}
              isAdmin={isAdmin}
              r2={r2}
              onCommit={runCommit}
              loading={commitMutation.isPending}
            />
          )}
        </div>

        <Separator />
        <div className="flex items-center justify-between px-6 py-4 bg-muted/30">
          <Button variant="ghost" onClick={reset}>Reset</Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
            >
              Back
            </Button>
            {step === 0 && (
              <Button disabled={!canAdvanceFromSource} onClick={() => setStep(1)}>
                Validate
              </Button>
            )}
            {step === 1 && (
              <Button
                disabled={
                  !canAdvanceFromValidate ||
                  dryRunMutation.isPending ||
                  uploadRaw.isPending
                }
                onClick={runDryRun}
              >
                {uploadRaw.isPending
                  ? 'Uploading raw…'
                  : dryRunMutation.isPending
                    ? 'Running dry-run…'
                    : 'Upload raw + run dry-run'}
              </Button>
            )}
            {step === 2 && (
              <Button disabled={!dryRun} onClick={() => setStep(3)}>Review</Button>
            )}
            {step === 3 && (
              <Button onClick={() => setStep(4)}>Continue to commit</Button>
            )}
            {step === 4 && commit?.status === 'committed' && (
              <Button onClick={reset}>Finish</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- step views -----------------------------------------------------

function StepSource({
  source,
  onSelectSource,
  parsed,
  onPickFile,
  isAdmin,
}: {
  source: SourceKind | null;
  onSelectSource: (s: SourceKind) => void;
  parsed: ParsedState;
  onPickFile: (f: File) => void;
  isAdmin: boolean;
}) {
  const visibleSources = (Object.keys(SOURCE_META) as SourceKind[]).filter((k) => {
    if (SOURCE_META[k].adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Choose what you're importing</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Files are parsed entirely in your browser. The raw bytes are then
          uploaded to the private R2 bucket so the import has a verifiable
          origin — required by production policy before commit.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {visibleSources.map((s) => {
          const meta = SOURCE_META[s];
          const Icon = meta.icon;
          const selected = source === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onSelectSource(s)}
              className={cn(
                'border rounded-lg p-4 text-left transition-colors hover:bg-muted/40',
                selected && 'border-primary bg-primary/5',
              )}
            >
              <div className="flex items-center justify-between">
                <Icon className={cn('h-5 w-5', selected ? 'text-primary' : 'text-muted-foreground')} />
                {meta.adminOnly && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                )}
              </div>
              <div className="mt-3 font-medium text-sm">{meta.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{meta.description}</div>
              <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">{meta.accepts}</div>
            </button>
          );
        })}
      </div>

      {!isAdmin && (
        <div className="text-xs text-muted-foreground border-l-2 border-muted px-3 py-2">
          Contract PDF import is hidden because your role is not Admin.
          Server-side endpoints also reject non-admin uploads with HTTP 403.
        </div>
      )}

      {source && (
        <label
          htmlFor="import-file"
          className="rounded-md border border-dashed p-6 text-center block cursor-pointer hover:bg-muted/30"
        >
          <FileIcon className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="mt-2 text-sm">
            {parsed.kind === 'parsed-excel' || parsed.kind === 'parsed-pdf' ? (
              <span className="font-medium">{parsed.filename}</span>
            ) : parsed.kind === 'parsing' ? (
              <span>Parsing…</span>
            ) : parsed.kind === 'error' ? (
              <span className="text-destructive">{parsed.message}</span>
            ) : (
              <span>Click to choose a file (or drop here)</span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{SOURCE_META[source].accepts}</div>
          <input
            id="import-file"
            type="file"
            accept={SOURCE_META[source].accepts}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
          />
        </label>
      )}
    </div>
  );
}

function StepValidate({ parsed }: { parsed: ParsedState }) {
  if (parsed.kind === 'idle' || parsed.kind === 'parsing') {
    return <p className="text-sm text-muted-foreground">No file parsed yet.</p>;
  }
  if (parsed.kind === 'error') {
    return <p className="text-sm text-destructive">{parsed.message}</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Validation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Browser-side parser results for <strong>{parsed.filename}</strong>.
        </p>
      </div>
      {parsed.kind === 'parsed-excel' && (
        <ul className="space-y-2 text-sm">
          {parsed.sheets.map((s) => (
            <li key={s.sheetName} className="border rounded-md px-3 py-2.5">
              <div className="font-medium">
                {s.sheetName} <span className="text-xs text-muted-foreground">({s.domain})</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {s.rowCount} rows · {s.warnings.length === 0 ? 'no warnings' : s.warnings.join(' · ')}
              </div>
            </li>
          ))}
          {parsed.sheets.length === 0 && (
            <li className="text-xs text-status-expired">
              No supported sheets found in the workbook. Check that the column
              headers match a known employee or insurance schema (English,
              Arabic, or Bupa export).
            </li>
          )}
          {parsed.warnings.map((w, i) => (
            <li key={i} className="text-xs text-status-expiring flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />{w}
            </li>
          ))}
        </ul>
      )}
      {parsed.kind === 'parsed-pdf' && (
        <ul className="space-y-2 text-sm">
          {parsed.contracts.map((c) => (
            <li key={c.fileHash} className="border rounded-md px-3 py-2.5">
              <div className="font-medium">{c.filename}</div>
              <div className="text-xs text-muted-foreground mt-0.5 grid grid-cols-2 gap-1">
                <span>Template: <strong>{c.templateType}</strong></span>
                <span>Confidence: <strong className={c.extractionConfidence < 0.6 ? 'text-status-expired' : ''}>{Math.round(c.extractionConfidence * 100)}%</strong></span>
                <span>Iqama: <strong>{c.identityNumber ?? '—'}</strong></span>
                <span>Dates: {c.startDate ?? '—'} → {c.endDate ?? '—'}</span>
                <span>Name: <strong>{c.fullName ?? '—'}</strong></span>
                <span>Job title: <strong>{c.jobTitle ?? '—'}</strong></span>
              </div>
              {c.missingFields.length > 0 && (
                <div className="mt-1 text-xs text-status-expiring">
                  Missing: {c.missingFields.join(', ')}
                </div>
              )}
              {c.warnings.length > 0 && (
                <div className="mt-1 text-xs text-status-expiring">{c.warnings.join(' · ')}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function R2StatusBlock({ r2 }: { r2: R2State }) {
  if (r2.kind === 'idle') return null;
  if (r2.kind === 'uploading') {
    return (
      <div className="rounded-md border border-status-info/30 bg-status-info-soft text-status-info px-3 py-2 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Uploading raw file to private R2…
      </div>
    );
  }
  if (r2.kind === 'stored') {
    return (
      <div className="rounded-md border border-status-active/30 bg-status-active-soft text-status-active px-3 py-2 text-sm flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Raw file stored in R2
        {r2.r2ObjectKey && (
          <span className="ml-1 font-mono text-[11px] text-status-active/80 truncate max-w-[200px]">
            ({r2.r2ObjectKey})
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-status-expired/30 bg-status-expired-soft text-status-expired px-3 py-2 text-sm flex items-center gap-2">
      <XCircle className="h-4 w-4" /> R2 upload failed — {r2.message}
    </div>
  );
}

function StepPreview({ dryRun, r2 }: { dryRun: ImportDryRunResponse | null; r2: R2State }) {
  if (!dryRun) return <p className="text-sm text-muted-foreground">No preview yet.</p>;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Preview</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Job <span className="font-mono tabular text-xs">{dryRun.jobId}</span> · resolved against current DB. No target tables mutated.
        </p>
      </div>
      <R2StatusBlock r2={r2} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PreviewStat label="Created" value={dryRun.counts.created} tone="active" />
        <PreviewStat label="Updated" value={dryRun.counts.updated} tone="info" />
        <PreviewStat label="Skipped" value={dryRun.counts.skipped} tone="default" />
        <PreviewStat label="Review"  value={dryRun.counts.review} tone="expiring" />
        <PreviewStat label="Errors"  value={dryRun.counts.error} tone={dryRun.counts.error > 0 ? 'expired' : 'default'} />
      </div>
      <div className="border rounded-md max-h-72 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Identity</th>
              <th className="text-left px-3 py-2">Action</th>
              <th className="text-left px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {dryRun.items.map((it) => (
              <tr key={it.rowIndex} className="border-t">
                <td className="px-3 py-2 tabular text-xs">{it.rowIndex + 1}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.identityNumber ?? '—'}</td>
                <td className="px-3 py-2"><ActionPill action={it.resolvedAction} /></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {it.diff
                    ? Object.entries(it.diff)
                        .map(([k, v]) => `${k}: ${String(v.from ?? '∅')} → ${String(v.to ?? '∅')}`)
                        .join(', ')
                    : it.reason ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepReview({ dryRun }: { dryRun: ImportDryRunResponse | null }) {
  if (!dryRun) return null;
  const reviewItems = dryRun.items.filter((i) => i.resolvedAction === 'review');
  if (reviewItems.length === 0) {
    return (
      <div className="rounded-md border border-status-active/30 bg-status-active-soft px-4 py-3 text-sm text-status-active">
        No conflicts — every row is ready to commit.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-medium">Review needed</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {reviewItems.length} row{reviewItems.length === 1 ? '' : 's'} flagged. They'll be added to the global review queue when you commit; resolve them on the Review Queue page.
        </p>
      </div>
      <ul className="space-y-2">
        {reviewItems.map((it) => (
          <li key={it.rowIndex} className="border rounded-md px-3 py-2.5">
            <div className="text-sm font-medium">Row {it.rowIndex + 1} · {it.identityNumber ?? '(no identity)'}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{it.reason ?? 'review'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCommit({
  dryRun,
  commit,
  isAdmin,
  r2,
  onCommit,
  loading,
}: {
  dryRun: ImportDryRunResponse | null;
  commit: ImportCommitResponse | null;
  isAdmin: boolean;
  r2: R2State;
  onCommit: () => void;
  loading: boolean;
}) {
  if (!dryRun) return null;
  const rawStored = r2.kind === 'stored';
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Ready to commit</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Applies <strong>create</strong> and <strong>update</strong> rows. <strong>Review</strong> rows go to the global review queue. <strong>Skip</strong> and <strong>error</strong> rows are not executed.
        </p>
      </div>

      <R2StatusBlock r2={r2} />

      {!isAdmin && (
        <div className="rounded-md border border-status-expiring/30 bg-status-expiring-soft px-4 py-3 text-sm text-status-expiring flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-medium">Admin sign-in required</div>
            <div className="text-xs">Only users with the <strong>admin</strong> role can commit imports. Server-side endpoints will return 403 otherwise.</div>
          </div>
        </div>
      )}

      {isAdmin && !rawStored && (
        <div className="rounded-md border border-status-expiring/30 bg-status-expiring-soft px-4 py-3 text-sm text-status-expiring flex items-start gap-2">
          <Cloud className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-medium">Raw file not stored in R2</div>
            <div className="text-xs">Go back to Validate and run the dry-run again — the raw bytes must be persisted in the private R2 bucket before commit is allowed (production policy).</div>
          </div>
        </div>
      )}

      {commit ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <PreviewStat label="Created" value={commit.counts.created} tone="active" />
          <PreviewStat label="Updated" value={commit.counts.updated} tone="info" />
          <PreviewStat label="Skipped" value={commit.counts.skipped} tone="default" />
          <PreviewStat label="Review"  value={commit.counts.review} tone="expiring" />
          <PreviewStat label="Errors"  value={commit.counts.error} tone={commit.counts.error > 0 ? 'expired' : 'default'} />
        </div>
      ) : (
        <Progress value={loading ? 60 : 0} />
      )}

      {!commit && (
        <Button onClick={onCommit} disabled={!isAdmin || !rawStored || loading}>
          {loading ? 'Committing…' : 'Commit import'}
        </Button>
      )}

      {commit && (
        <div
          className={cn(
            'rounded-md border px-4 py-3 text-sm',
            commit.status === 'committed'
              ? 'border-status-active/30 bg-status-active-soft text-status-active'
              : 'border-destructive/30 bg-destructive/5 text-destructive',
          )}
        >
          {commit.alreadyCommitted
            ? 'Job was already committed — counts above are the persisted result.'
            : commit.status === 'committed'
              ? 'Committed. Dashboard will refresh automatically.'
              : 'Commit failed. See per-row error messages on the Admin · Audit page.'}
        </div>
      )}
    </div>
  );
}

function ActionPill({ action }: { action: ImportDryRunResponse['items'][number]['resolvedAction'] }) {
  const tone =
    action === 'create' ? 'active'
    : action === 'update' ? 'info'
    : action === 'review' ? 'expiring'
    : action === 'error' ? 'expired'
    : 'missing';
  return <StatusBadge status={tone} label={action} />;
}

function PreviewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'active' | 'expiring' | 'expired' | 'info' | 'default';
}) {
  const TONE: Record<string, string> = {
    active: 'bg-status-active-soft text-status-active',
    expiring: 'bg-status-expiring-soft text-status-expiring',
    expired: 'bg-status-expired-soft text-status-expired',
    info: 'bg-status-info-soft text-status-info',
    default: 'bg-muted text-muted-foreground',
  };
  return (
    <div className={cn('rounded-md p-3', TONE[tone])}>
      <div className="text-xs uppercase tracking-wide font-medium">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
    </div>
  );
}
