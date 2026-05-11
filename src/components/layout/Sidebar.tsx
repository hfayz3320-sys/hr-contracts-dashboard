import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  HeartPulse,
  Upload,
  AlertTriangle,
  ShieldCheck,
  Settings,
  FlaskConical,
  UserCog,
} from 'lucide-react';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useApiState } from '@/app/dataset-context';
import { useMe } from '@/lib/api/use-me';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: routes.dashboard, label: 'Dashboard',          icon: LayoutDashboard },
  { to: routes.employees, label: 'Employees',          icon: Users },
  { to: routes.contracts, label: 'Contracts',          icon: FileText },
  { to: routes.insurance, label: 'Medical Insurance',  icon: HeartPulse },
  { to: routes.imports,   label: 'Import Center',      icon: Upload },
  { to: routes.review,    label: 'Review Queue',       icon: AlertTriangle },
  { to: routes.users,     label: 'Users & Permissions', icon: UserCog, adminOnly: true },
  { to: routes.admin,     label: 'Admin · Audit',      icon: ShieldCheck },
  { to: routes.settings,  label: 'Settings',           icon: Settings },
];

export function Sidebar() {
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <img src="/logo.png" alt="MID Arabia" className="h-9 w-9 object-contain bg-white/95 rounded-md p-1" />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">MID Arabia</div>
          <div className="text-[11px] text-sidebar-foreground/70">HR Contracts · v2</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors relative',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/85',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <SidebarFooter />
    </aside>
  );
}

function SidebarFooter() {
  const apiState = useApiState();
  return (
    <div className="px-4 py-4 border-t border-sidebar-border space-y-2">
      {apiState === 'synthetic' && (
        <div
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/15 px-2 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-inset ring-amber-400/30"
          aria-label="This dashboard is showing synthetic demo data because the API is unreachable"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Synthetic demo data
        </div>
      )}
      {apiState === 'live' && (
        <div className="inline-flex items-center gap-1.5 rounded-md bg-status-active/20 px-2 py-1 text-[11px] font-medium text-status-active-soft ring-1 ring-inset ring-status-active/30">
          <span className="h-1.5 w-1.5 rounded-full bg-status-active" />
          Live API
        </div>
      )}
      <div className="text-[10px] text-sidebar-foreground/40 tracking-wide">
        Phase 2B · Real import + commit
      </div>
    </div>
  );
}
