/**
 * Users & Permissions page (admin-only).
 *
 * Reads from /api/users, writes via the four CRUD endpoints. Non-admins
 * see an inline "not authorized" panel and are blocked at the worker (403)
 * even if they bypass the FE.
 */
import { useState, useMemo } from 'react';
import { Plus, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ExportButton } from '@/components/common/ExportButton';
import { useMe } from '@/lib/api/use-me';
import {
  useAppUsers, useCreateAppUser, usePatchAppUser, useDeactivateAppUser,
} from '@/lib/api/hooks';
import { formatDateTime } from '@/lib/dates';
import type { AppUser, AppUserRole } from '@shared/api-contract';

const ROLE_LABEL: Record<AppUserRole, string> = {
  admin: 'Administrator',
  hr_manager: 'HR Manager',
  viewer: 'Viewer',
  disabled: 'Disabled',
};

const ROLE_OPTIONS: { value: AppUserRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'viewer', label: 'Viewer' },
];

const USERS_EXPORT_COLUMNS = [
  { header: 'Email', value: (u: AppUser) => u.email },
  { header: 'Display Name', value: (u: AppUser) => u.displayName ?? '' },
  { header: 'Role', value: (u: AppUser) => ROLE_LABEL[u.role] ?? u.role },
  { header: 'Status', value: (u: AppUser) => u.status },
  { header: 'Last Login', value: (u: AppUser) => u.lastLoginAt ?? '', format: 'date' as const },
  { header: 'Created', value: (u: AppUser) => u.createdAt, format: 'date' as const },
  { header: 'Created By', value: (u: AppUser) => u.createdBy },
  { header: 'Updated', value: (u: AppUser) => u.updatedAt, format: 'date' as const },
  { header: 'Updated By', value: (u: AppUser) => u.updatedBy },
];

export function UsersPage() {
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Users & Permissions" description="Manage who can use this app and what they can do." />
        <Card>
          <CardContent className="py-12 text-center">
            <div className="h-12 w-12 mx-auto rounded-full bg-status-expired-soft flex items-center justify-center text-status-expired">
              <ShieldOff className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-medium">Administrator access required</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your current role is <strong>{me?.role ?? 'unknown'}</strong>. Only administrators can view and manage app users.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <UsersTable currentEmail={me?.email ?? null} />;
}

function UsersTable({ currentEmail }: { currentEmail: string | null }) {
  const { data, isLoading, error } = useAppUsers();
  const createMutation = useCreateAppUser();
  const patchMutation = usePatchAppUser();
  const deactivateMutation = useDeactivateAppUser();

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{ email: string; displayName: string; role: AppUserRole }>({
    email: '', displayName: '', role: 'viewer',
  });

  const users = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === 'admin' && u.status === 'active').length,
    hr: users.filter((u) => u.role === 'hr_manager' && u.status === 'active').length,
    viewers: users.filter((u) => u.role === 'viewer' && u.status === 'active').length,
    disabled: users.filter((u) => u.status === 'disabled').length,
  }), [users]);

  async function handleCreate() {
    if (!draft.email.includes('@')) {
      toast.error('Valid email required');
      return;
    }
    try {
      await createMutation.mutateAsync({
        email: draft.email.toLowerCase(),
        displayName: draft.displayName.trim() || null,
        role: draft.role,
      });
      toast.success(`Added ${draft.email}`);
      setAddOpen(false);
      setDraft({ email: '', displayName: '', role: 'viewer' });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast.error(status === 409 ? 'User already exists' : err instanceof Error ? err.message : 'Add failed');
    }
  }

  async function handleRoleChange(user: AppUser, newRole: AppUserRole): Promise<void> {
    if (user.role === newRole) return;
    try {
      await patchMutation.mutateAsync({ id: user.id, payload: { role: newRole } });
      toast.success(`Role: ${user.email} → ${ROLE_LABEL[newRole]}`);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 400) toast.error('Cannot change your own role — ask another admin.');
      else toast.error(err instanceof Error ? err.message : 'Role change failed');
    }
  }

  async function handleDeactivate(user: AppUser): Promise<void> {
    const reason = window.prompt(`Deactivate ${user.email}?\nOptional reason:`, '');
    if (reason === null) return;
    try {
      await deactivateMutation.mutateAsync({ id: user.id, payload: { reason: reason || undefined } });
      toast.success(`Deactivated ${user.email}`);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 400) toast.error('Cannot deactivate your own account — ask another admin.');
      else toast.error(err instanceof Error ? err.message : 'Deactivate failed');
    }
  }

  async function handleReactivate(user: AppUser): Promise<void> {
    try {
      await patchMutation.mutateAsync({ id: user.id, payload: { status: 'active' } });
      toast.success(`Reactivated ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reactivate failed');
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & Permissions"
        description={`${counts.total} user${counts.total === 1 ? '' : 's'} · ${counts.admins} admin · ${counts.hr} HR · ${counts.viewers} viewer · ${counts.disabled} disabled`}
        actions={
          <>
            <ExportButton
              filename="app-users"
              sheet="Users"
              rows={users}
              columns={USERS_EXPORT_COLUMNS}
              summary={[
                { label: 'Total users', value: counts.total },
                { label: 'Active admins', value: counts.admins },
                { label: 'Active HR managers', value: counts.hr },
                { label: 'Active viewers', value: counts.viewers },
                { label: 'Disabled', value: counts.disabled },
              ]}
            />
            <Button onClick={() => setAddOpen(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Add user
            </Button>
          </>
        }
      />

      {error && (
        <Card className="mb-4 border-status-expired/30 bg-status-expired-soft">
          <CardContent className="py-3 text-sm text-status-expired">
            Failed to load users: {error.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Last login</th>
                <th className="text-left px-4 py-2.5">Created</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-sm">Loading users…</td></tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-sm">No users yet. Click "Add user" to create one.</td></tr>
              )}
              {users.map((u) => {
                const isSelf = currentEmail && u.email.toLowerCase() === currentEmail.toLowerCase();
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{u.email}</div>
                      {isSelf && <div className="text-[11px] text-muted-foreground">(you)</div>}
                    </td>
                    <td className="px-4 py-2.5">{u.displayName ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <Select
                        value={u.role}
                        disabled={isSelf || u.status === 'disabled'}
                        onValueChange={(v) => handleRoleChange(u, v as AppUserRole)}
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        status={u.status === 'active' ? 'active' : 'missing'}
                        label={u.status === 'active' ? 'Active' : 'Disabled'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'never'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular">
                      {formatDateTime(u.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {u.status === 'active' ? (
                        <Button
                          variant="ghost" size="sm"
                          disabled={!!isSelf}
                          onClick={() => handleDeactivate(u)}
                          className="text-status-expired hover:text-status-expired"
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleReactivate(u)}>
                          Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              The email must already be allowed by Cloudflare Access. This page only controls in-app role and visibility.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="user@example.com"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-name">Display name (optional)</Label>
              <Input
                id="new-user-name"
                value={draft.displayName}
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-role">Role</Label>
              <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as AppUserRole })}>
                <SelectTrigger id="new-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
