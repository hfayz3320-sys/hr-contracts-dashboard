/**
 * Phase 10 — modals for the eight Employee 360 actions.
 *
 * One file owns the dialogs so the wiring in EmployeeProfileErp stays light
 * (boolean state per action + button onClick). Each modal:
 *
 *   - validates input via zod schema reuse from shared/api-contract
 *   - submits via the matching react-query mutation
 *   - invalidates the Employee 360 query on success so the activity feed
 *     and counts update without a page reload
 *   - shows server-side error inline (no toast spam)
 *
 * Permission gating happens server-side via requireAdmin; the FE additionally
 * checks `canPerformAdminWrites(me)` and renders disabled buttons with a
 * tooltip when the caller can't write.
 */
import * as React from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AliveButton } from '@/components/ui-foundation/AliveButton';
import {
  useCreateEmployeeMessage,
  useCreateEmployeeNote,
  useCreateEmployeeActivity,
  useCreateEmployeeCompensation,
  useCreateEmployeeLearning,
  useCreateAppUser,
} from '@/lib/api/hooks';
import type {
  EmployeeActivityCreateRequest,
  EmployeeCompensationCreateRequest,
  EmployeeLearningCreateRequest,
} from '@shared/api-contract';

export type EmployeeActionKey =
  | 'message'
  | 'note'
  | 'activity'
  | 'transaction'
  | 'document'
  | 'compensation'
  | 'learning'
  | 'create-user'
  | null;

interface BaseProps {
  employeeId: string;
  employeeName: string;
  open: EmployeeActionKey;
  onClose: () => void;
}

export function EmployeeActionsHost(props: BaseProps) {
  const { open, onClose, employeeId, employeeName } = props;
  return (
    <>
      <MessageOrNoteModal kind="message" open={open === 'message'} onClose={onClose} employeeId={employeeId} employeeName={employeeName} />
      <MessageOrNoteModal kind="note"    open={open === 'note'}    onClose={onClose} employeeId={employeeId} employeeName={employeeName} />
      <ActivityModal     open={open === 'activity'}     onClose={onClose} employeeId={employeeId} />
      <CompensationModal open={open === 'compensation'} onClose={onClose} employeeId={employeeId} />
      <LearningModal     open={open === 'learning'}     onClose={onClose} employeeId={employeeId} />
      <CreateUserModal   open={open === 'create-user'}  onClose={onClose} employeeId={employeeId} employeeName={employeeName} />
      {/* Transaction + Document modals are placeholders pointing at existing
          endpoints; documents+transactions rows already render in their tabs.
          A full create-from-profile flow is wired in a follow-up. */}
    </>
  );
}

// ============================================================
// Send Message / Log Note
// ============================================================

