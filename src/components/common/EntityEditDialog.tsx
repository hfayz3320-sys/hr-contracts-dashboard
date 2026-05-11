/**
 * Generic admin edit dialog used by Employees / Insurance / Contracts pages.
 *
 * Pass a record, a field spec, and an async `onSave` (your mutation hook
 * wrapper). The dialog tracks per-field state, validates required fields,
 * disables the Save button when nothing changed, and surfaces errors as a
 * sonner toast.
 *
 * Admin-only by design — the dialog is rendered for any caller, but the
 * backend rejects non-admins with 403, and the underlying mutation hook
 * surfaces that as an error toast.
 */
import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FieldType = 'text' | 'date' | 'select';

export type EntityEditField<TRecord> = {
  /** Field name (becomes the patch key). */
  key: string;
  label: string;
  type?: FieldType;
  /** Default `false`. */
  required?: boolean;
  /** Only for type='select'. */
  options?: Array<{ value: string; label: string }>;
  /** Initial value extractor from the record. */
  initial: (r: TRecord) => string;
  /** Optional: protect this field (admin-only display + edit). */
  adminOnly?: boolean;
  /** Optional help text. */
  hint?: string;
};

export interface EntityEditDialogProps<TRecord> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  record: TRecord | null;
  fields: EntityEditField<TRecord>[];
  /** Returns a patch object; falsy entries are sent verbatim. */
  onSave: (patch: Record<string, string | null>) => Promise<void>;
  saveLabel?: string;
  isAdmin?: boolean;
}

export function EntityEditDialog<TRecord>({
  open,
  onOpenChange,
  title,
  description,
  record,
  fields,
  onSave,
  saveLabel = 'Save',
  isAdmin = false,
}: EntityEditDialogProps<TRecord>) {
  const visibleFields = useMemo(
    () => fields.filter((f) => !f.adminOnly || isAdmin),
    [fields, isAdmin],
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Reset draft when the record changes (or dialog re-opens).
  useEffect(() => {
    if (!record || !open) return;
    const init: Record<string, string> = {};
    for (const f of visibleFields) init[f.key] = f.initial(record) ?? '';
    setDraft(init);
  }, [record, open, visibleFields]);

  if (!record) return null;

  const dirtyFields = visibleFields.filter((f) => draft[f.key] !== f.initial(record));
  const missingRequired = visibleFields.filter((f) => f.required && !draft[f.key]?.trim());

  async function handleSave() {
    if (missingRequired.length > 0) {
      toast.error(`Required: ${missingRequired.map((f) => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      for (const f of dirtyFields) {
        const v = draft[f.key] ?? '';
        patch[f.key] = v === '' ? null : v;
      }
      await onSave(patch);
      toast.success(`${title} saved`);
      onOpenChange(false);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 403) {
        toast.error('Forbidden — admin role required');
      } else {
        toast.error(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2 max-h-[60vh] overflow-y-auto">
          {visibleFields.map((f) => {
            const id = `edit-${f.key}`;
            const value = draft[f.key] ?? '';
            const onChange = (v: string) => setDraft((d) => ({ ...d, [f.key]: v }));
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id}>
                  {f.label}
                  {f.required && <span className="text-destructive ml-1">*</span>}
                  {f.adminOnly && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">(admin)</span>}
                </Label>
                {f.type === 'select' ? (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id={id}>
                      <SelectValue placeholder={`Select ${f.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={f.type === 'date' ? 'date' : 'text'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete="off"
                  />
                )}
                {f.hint && (
                  <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || dirtyFields.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {saveLabel} {dirtyFields.length > 0 && `(${dirtyFields.length} change${dirtyFields.length === 1 ? '' : 's'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
