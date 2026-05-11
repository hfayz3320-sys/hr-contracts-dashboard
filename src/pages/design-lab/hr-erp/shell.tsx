/**
 * Odoo-inspired HR ERP app shell.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  dark module top nav  (Employees · Departments · ...)        │
 *   ├──┬───────────────────────────────────────────────────────────┤
 *   │R │  action bar  (New · Search · Filters · Group · ⋯)          │
 *   │a ├───────────────────────────────────────────────────────────┤
 *   │i │  view tabs   (Kanban · List · Form · Org · Activity · …)   │
 *   │l ├───────────────────────────────────────────────────────────┤
 *   │  │  CONTENT (children)                                         │
 *   └──┴───────────────────────────────────────────────────────────┘
 *
 * The shell is shared across every HR ERP view. Module + view state lives
 * in the parent (route) so URLs stay shareable.
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Building2, FileText, Wallet, GraduationCap, BarChart3, Settings,
  Beaker, ArrowLeft, Search, Filter, LayoutGrid, Rows, FileEdit, Network,
  MessageSquare, PieChart, Plus, ChevronDown, Star, FilePlus, Upload, Download,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AliveButton, Sep } from './ui';
import { MODULES as MODULE_KEYS, VIEW_OPTIONS, type ModuleKey, type ViewKey } from './shell-meta';

const MODULE_ICONS: Record<ModuleKey, React.ComponentType<{ className?: string }>> = {
  employees: Users, departments: Building2, contracts: FileText,
  payroll: Wallet, learning: GraduationCap, reporting: BarChart3,
  configuration: Settings,
};
const MODULES_WITH_ICONS = MODULE_KEYS.map((m) => ({ ...m, icon: MODULE_ICONS[m.key] }));

const VIEW_META: Record<ViewKey, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  kanban:   { label: 'Kanban',   icon: LayoutGrid    },
  list:     { label: 'List',     icon: Rows          },
  form:     { label: 'Form',     icon: FileEdit      },
  org:      { label: 'Org Chart',icon: Network       },
  activity: { label: 'Activity', icon: MessageSquare },
  report:   { label: 'Report',   icon: PieChart      },
};

// ---------- Top module nav -----------------------------------------------

function ModuleNav({
  module, onModule,
}: {
  module: ModuleKey;
  onModule: (m: ModuleKey) => void;
}) {
  return (
    <nav
      className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border"
      aria-label="HR ERP modules"
    >
      <div className="flex items-center gap-1 px-4 h-12">
        {/* App brand */}
        <Link
          to="/dashboard"
          className="flex items-center gap-2 mr-2 pr-3 border-r border-sidebar-border/60 hover:opacity-80 transition-opacity"
          title="Exit lab"
        >
          <span className="h-7 w-7 rounded-md bg-primary/30 flex items-center justify-center text-[11px] font-bold tracking-tight">M</span>
          <span className="text-[13px] font-semibold tracking-tight hidden md:inline">MID HR</span>
        </Link>

        {/* Modules */}
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1">
          {MODULES_WITH_ICONS.map((m) => {
            const sel = m.key === module;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onModule(m.key)}
                aria-pressed={sel}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[12.5px] font-medium whitespace-nowrap',
                  'transition-[background-color,color,transform] duration-fast ease-out-quart',
                  'active:translate-y-[1px] active:duration-75',
                  sel
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_-2px_0_hsl(var(--primary)/0.6)]'
                    : 'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <Link
            to="/design-lab"
            className="inline-flex items-center gap-1.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors"
          >
            <Beaker className="h-3 w-3" />
            Other concepts
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Exit lab
          </Link>
          <span className="h-7 w-7 rounded-full bg-primary/30 flex items-center justify-center text-[11px] font-semibold ml-1">HF</span>
        </div>
      </div>
    </nav>
  );
}

// ---------- Action / search / filter bar ---------------------------------

