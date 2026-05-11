/**
 * Review Queue page — admin operational workflow.
 *
 * Each item has a "Review" action that opens a detail dialog showing the
 * full extracted payload (template, confidence, missing fields, redacted
 * raw text snippet for PDFs), and lets the admin:
 *
 *   - Approve  → POST /api/review-queue/:id/approve (commits corrected fields
 *                to the target entity table; for contracts/insurance, requires
 *                a linkedTargetId so we know which existing row to mutate).
 *   - Dismiss  → POST /api/review-queue/:id/dismiss (soft-archive, no entity change).
 *   - Reject   → POST /api/review-queue/:id/reject (dismiss with required reason).
 *
 * Filter chips: All / Open / Dismissed / Resolved.
 * Export downloads the currently filtered set as XLSX.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useDataset } from '@/app/dataset-context';
import { formatDateTime } from '@/lib/dates';
import { reviewReasonLabels, type ReviewItem, type ReviewReason } from '@/types/domain';
import {
  useReviewDismiss, useReviewApprove, useReviewReject,
} from '@/lib/api/hooks';
import { useMe } from '@/lib/api/use-me';
import { ExportButton } from '@/components/common/ExportButton';
import { EmployeeSearchPicker } from '@/components/common/EmployeeSearchPicker';
import type { Employee } from '@/types/domain';

type StatusFilter = 'open' | 'all' | 'dismissed' | 'resolved';

const REVIEW_EXPORT_COLUMNS = [
  { header: 'Reason', value: (r: ReviewItem) => reviewReasonLabels[r.reason] ?? r.reason },
  { header: 'Entity', value: (r: ReviewItem) => r.entity },
  { header: 'Description', value: (r: ReviewItem) => r.description },
  { header: 'Details', value: (r: ReviewItem) => r.details },
  { header: 'Status', value: (r: ReviewItem) => r.status },
  { header: 'Created At', value: (r: ReviewItem) => r.createdAt, format: 'date' as const },
  { header: 'Import Job', value: (r: ReviewItem) => r.importJobId ?? '' },
];

export function ReviewQueuePage() {
  const { reviewItems } = useDataset();
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [reviewing, setReviewing] = useState<ReviewItem | null>(null);

  const approve = useReviewApprove();
  const dismiss = useReviewDismiss();
  const reject = useReviewReject();

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return reviewItems;
    return reviewItems.filter((r) => r.status === statusFilter);
  }, [reviewItems, statusFilter]);

  const counts = useMemo(() => ({
    open: reviewItems.filter((r) => r.status === 'open').length,
    resolved: reviewItems.filter((r) => r.status === 'resolved').length,
    dismissed: reviewItems.filter((r) => r.status === 'dismissed').length,
    all: reviewItems.length,
  }), [reviewItems]);

  const grouped = useMemo(() => {
    const map = new Map<ReviewReason, ReviewItem[]>();
    for (const r of filtered) {
      const list = map.get(r.reason) ?? [];
      list.push(r);
      map.set(r.reason, list);
    }
    return map;
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="Review Queue"
        description={`${counts.open} open · ${counts.resolved} resolved · ${counts.dismissed} dismissed`}
        actions={
          <ExportButton
            filename={`review-queue-${statusFilter}`}
            sheet="Review Queue"
            rows={filtered}
            columns={REVIEW_EXPORT_COLUMNS}
            summary={[
              { label: 'Status filter', value: statusFilter },
              { label: 'Rows exported', value: filtered.length },
              { label: 'Total review items (all)', value: counts.all },
              { label: 'Open', value: counts.open },
              { label: 'Resolved', value: counts.resolved },
              { label: 'Dismissed', value: counts.dismissed },
            ]}
          />
        }
      />

      <div className="flex items-center gap-2 mb-4">
        {(['open', 'all', 'resolved', 'dismissed'] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="capitalize"
          >
            {s} <Badge variant="secondary" className="ml-2">{counts[s]}</Badge>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="h-12 w-12 mx-auto rounded-full bg-status-active-soft flex items-center justify-center text-status-active">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-medium">No items in this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch filter or import new data to populate the queue.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([reason, items]) => (
            <Card key={reason}>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  {reviewReasonLabels[reason] ?? reason}
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {items.map((item) => (
                    <li key={item.id} className="px-6 py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.description}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">{item.details}</div>
                        <div className="mt-1 text-xs text-muted-foreground tabular">
                          {formatDateTime(item.createdAt)}
                          {item.importJobId && ` · ${item.importJobId.slice(0, 16)}…`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge
                          status={
                            item.status === 'open' ? 'expiring'
                            : item.status === 'resolved' ? 'active'
                            : 'missing'
                          }
                          label={item.status}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewing(item)}
                          disabled={!isAdmin && item.status !== 'open'}
                        >
                          {item.status === 'open' ? 'Review' : 'View'}
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ReviewDetailDialog
        item={reviewing}
        onClose={() => setReviewing(null)}
        isAdmin={isAdmin}
        onApprove={async (id, correctedFields, note) => {
          await approve.mutateAsync({ id, payload: { correctedFields, ...(note ? { note } : {}) } });
        }}
        onDismiss={async (id) => {
          await dismiss.mutateAsync({ id, payload: {} });
        }}
        onReject={async (id, reason) => {
          await reject.mutateAsync({ id, payload: { reason } });
        }}
      />
    </div>
  );
}

interface ReviewDetailDialogProps {
  item: ReviewItem | null;
  onClose: () => void;
  isAdmin: boolean;
  onApprove: (id: string, correctedFields: Record<string, string>, note?: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}

function ReviewDetailDialog({ item, onClose, isAdmin, onApprove, onDismiss, onReject }: ReviewDetailDialogProps) {
  // Build initial corrected fields from any payload the item carries.
  // The payload is JSON serialised at import time (e.g. PDF extraction
  // result with templateType / confidence / missingFields / rawTextSnippet).
  const payload = useMemo<Record<string, unknown> | null>(() => {
    if (!item) return null;
    const raw = (item as unknown as { payload?: string | Record<string, unknown> }).payload;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
    }
    return raw;
  }, [item]);

  // Per-entity field map for the corrected-fields form.
  // `linkedTargetId` is special — it's resolved via the EmployeeSearchPicker
  // rather than a free-text input, so it's NOT in this list.
  const entityFields = useMemo(() => {
    if (!item) return [];
    if (item.entity === 'contract') {
      return ['identityNumber', 'contractType', 'startDate', 'endDate', 'notes'];
    }
    if (item.entity === 'insurance') {
      return ['identityNumber', 'policyNumber', 'memberNumber', 'provider', 'startDate', 'endDate'];
    }
    return ['identityNumber', 'fullName', 'department', 'jobTitle', 'nationality', 'hireDate'];
  }, [item]);

  // Existing contracts / insurance rows linked by identity — used to
  // pre-populate the linkedTargetId for contract/insurance reviews.
  const { contracts, insurance } = useDataset();

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'dismiss' | 'reject' | null>(null);

  // Reset state when item changes.
  useMemo(() => {
    if (!item) return;
    const init: Record<string, string> = {};
    const row = (payload?.row as Record<string, unknown> | undefined) ?? payload ?? {};
    for (const f of entityFields) {
      const v = (row as Record<string, unknown>)[f];
      init[f] = typeof v === 'string' ? v : v == null ? '' : String(v);
    }
    setDraft(init);
    setNote('');
    setRejectReason('');
    setShowReject(false);
  }, [item, payload, entityFields]);

  if (!item) return null;

  const filename = (payload?.filename as string | undefined) ?? '—';
  const templateType = (payload?.templateType as string | undefined) ?? null;
  const confidence = typeof payload?.extractionConfidence === 'number'
    ? `${Math.round((payload.extractionConfidence as number) * 100)}%` : null;
  const missingFields = Array.isArray(payload?.missingFields) ? (payload.missingFields as string[]) : [];
  const rawSnippet = typeof payload?.rawTextSnippet === 'string' ? payload.rawTextSnippet : null;
  const canAct = isAdmin && item.status === 'open';

  async function handleApprove() {
    if (!item) return;
    const trimmed: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v?.trim()) trimmed[k] = v.trim();
    }
    setBusy('approve');
    try {
      await onApprove(item.id, trimmed, note.trim() || undefined);
      toast.success('Approved');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed');
    } finally { setBusy(null); }
  }

  async function handleDismiss() {
    if (!item) return;
    setBusy('dismiss');
    try {
      await onDismiss(item.id);
      toast.success('Dismissed');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dismiss failed');
    } finally { setBusy(null); }
  }

  async function handleReject() {
    if (!item) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 2) {
      toast.error('Reject reason is required (min 2 chars)');
      return;
    }
    setBusy('reject');
    try {
      await onReject(item.id, rejectReason.trim());
      toast.success('Rejected');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed');
    } finally { setBusy(null); }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-status-expiring" />
            {reviewReasonLabels[item.reason] ?? item.reason}
            <Badge variant="outline" className="capitalize">{item.entity}</Badge>
          </DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-xs border rounded-md p-3 bg-muted/30">
          <div><strong>Status:</strong> {item.status}</div>
          <div><strong>Created:</strong> {formatDateTime(item.createdAt)}</div>
          <div><strong>Source file:</strong> {filename}</div>
          <div><strong>Template:</strong> {templateType ?? '—'}</div>
          <div><strong>Confidence:</strong> {confidence ?? '—'}</div>
          <div><strong>Import job:</strong> {item.importJobId ?? '—'}</div>
        </div>

        {missingFields.length > 0 && (
          <div className="text-xs rounded-md border border-status-expiring/30 bg-status-expiring-soft text-status-expiring px-3 py-2">
            <strong>Missing fields:</strong> {missingFields.join(', ')}
          </div>
        )}

        {rawSnippet && (
          <details className="text-xs border rounded-md">
            <summary className="cursor-pointer px-3 py-2 select-none">
              Raw extracted text (redacted, capped)
            </summary>
            <pre className="px-3 py-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px]">{rawSnippet}</pre>
          </details>
        )}

        {canAct && (
          <>
            <div className="text-sm font-medium mt-2">Corrected fields</div>

            {/* Employee picker — replaces the free-text linkedTargetId. */}
            {item.entity !== 'employee' && (
              <EmployeeSearchPicker
                value={draft.linkedTargetId ?? ''}
                onChange={(id: string, emp: Employee | null) => {
                  setDraft((d) => {
                    const next: Record<string, string> = { ...d, linkedTargetId: id };
                    // Auto-fill identityNumber from the picked employee.
                    if (emp) next.identityNumber = emp.identityNumber;
                    // For contracts, also pre-select an existing contract row to update.
                    if (emp && item.entity === 'contract' && !next.linkedTargetId) {
                      const c = contracts.find((c) => c.employeeId === emp.id);
                      if (c) next.linkedTargetId = c.id;
                    }
                    if (emp && item.entity === 'insurance' && !next.linkedTargetId) {
                      const ins = insurance.find((i) => i.employeeId === emp.id);
                      if (ins) next.linkedTargetId = ins.id;
                    }
                    return next;
                  });
                }}
                label="Link to existing employee"
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              {entityFields.map((f) => (
                <div key={f} className="space-y-1">
                  <Label htmlFor={`fix-${f}`} className="text-xs capitalize">{f}</Label>
                  <Input
                    id={`fix-${f}`}
                    value={draft[f] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="fix-note" className="text-xs">Note (optional)</Label>
              <Input
                id="fix-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why approving"
              />
            </div>

            {showReject && (
              <div className="space-y-1 border-t pt-3">
                <Label htmlFor="reject-reason" className="text-xs text-status-expired">Reject reason <span className="text-status-expired">*</span></Label>
                <Input
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Required reason for rejection"
                />
              </div>
            )}
          </>
        )}

        {!canAct && (
          <div className="text-xs text-muted-foreground italic">
            {item.status !== 'open'
              ? `Read-only — this item is already ${item.status}.`
              : 'Read-only — admin role required for actions.'}
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {canAct && (
            <>
              <Button variant="ghost" onClick={onClose} disabled={!!busy}>Cancel</Button>
              <Button
                variant="outline"
                onClick={() => setShowReject((v) => !v)}
                disabled={!!busy}
                className="text-status-expired hover:text-status-expired"
              >
                {showReject ? 'Cancel reject' : 'Reject…'}
              </Button>
              {showReject ? (
                <Button onClick={handleReject} disabled={!!busy} className="bg-status-expired hover:bg-status-expired/90">
                  {busy === 'reject' ? 'Rejecting…' : 'Confirm reject'}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleDismiss} disabled={!!busy}>
                    {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
                  </Button>
                  <Button onClick={handleApprove} disabled={!!busy}>
                    {busy === 'approve' ? 'Approving…' : 'Approve'}
                  </Button>
                </>
              )}
            </>
          )}
          {!canAct && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
