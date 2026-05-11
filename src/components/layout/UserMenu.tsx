import { useState } from 'react';
import { LogOut, User as UserIcon, Settings as SettingsIcon, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { routes } from '@/lib/routes';
import { isDev } from '@/lib/env';
import { getDevAdminEmail, setDevAdminEmail } from '@/lib/api/admin';
import { useMe } from '@/lib/api/use-me';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  hr_manager: 'HR Manager',
  viewer: 'Viewer',
  disabled: 'Disabled',
};

export function UserMenu() {
  const navigate = useNavigate();
  const { data: me, isLoading, error } = useMe();

  // Dev-only fallback: in development the user may still be using the
  // dev-admin-email toggle in lieu of a real Access session.
  const [devAdminEmail, setDevAdminEmailState] = useState<string | null>(getDevAdminEmail());

  function toggleDevAdmin() {
    if (devAdminEmail) {
      setDevAdminEmail(null);
      setDevAdminEmailState(null);
      toast.success('Signed out (dev admin)');
    } else {
      const email = window.prompt('Dev admin email', 'admin@mid.local');
      if (!email || !email.includes('@')) return;
      setDevAdminEmail(email);
      setDevAdminEmailState(email);
      toast.success(`Signed in as ${email} (dev only)`);
    }
  }

  // Resolve display values from /api/me (production) or dev-admin (dev).
  const authedEmail = me?.email ?? devAdminEmail;
  const displayName = me?.displayName ?? authedEmail ?? (isLoading ? 'Loading…' : 'Not signed in');
  const roleLabel = me ? (ROLE_LABEL[me.role] ?? me.role) : devAdminEmail ? 'Dev admin' : isLoading ? '' : 'Not provisioned';
  const initial = (displayName.match(/[A-Za-z]/)?.[0] ?? '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm max-w-[180px] truncate">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-tight">{displayName}</p>
            {authedEmail && authedEmail !== displayName && (
              <p className="text-xs text-muted-foreground truncate">{authedEmail}</p>
            )}
            <p className="text-[11px] text-muted-foreground/80 pt-0.5">
              {roleLabel}
              {me?.authProvider === 'cloudflare_access' && ' · Cloudflare Access'}
            </p>
            {error && (
              <p className="text-[11px] text-status-expired pt-0.5">
                {(() => {
                  const status = (error as Error & { status?: number }).status;
                  if (status === 403) return 'Authenticated but not provisioned in this app.';
                  if (status === 401) return 'Not authenticated — please sign in via Access.';
                  return error.message;
                })()}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isDev && (
          <>
            <DropdownMenuItem onSelect={toggleDevAdmin}>
              {devAdminEmail ? (
                <>
                  <ShieldOff className="h-4 w-4" /> Sign out (dev admin)
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> Sign in as dev admin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled>
          <UserIcon className="h-4 w-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(routes.settings)}>
          <SettingsIcon className="h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogOut className="h-4 w-4" /> Sign out (via Cloudflare Access)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