function ActionBar({
  title, primary, searchPlaceholder, count,
}: {
  title: string;
  primary?: { label: string; icon?: React.ReactNode };
  searchPlaceholder?: string;
  count?: { selected: number; total: number };
}) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 bg-card border-b">
      <h1 className="text-[15px] font-semibold tracking-tight whitespace-nowrap pr-2">{title}</h1>
      <Sep />
      <AliveButton variant="primary" size="sm" icon={primary?.icon ?? <Plus className="h-3.5 w-3.5" />}>
        {primary?.label ?? 'New'}
      </AliveButton>

      {/* Search */}
      <div className="ml-2 relative flex-1 max-w-md">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          className={cn(
            'w-full h-8 pl-8 pr-3 rounded-md border bg-background text-[12.5px]',
            'focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-shadow duration-fast',
          )}
          placeholder={searchPlaceholder ?? 'Search…'}
        />
      </div>

      <Sep />
      <AliveButton variant="ghost" size="sm" icon={<Filter className="h-3.5 w-3.5" />}>Filters</AliveButton>
      <AliveButton variant="ghost" size="sm" icon={<Layers className="h-3.5 w-3.5" />}>Group By <ChevronDown className="h-3 w-3" /></AliveButton>
      <AliveButton variant="ghost" size="sm" icon={<Star className="h-3.5 w-3.5" />}>Favorites</AliveButton>

      <div className="flex-1" />

      {count && (
        <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
          {count.selected > 0 ? `${count.selected} / ${count.total} selected` : `${count.total}`}
        </div>
      )}

      <Sep />
      <AliveButton variant="ghost" size="sm" icon={<Upload className="h-3.5 w-3.5" />}>Import</AliveButton>
      <AliveButton variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}>Export</AliveButton>
    </div>
  );
}

// ---------- View switcher ------------------------------------------------

function ViewSwitcher({
  options, value, onChange,
}: {
  options: ViewKey[];
  value: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-card border-b px-4 py-1.5">
      <div className="flex items-center gap-0.5 bg-muted/60 rounded-md p-0.5">
        {options.map((v) => {
          const sel = v === value;
          const meta = VIEW_META[v];
          const Icon = meta.icon;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={sel}
              title={meta.label}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-[12px] font-medium',
                'transition-[background-color,color,box-shadow,transform] duration-fast ease-out-quart',
                'active:translate-y-[1px] active:duration-75',
                sel
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{meta.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <FilePlus className="h-3 w-3" />
        mock data — no API calls
      </div>
    </div>
  );
}

// ---------- Tool rail (left slim) ----------------------------------------

function ToolRail() {
  const tools = [
    { label: 'Discuss',     icon: MessageSquare },
    { label: 'Activities',  icon: Star          },
    { label: 'Approvals',   icon: FileEdit      },
    { label: 'Reports',     icon: PieChart      },
  ];
  return (
    <aside className="hidden md:flex w-12 shrink-0 bg-card border-r flex-col items-center py-3 gap-1">
      {tools.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.label}
            type="button"
            title={t.label}
            className={cn(
              'h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground',
              'transition-[background-color,color,transform] duration-fast ease-out-quart',
              'hover:bg-muted hover:text-foreground',
              'active:translate-y-[1px] active:duration-75',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
      <div className="flex-1" />
      <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground rotate-180 [writing-mode:vertical-rl] pb-1">
        HR ERP
      </span>
    </aside>
  );
}

// ---------- The full shell -----------------------------------------------

export function HrErpShell({
  module, onModule, view, onView,
  title, primary, searchPlaceholder, count,
  showActionBar = true, showViewSwitcher = true,
  children,
}: {
  module: ModuleKey;
  onModule: (m: ModuleKey) => void;
  view: ViewKey;
  onView: (v: ViewKey) => void;
  title: string;
  primary?: { label: string; icon?: React.ReactNode };
  searchPlaceholder?: string;
  count?: { selected: number; total: number };
  showActionBar?: boolean;
  showViewSwitcher?: boolean;
  children: React.ReactNode;
}) {
  const options = VIEW_OPTIONS[module];
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <ModuleNav module={module} onModule={onModule} />
      <div className="flex flex-1 min-h-0">
        <ToolRail />
        <main className="flex-1 min-w-0 flex flex-col">
          {showActionBar     && <ActionBar title={title} primary={primary} searchPlaceholder={searchPlaceholder} count={count} />}
          {showViewSwitcher  && <ViewSwitcher options={options} value={view} onChange={onView} />}
          <div className="flex-1 min-h-0 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
