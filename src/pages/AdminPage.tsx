import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useDataset } from '@/app/dataset-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/common/StatusBadge';
import { AuditTimeline } from '@/components/common/AuditTimeline';
import { ExportButton } from '@/components/common/ExportButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ShieldCheck } from 'lucide-react';
import { formatDateTime } from '@/lib/dates';
import { reviewReasonLabels } from '@/types/domain';
import type { ImportJob } from '@/types/domain';

const IMPORT_JOBS_EXPORT_COLUMNS = [
  { header: 'Job ID', value: (j: ImportJob) => j.id },
  { header: 'Type', value: (j: ImportJob) => j.type },
  { header: 'Filename', value: (j: ImportJob) => j.filename },
  { header: 'Status', value: (j: ImportJob) => j.status },
  { header: 'Started', value: (j: ImportJob) => j.startedAt, format: 'date' as const },
  { header: 'Finished', value: (j: ImportJob) => j.finishedAt ?? '', format: 'date' as const },
  { header: 'Triggered By', value: (j: ImportJob) => j.triggeredBy },
  { header: 'Created', value: (j: ImportJob) => j.counts.created },
  { header: 'Updated', value: (j: ImportJob) => j.counts.updated },
  { header: 'Skipped', value: (j: ImportJob) => j.counts.skipped },
  { header: 'Review', value: (j: ImportJob) => j.counts.review },
  { header: 'Errors', value: (j: ImportJob) => j.counts.error },
];

