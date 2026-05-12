/**
 * Phase 11 — manual Create Worker / Employee form.
 *
 * Form rules:
 *   - identityNumber (Iqama) is the only required field; it is the
 *     primary match key.
 *   - If the entered identity already exists, the server returns
 *     `existing: true` and the existing employee row. The modal then
 *     navigates the user to the existing profile instead of creating a
 *     duplicate; the form fields are NOT used to update the existing row
 *     (admin can edit via the per-employee edit dialog).
 *   - employeeNumber is secondary / history-only; the server appends to
 *     `employee_number_history`, never stores it on `employees`.
 *
 * No optimistic UI: invalidation on success is enough; the Employees
 * list refetches and the new row appears.
 */
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Button } from '@/components/ui/button';
import { useCreateEmployeeManual } from '@/lib/api/hooks';
import { employeeRoute } from '@/lib/routes';
import type { EmployeeManualCreateRequest } from '@shared/api-contract';

const EMPTY: EmployeeManualCreateRequest = {
  identityNumber: '',
  fullNameArabic: '',
  fullName: '',
  employeeNumber: '',
  jobTitle: '',
  department: '',
  mobile: '',
  nationality: '',
  status: 'active',
  notes: '',
};

export function CreateEmployeeModal({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const mut = useCreateEmployeeManual();
  const [form, setForm] = React.useState<EmployeeManualCreateRequest>(EMPTY);
  const [duplicate, setDuplicate] = React.useState<{ id: string; fullName: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setDuplicate(null);
    }
  }, [open]);

  function update<K extends keyof EmployeeManualCreateRequest>(
    k: K,
    v: EmployeeManualCreateRequest[K],
  ) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    const identity = form.identityNumber.trim();
    if (!identity) {
      toast.error('Identity / Iqama is required');
      return;
    }
    // Send only the non-empty fields so the server's null defaults stay
    // null instead of empty strings (mobile = '' would write '' over a
    // real number on a later edit — see EmployeePatchRequest semantics).
    const payload: EmployeeManualCreateRequest = {
      identityNumber: identity,
      ...(form.fullName?.trim() ? { fullName: form.fullName.trim() } : {}),
      ...(form.fullNameArabic?.trim() ? { fullNameArabic: form.fullNameArabic.trim() } : {}),
      ...(form.employeeNumber?.trim() ? { employeeNumber: form.employeeNumber.trim() } : {}),
      ...(form.jobTitle?.trim() ? { jobTitle: form.jobTitle.trim() } : {}),
      ...(form.department?.trim() ? { department: form.department.trim() } : {}),
      ...(form.mobile?.trim() ? { mobile: form.mobile.trim() } : {}),
      ...(form.nationality?.trim() ? { nationality: form.nationality.trim() } : {}),
      ...(form.notes?.trim() ? { notes: form.notes.trim() } : {}),
      status: form.status ?? 'active',
    };
    try {
      const res = await mut.mutateAsync(payload);
      if (res.existing) {
        // Duplicate guard fired server-side. Show the warning inline and
        // offer a CTA to open the existing profile rather than silently
        // re-using the form.
        setDuplicate({ id: res.employee.id, fullName: res.employee.fullName });
        toast.warning('Identity already exists', {
          description: `${res.employee.fullName || res.employee.id} already has a record. Open the existing profile instead of creating a duplicate.`,
        });
        return;
      }
      toast.success('Employee created', {
        description: `${res.employee.fullName || res.employee.id} added.`,
      });
      onOpenChange(false);
      navigate(employeeRoute(res.employee.id));
    } catch (err) {
      toast.error('Could not create employee', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  function openExisting() {
    if (!duplicate) return;
    onOpenChange(false);
    navigate(employeeRoute(duplicate.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create Worker / Employee</DialogTitle>
          <DialogDescription>
            Identity / Iqama is the primary match key. If it already exists we
            won&apos;t create a duplicate — instead we&apos;ll open the existing
            profile.
          </DialogDescription>
        </DialogHeader>

        {duplicate ? (
          <div className="rounded-md border border-status-expiring/50 bg-status-expiring-soft px-4 py-3 text-sm">
            <div className="font-medium text-status-expiring">
              Identity already exists
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A worker with identity <span className="font-mono">{form.identityNumber}</span>{' '}
              is already on file as <span className="font-medium">{duplicate.fullName}</span>.
              Click below to open the existing profile.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={openExisting}>Open existing profile</Button>
              <Button size="sm" variant="outline" onClick={() => setDuplicate(null)}>
                Try a different identity
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Identity / Iqama <span className="text-status-expired">*</span></Label>
            <Input
              value={form.identityNumber}
              onChange={(e) => update('identityNumber', e.target.value)}
              placeholder="2xxxxxxxxx"
              autoFocus
              disabled={mut.isPending}
            />
          </div>
          <div className="col-span-2">
            <Label>Employee name (Arabic)</Label>
            <Input
              value={form.fullNameArabic ?? ''}
              onChange={(e) => update('fullNameArabic', e.target.value)}
              dir="rtl"
              placeholder="الاسم الكامل"
              disabled={mut.isPending}
            />
          </div>
          <div className="col-span-2">
            <Label>Employee name (English)</Label>
            <Input
              value={form.fullName ?? ''}
              onChange={(e) => update('fullName', e.target.value)}
              placeholder="Full name"
              disabled={mut.isPending}
            />
          </div>
          <div>
            <Label>Employee number</Label>
            <Input
              value={form.employeeNumber ?? ''}
              onChange={(e) => update('employeeNumber', e.target.value)}
              placeholder="optional"
              disabled={mut.isPending}
            />
          </div>
          <div>
            <Label>Mobile</Label>
            <Input
              value={form.mobile ?? ''}
              onChange={(e) => update('mobile', e.target.value)}
              placeholder="+9665xxxxxxxx"
              disabled={mut.isPending}
            />
          </div>
          <div>
            <Label>Job title / profession</Label>
            <Input
              value={form.jobTitle ?? ''}
              onChange={(e) => update('jobTitle', e.target.value)}
              disabled={mut.isPending}
            />
          </div>
          <div>
            <Label>Department / project / site</Label>
            <Input
              value={form.department ?? ''}
              onChange={(e) => update('department', e.target.value)}
              disabled={mut.isPending}
            />
          </div>
          <div>
            <Label>Nationality</Label>
            <Input
              value={form.nationality ?? ''}
              onChange={(e) => update('nationality', e.target.value)}
              disabled={mut.isPending}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status ?? 'active'}
              onValueChange={(v) => update('status', v as 'active' | 'inactive')}
              disabled={mut.isPending}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
              disabled={mut.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mut.isPending || !form.identityNumber.trim()}>
            {mut.isPending ? 'Creating…' : 'Create employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