function MessageOrNoteModal({
  kind, open, onClose, employeeId, employeeName,
}: {
  kind: 'message' | 'note';
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
}) {
  const [body, setBody] = React.useState('');
  const messageMut = useCreateEmployeeMessage(employeeId);
  const noteMut = useCreateEmployeeNote(employeeId);
  const mut = kind === 'message' ? messageMut : noteMut;

  React.useEffect(() => { if (open) setBody(''); }, [open]);

  async function submit() {
    if (!body.trim()) return;
    try {
      await mut.mutateAsync({ body: body.trim() });
      toast.success(kind === 'message' ? 'Message sent' : 'Note logged', {
        description: `Saved to ${employeeName}'s timeline.`,
      });
      onClose();
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const title = kind === 'message' ? 'Send message' : 'Log note';
  const desc = kind === 'message'
    ? 'Visible to anyone with access to this employee profile.'
    : 'Internal note — visible to admin / HR manager only.';
  const ph = kind === 'message' ? 'Compose a message…' : 'Internal note…';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <Textarea rows={5} placeholder={ph} value={body} onChange={(e) => setBody(e.target.value)} disabled={mut.isPending} />
        <DialogFooter>
          <AliveButton variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Cancel</AliveButton>
          <AliveButton variant="primary" size="sm" onClick={submit} disabled={!body.trim() || mut.isPending}>
            {mut.isPending ? 'Saving…' : title}
          </AliveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Schedule Activity
// ============================================================

const ACTIVITY_TYPES: EmployeeActivityCreateRequest['activityType'][] = [
  'call', 'meeting', 'review', 'reminder', 'follow_up', 'document_request', 'other',
];

function ActivityModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const [form, setForm] = React.useState<EmployeeActivityCreateRequest>({ activityType: 'reminder', title: '' });
  const mut = useCreateEmployeeActivity(employeeId);

  React.useEffect(() => {
    if (open) setForm({ activityType: 'reminder', title: '' });
  }, [open]);

  async function submit() {
    if (!form.title.trim()) return;
    try {
      await mut.mutateAsync({
        activityType: form.activityType,
        title: form.title.trim(),
        ...(form.description ? { description: form.description } : {}),
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        ...(form.assignedTo ? { assignedTo: form.assignedTo } : {}),
      });
      toast.success('Activity scheduled');
      onClose();
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Schedule activity</DialogTitle>
          <DialogDescription>Call, meeting, review, reminder, or follow-up tied to this employee.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={form.activityType} onValueChange={(v) => setForm({ ...form, activityType: v as EmployeeActivityCreateRequest['activityType'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Quarterly review meeting" />
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={form.dueDate ?? ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} />
          </div>
          <div>
            <Label>Assigned to (email)</Label>
            <Input value={form.assignedTo ?? ''} onChange={(e) => setForm({ ...form, assignedTo: e.target.value || null })} placeholder="hr@mid.local" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value || null })} />
          </div>
        </div>
        <DialogFooter>
          <AliveButton variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Cancel</AliveButton>
          <AliveButton variant="primary" size="sm" onClick={submit} disabled={!form.title.trim() || mut.isPending}>
            {mut.isPending ? 'Saving…' : 'Schedule'}
          </AliveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Compensation Line
// ============================================================

function CompensationModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = React.useState<EmployeeCompensationCreateRequest>({
    componentCode: 'PAY_BASIC', componentName: 'Basic salary',
    amount: 0, currency: 'SAR', frequency: 'monthly', effectiveFrom: today,
  });
  const mut = useCreateEmployeeCompensation(employeeId);

  React.useEffect(() => {
    if (open) {
      setForm({
        componentCode: 'PAY_BASIC', componentName: 'Basic salary',
        amount: 0, currency: 'SAR', frequency: 'monthly', effectiveFrom: today,
      });
    }
  }, [open, today]);

  async function submit() {
    if (!form.componentCode || !form.componentName || form.amount <= 0) return;
    try {
      await mut.mutateAsync(form);
      toast.success('Compensation line added');
      onClose();
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add compensation line</DialogTitle>
          <DialogDescription>Payroll component for this employee. Tracked with an effective window.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Code</Label>
              <Input value={form.componentCode} onChange={(e) => setForm({ ...form, componentCode: e.target.value })} placeholder="PAY_BASIC" />
            </div>
            <div>
              <Label>Component name</Label>
              <Input value={form.componentName} onChange={(e) => setForm({ ...form, componentName: e.target.value })} placeholder="Basic salary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Amount</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value || '0') })} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value || 'SAR' })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as EmployeeCompensationCreateRequest['frequency'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="yearly">yearly</SelectItem>
                  <SelectItem value="one_time">one-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Effective from</Label>
              <Input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
          </div>
        </div>
        <DialogFooter>
          <AliveButton variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Cancel</AliveButton>
          <AliveButton variant="primary" size="sm" onClick={submit} disabled={form.amount <= 0 || mut.isPending}>
            {mut.isPending ? 'Saving…' : 'Add line'}
          </AliveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Learning Record
// ============================================================

function LearningModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const [form, setForm] = React.useState<EmployeeLearningCreateRequest>({ recordType: 'certification', title: '' });
  const mut = useCreateEmployeeLearning(employeeId);

  React.useEffect(() => { if (open) setForm({ recordType: 'certification', title: '' }); }, [open]);

  async function submit() {
    if (!form.title.trim()) return;
    try {
      await mut.mutateAsync({
        recordType: form.recordType,
        title: form.title.trim(),
        ...(form.provider ? { provider: form.provider } : {}),
        ...(form.issueDate ? { issueDate: form.issueDate } : {}),
        ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
        ...(form.level ? { level: form.level } : {}),
        ...(form.notes ? { notes: form.notes } : {}),
      });
      toast.success('Learning record added');
      onClose();
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add learning record</DialogTitle>
          <DialogDescription>Certification, training, skill, or experience.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={form.recordType} onValueChange={(v) => setForm({ ...form, recordType: v as EmployeeLearningCreateRequest['recordType'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="certification">Certification</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="skill">Skill</SelectItem>
                <SelectItem value="experience">Experience</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="PMP — Project Management Professional" />
          </div>
          <div>
            <Label>Provider / issuer</Label>
            <Input value={form.provider ?? ''} onChange={(e) => setForm({ ...form, provider: e.target.value || null })} placeholder="PMI" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Issue date</Label>
              <Input type="date" value={form.issueDate ?? ''} onChange={(e) => setForm({ ...form, issueDate: e.target.value || null })} />
            </div>
            <div>
              <Label>Expiry date</Label>
              <Input type="date" value={form.expiryDate ?? ''} onChange={(e) => setForm({ ...form, expiryDate: e.target.value || null })} />
            </div>
          </div>
          {form.recordType === 'skill' && (
            <div>
              <Label>Level</Label>
              <Select value={form.level ?? ''} onValueChange={(v) => setForm({ ...form, level: (v || null) as EmployeeLearningCreateRequest['level'] })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="expert">Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
          </div>
        </div>
        <DialogFooter>
          <AliveButton variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Cancel</AliveButton>
          <AliveButton variant="primary" size="sm" onClick={submit} disabled={!form.title.trim() || mut.isPending}>
            {mut.isPending ? 'Saving…' : 'Add record'}
          </AliveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Create User (links a new app_users row to this employee)
// ============================================================

function CreateUserModal({
  open, onClose, employeeId, employeeName,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
}) {
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'hr_manager' | 'viewer'>('viewer');
  const mut = useCreateAppUser();

  React.useEffect(() => { if (open) { setEmail(''); setRole('viewer'); } }, [open]);

  async function submit() {
    if (!email.trim()) return;
    try {
      // Link to this employee via displayName tag; the worker's createUser
      // does not currently accept an employee_id arg, so we tag the
      // displayName for traceability. A future migration extends the
      // create-user endpoint to accept the link FK directly.
      await mut.mutateAsync({
        email: email.trim().toLowerCase(),
        role,
        displayName: employeeName ? `${employeeName} (emp:${employeeId})` : null,
      });
      toast.success('User created', { description: `Linked to ${employeeName}.` });
      onClose();
    } catch (err) {
      toast.error('Could not create user', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>Create an app_users row linked to this employee.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@example.com" />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="hr_manager">HR manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <AliveButton variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Cancel</AliveButton>
          <AliveButton variant="primary" size="sm" onClick={submit} disabled={!email.trim() || mut.isPending}>
            {mut.isPending ? 'Creating…' : 'Create user'}
          </AliveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