export function AdminPage() {
  const { importJobs, sourceFiles, auditEvents, reviewItems } = useDataset();
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const errors = auditEvents.filter((e) => e.status === 'error');
  const openJob = openJobId ? importJobs.find((j) => j.id === openJobId) : null;
  const openJobFiles = openJob ? sourceFiles.filter((f) => f.importJobId === openJob.id) : [];
  const openJobReviews = openJob ? reviewItems.filter((r) => r.importJobId === openJob.id) : [];
  const openJobAudit = openJob ? auditEvents.filter((e) => e.target === openJob.id || (e as { jobId?: string }).jobId === openJob.id) : [];

  return (
    <div>
      <PageHeader
        title="Admin · Audit"
        description="Operational view of imports, source files, audit log, errors, and security checks."
        actions={
          <ExportButton
            filename="import-history"
            sheet="Import Jobs"
            rows={importJobs}
            columns={IMPORT_JOBS_EXPORT_COLUMNS}
            summary={[
              { label: 'Total import jobs', value: importJobs.length },
              { label: 'Committed', value: importJobs.filter((j) => j.status === 'committed').length },
              { label: 'Failed', value: importJobs.filter((j) => j.status === 'failed').length },
              { label: 'Total source files', value: sourceFiles.length },
              { label: 'Audit events', value: auditEvents.length },
            ]}
          />
        }
      />

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Import Jobs</TabsTrigger>
          <TabsTrigger value="files">Source Files</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importJobs.map((j) => (
                    <TableRow
                      key={j.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setOpenJobId(j.id)}
                    >
                      <TableCell>
                        <div className="font-mono text-xs tabular">{j.id}</div>
                        <div className="text-xs text-muted-foreground">{j.filename}</div>
                      </TableCell>
                      <TableCell className="capitalize">{j.type}</TableCell>
                      <TableCell className="tabular text-xs">{formatDateTime(j.startedAt)}</TableCell>
                      <TableCell className="tabular text-xs">{j.finishedAt ? formatDateTime(j.finishedAt) : '—'}</TableCell>
                      <TableCell className="text-right tabular">{j.counts.created}</TableCell>
                      <TableCell className="text-right tabular">{j.counts.updated}</TableCell>
                      <TableCell className="text-right tabular">{j.counts.review}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={
                            j.status === 'committed' ? 'active'
                            : j.status === 'failed' ? 'expired'
                            : j.status === 'running' ? 'info'
                            : 'expiring'
                          }
                          label={j.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hash</TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Job</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceFiles.map((f) => (
                    <TableRow key={f.hash}>
                      <TableCell className="font-mono text-xs tabular">{f.hash}</TableCell>
                      <TableCell>{f.filename}</TableCell>
                      <TableCell className="uppercase text-xs">{f.type}</TableCell>
                      <TableCell className="text-right tabular text-xs">{(f.size / 1024).toFixed(0)} KB</TableCell>
                      <TableCell className="tabular text-xs">{formatDateTime(f.uploadedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{f.importJobId ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardContent className="py-6">
              <AuditTimeline events={auditEvents} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          {errors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No errors recorded.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-6">
                <AuditTimeline events={errors} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-4 md:grid-cols-2">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Private file access</AlertTitle>
              <AlertDescription>
                Contract PDFs will be served only via authenticated API in Phase 3. No public direct
                URLs exist.
              </AlertDescription>
            </Alert>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Build hygiene</AlertTitle>
              <AlertDescription>
                <code>Data/</code> is gitignored and never read by the source. All Phase 1
                fixtures are fully synthetic (anglo names, Iqama IDs prefixed <code>9</code>,
                fictional providers).
              </AlertDescription>
            </Alert>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Admin role enforcement</AlertTitle>
              <AlertDescription>
                All mutation endpoints (imports, edits, user management) use
                <code> requireAdmin</code> on the Worker. JWT verified against
                Cloudflare Access JWKS; <code>X-Dev-Admin-Email</code> rejected
                in production with 400.
              </AlertDescription>
            </Alert>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>UPSERT-by-IdentityNumber</AlertTitle>
              <AlertDescription>
                Import logic must never duplicate persons sharing an Iqama. Designed for Phase 2 with
                review-queue conflict gating.
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={!!openJob} onOpenChange={(o) => !o && setOpenJobId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {openJob && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Import job <span className="font-mono text-sm font-normal">{openJob.id}</span>
                </SheetTitle>
                <SheetDescription>
                  {openJob.filename} · {openJob.type} · triggered by {openJob.triggeredBy}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-5">
                {/* Summary */}
                <Card>
                  <CardContent className="py-4 space-y-2 text-sm">
                    <Row label="Status">
                      <StatusBadge
                        status={
                          openJob.status === 'committed' ? 'active'
                          : openJob.status === 'failed' ? 'expired'
                          : openJob.status === 'running' ? 'info'
                          : 'expiring'
                        }
                        label={openJob.status}
                      />
                    </Row>
                    <Row label="Started"  value={formatDateTime(openJob.startedAt)} />
                    <Row label="Finished" value={openJob.finishedAt ? formatDateTime(openJob.finishedAt) : '—'} />
                    <Row label="Triggered by" value={openJob.triggeredBy} />
                  </CardContent>
                </Card>

                {/* Counts */}
                <div className="grid grid-cols-5 gap-2 text-center">
                  <Stat label="Created" value={openJob.counts.created} tone="active" />
                  <Stat label="Updated" value={openJob.counts.updated} tone="info" />
                  <Stat label="Skipped" value={openJob.counts.skipped} tone="default" />
                  <Stat label="Review"  value={openJob.counts.review} tone="expiring" />
                  <Stat label="Errors"  value={openJob.counts.error} tone={openJob.counts.error > 0 ? 'expired' : 'default'} />
                </div>

                {/* Source files */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Source files ({openJobFiles.length})
                  </div>
                  {openJobFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No source files linked.</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                      {openJobFiles.map((f) => (
                        <li key={f.hash} className="border rounded-md px-3 py-2 flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{f.filename}</div>
                            <div className="text-[11px] text-muted-foreground tabular truncate">{f.hash}</div>
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular shrink-0 ml-2">
                            {f.type.toUpperCase()} · {(f.size / 1024).toFixed(0)} KB
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Review items linked to this import */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Review queue items from this job ({openJobReviews.length})
                  </div>
                  {openJobReviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No review items flagged.</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                      {openJobReviews.map((r) => (
                        <li key={r.id} className="border rounded-md px-3 py-2">
                          <div className="text-sm font-medium truncate">{r.description}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center justify-between mt-0.5">
                            <span className="capitalize">{r.entity} · {reviewReasonLabels[r.reason] ?? r.reason}</span>
                            <StatusBadge
                              status={r.status === 'open' ? 'expiring' : r.status === 'resolved' ? 'active' : 'missing'}
                              label={r.status}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Audit events for this job */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Audit events for this job ({openJobAudit.length})
                  </div>
                  {openJobAudit.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No audit events.</p>
                  ) : (
                    <AuditTimeline events={openJobAudit} />
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm">{children ?? value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'active' | 'info' | 'expiring' | 'expired' | 'default' }) {
  const TONE: Record<string, string> = {
    active: 'bg-status-active-soft text-status-active',
    info: 'bg-status-info-soft text-status-info',
    expiring: 'bg-status-expiring-soft text-status-expiring',
    expired: 'bg-status-expired-soft text-status-expired',
    default: 'bg-muted text-muted-foreground',
  };
  return (
    <div className={`rounded-md p-2.5 ${TONE[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide font-medium">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular">{value}</div>
    </div>
  );
}
