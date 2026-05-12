/**
 * HoverRailSidebar — premium collapsible navigation rail.
 *
 * Design north stars: Linear's calm rail · Vercel's crisp clicks ·
 * Odoo's operational density.
 *
 * Layout contract
 * ---------------
 *   collapsed width:  56px (--rail-w)
 *   expanded width:  240px (--rail-w-expanded)
 *
 * The rail is `position: fixed`. The main content reserves `padding-left:
 * var(--rail-w)` ALWAYS, so the content does not shift horizontally when
 * the rail expands. Expanded state overlays adjacent content with a soft
 * right-edge shadow.
 *
 * Expand triggers
 * ---------------
 *   mouseenter       → expand
 *   focus-within     → expand (keyboard tab through items)
 *   pinned=true      → expand and ignore mouseleave
 *   mouseleave       → collapse (unless pinned)
 *   Escape           → collapse (unless pinned)
 *
 * Persistence
 * -----------
 *   Pin state lives in localStorage["mid:sidebar:pinned"] = "1" | "0".
 *
 * Motion (per the approved plan)
 * ------------------------------
 *   Width:    CSS transition `--motion-base` (`var(--ease-out-quart)`)
 *   Labels:   CSS opacity `--motion-fast` with 60ms delay on expand
 *   Active:   Framer Motion `layoutId="sidebar-active"` on a 2px left bar
 *
 * Mobile (≤ md)
 * -------------
 *   Rail hides. A hamburger trigger in the TopHeader opens a Sheet with the
 *   same nav. Mobile nav rendered by `<MobileNavSheet />` below — exported
 *   so TopHeader can mount its trigger separately.
 */
import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  HeartPulse,
  ShieldCheck,
  Settings,
  Pin,
  PinOff,
  Menu,
  FlaskConical,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useApiState } from '@/app/dataset-context';
import { useMe } from '@/lib/api/use-me';
import { useReducedMotion, MOTION, EASE_OUT_QUART } from './motion';

type NavEntry = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const NAV: NavEntry[] = [
  { to: routes.dashboard, label: 'Dashboard',           icon: LayoutDashboard },
  { to: routes.employees, label: 'Employees',           icon: Users },
  { to: routes.contracts, label: 'Contracts',           icon: FileText },
  { to: routes.insurance, label: 'Medical Insurance',   icon: HeartPulse },
  // Phase 8 — Import / Review / Users / Audit collapse into a single
  // adminOnly Admin entry. Non-admin users no longer see ingestion entry
  // points in the nav, even though the server endpoints would still
  // refuse them.
  { to: routes.admin,     label: 'Admin',               icon: ShieldCheck, adminOnly: true },
  { to: routes.settings,  label: 'Settings',            icon: Settings },
];

const PIN_KEY = 'mid:sidebar:pinned';

function readPinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

function writePinned(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PIN_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function HoverRailSidebar() {
  const { data: me } = useMe();
  // Phase 8: admin entry is visible to admin OR hr_manager. Same predicate
  // as `canAccessAdmin` in src/lib/auth.ts — kept local to avoid bundling
  // the helper into the rail.
  const canSeeAdmin = me != null && me.status === 'active' && (me.isAdmin === true || me.role === 'hr_manager');
  const visibleNav = React.useMemo(
    () => NAV.filter((n) => !n.adminOnly || canSeeAdmin),
    [canSeeAdmin],
  );

  const [pinned, setPinned] = React.useState<boolean>(() => readPinned());
  const [hoverExpanded, setHoverExpanded] = React.useState(false);
  const [focusExpanded, setFocusExpanded] = React.useState(false);

  const expanded = pinned || hoverExpanded || focusExpanded;

  // Close-delay buffer: a brief mouse exit (e.g. crossing into a portal
  // tooltip, or the width animation lagging the cursor by a frame) shouldn't
  // collapse the rail. We schedule the collapse 120ms out and cancel it the
  // moment the mouse re-enters. Pin/Escape/blur all clear the timer too so
  // they take effect immediately.
  const closeTimerRef = React.useRef<number | null>(null);
  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const scheduleCollapse = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setHoverExpanded(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);
  const cancelAndExpand = React.useCallback(() => {
    clearCloseTimer();
    setHoverExpanded(true);
  }, [clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pinned) {
        clearCloseTimer();
        setHoverExpanded(false);
        setFocusExpanded(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, clearCloseTimer]);

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    writePinned(next);
    // Unpinning while the mouse is elsewhere should collapse immediately;
    // pinning while collapsed should expand immediately. Either way, kill
    // any pending hover-close so the visual state matches the user intent.
    clearCloseTimer();
  }

  return (
    <aside
      className={cn(
        'hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-sidebar text-sidebar-foreground',
        'border-r border-sidebar-border',
        'transition-[width,box-shadow] duration-base ease-out-quart',
        expanded
          ? 'w-[var(--rail-w-expanded)] shadow-[10px_0_30px_-12px_rgba(0,0,0,0.18)]'
          : 'w-[var(--rail-w)]',
      )}
      onMouseEnter={cancelAndExpand}
      onMouseLeave={scheduleCollapse}
      onFocus={() => {
        clearCloseTimer();
        setFocusExpanded(true);
      }}
      onBlur={(e) => {
        // Only collapse if focus genuinely left the aside.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocusExpanded(false);
        }
      }}
      aria-label="Primary navigation"
      aria-expanded={expanded}
      data-pinned={pinned || undefined}
    >
      {/* Brand — always visible, identity strong even at 56px. */}
      <div className="flex items-center gap-3 h-16 px-3 border-b border-sidebar-border overflow-hidden relative">
        <div className="relative shrink-0">
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 object-contain bg-white/95 rounded-md p-1 ring-1 ring-white/10"
          />
          {/* Tiny brand initial dot, sits in the bottom-right of the logo when
              collapsed so the rail reads as "MID" even at 56px. Fades out
              when the wordmark takes over. */}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[8px] font-bold',
              'flex items-center justify-center text-primary-foreground ring-2 ring-sidebar shadow-sm',
              'transition-opacity duration-fast ease-out-quart',
              expanded ? 'opacity-0' : 'opacity-100',
            )}
            aria-hidden="true"
          >
            M
          </span>
        </div>
        <div
          className={cn(
            'leading-tight transition-opacity duration-fast ease-out-quart whitespace-nowrap',
            expanded ? 'opacity-100 [transition-delay:60ms]' : 'opacity-0 pointer-events-none',
          )}
        >
          <div className="text-sm font-semibold text-white">MID Arabia</div>
          <div className="text-[11px] text-sidebar-foreground/70">HR · Employee 360</div>
        </div>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 py-3 overflow-y-auto overflow-x-hidden"
        role="navigation"
        aria-label="Sections"
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {visibleNav.map((n) => (
            <RailNavItem
              key={n.to}
              item={n}
              expanded={expanded}
            />
          ))}
        </ul>
      </nav>

      <SidebarFooter expanded={expanded} pinned={pinned} onTogglePin={togglePin} />
    </aside>
  );
}

interface RailNavItemProps {
  item: NavEntry;
  expanded: boolean;
}

function RailNavItem({ item, expanded }: RailNavItemProps) {
  const Icon = item.icon;
  const location = useLocation();
  const isActive =
    location.pathname === item.to || location.pathname.startsWith(item.to + '/');

  // Tooltip only when collapsed. We DON'T use TooltipProvider here because
  // the rail mounts many items; we'd burn re-renders. shadcn's Tooltip
  // works fine without explicit provider — it has a default one at the
  // module level.
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard'}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 h-9 px-3 rounded-md',
        'text-[13px] text-sidebar-foreground/85',
        'transition-[background-color,color,transform,box-shadow] duration-fast ease-out-quart',
        'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        'active:scale-[0.985] active:bg-sidebar-accent active:duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
        // Active route — stronger highlight: full sidebar-accent fill,
        // brighter foreground, subtle inner glow on the left edge.
        isActive &&
          'bg-sidebar-accent text-white font-medium shadow-[inset_2px_0_0_hsl(var(--primary))]',
      )}
    >
      {isActive && <ActiveBar />}
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-colors duration-fast',
          isActive ? 'text-primary' : 'text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground',
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          'whitespace-nowrap transition-opacity duration-fast ease-out-quart',
          expanded ? 'opacity-100 [transition-delay:60ms]' : 'opacity-0 pointer-events-none',
        )}
      >
        {item.label}
      </span>
    </NavLink>
  );

  if (expanded) {
    return <li>{link}</li>;
  }

  return (
    <li>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </li>
  );
}

/**
 * The Framer Motion'd active indicator. A 2px wide bar on the left edge of
 * the rail; `layoutId` makes it animate between items when the route
 * changes. Reduced-motion disables the animation but keeps it visible.
 */
function ActiveBar() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      layoutId="sidebar-active"
      className={cn(
        'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary',
        // Soft glow so the active state reads at a glance even when the rail
        // is collapsed and the row label is hidden.
        'shadow-[0_0_8px_hsl(var(--primary)/0.55)]',
      )}
      transition={
        reduced
          ? { duration: 0 }
          : { type: 'spring', stiffness: 380, damping: 30, duration: MOTION.base / 1000 }
      }
      aria-hidden="true"
    />
  );
}

interface SidebarFooterProps {
  expanded: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}

function SidebarFooter({ expanded, pinned, onTogglePin }: SidebarFooterProps) {
  const apiState = useApiState();
  const PinIcon = pinned ? PinOff : Pin;
  return (
    <div className="border-t border-sidebar-border p-2 space-y-2">
      <div className="px-1">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onTogglePin}
                aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
                aria-pressed={pinned}
                className={cn(
                  'w-full justify-start gap-3 h-8 px-2',
                  'transition-[background-color,color,box-shadow] duration-fast ease-out-quart',
                  // Unpinned: muted ghost.
                  !pinned &&
                    'text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 hover:shadow-none',
                  // Pinned: unmistakable "on" state — primary tint, ring, and
                  // a soft inner highlight. Hovering keeps the on-state but
                  // brightens it slightly so users feel the click.
                  pinned &&
                    'bg-primary/20 text-white ring-1 ring-inset ring-primary/40 hover:bg-primary/30 hover:shadow-none shadow-[inset_0_1px_0_hsl(var(--primary)/0.25)]',
                )}
              >
                <PinIcon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-base ease-out-quart',
                    pinned ? 'text-primary rotate-[-20deg]' : 'rotate-0',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'whitespace-nowrap text-[12px] transition-opacity duration-fast ease-out-quart',
                    expanded ? 'opacity-100 [transition-delay:60ms]' : 'opacity-0 pointer-events-none',
                  )}
                >
                  {pinned ? 'Pinned · click to release' : 'Pin sidebar'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {pinned ? 'Unpin sidebar' : 'Pin sidebar (keep expanded)'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {(apiState === 'synthetic' || apiState === 'live') && (
        <div
          className={cn(
            'mx-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
            apiState === 'synthetic' &&
              'bg-amber-400/15 text-amber-300 ring-amber-400/30',
            apiState === 'live' &&
              'bg-status-active/20 text-status-active-soft ring-status-active/30',
          )}
          aria-label={apiState === 'synthetic' ? 'Showing synthetic demo data' : 'Live API'}
        >
          {apiState === 'synthetic' ? (
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-status-active" aria-hidden="true" />
          )}
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-fast ease-out-quart',
              expanded ? 'opacity-100 [transition-delay:60ms]' : 'opacity-0 pointer-events-none',
            )}
          >
            {apiState === 'synthetic' ? 'Synthetic data' : 'Live API'}
          </span>
        </div>
      )}
    </div>
  );
}

// Avoid unused warning until the indicator easing is consumed elsewhere.
void EASE_OUT_QUART;

/**
 * MobileNavSheet — the same nav, rendered inside a Radix Sheet for mobile.
 * The TopHeader mounts its trigger via `<MobileNavTrigger />`.
 */
export function MobileNavSheet() {
  const { data: me } = useMe();
  // Phase 8: same predicate as the desktop rail (admin OR hr_manager).
  const canSeeAdmin = me != null && me.status === 'active' && (me.isAdmin === true || me.role === 'hr_manager');
  const visibleNav = React.useMemo(
    () => NAV.filter((n) => !n.adminOnly || canSeeAdmin),
    [canSeeAdmin],
  );
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  // Close the sheet when the route changes so a tap on a nav item dismisses
  // the overlay.
  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border p-0"
      >
        {/* Caller-level a11y: explicit title + description.
            Title visible, description sr-only so it doesn't crowd the UI. */}
        <SheetTitle className="px-5 h-16 flex items-center gap-3 border-b border-sidebar-border text-white text-sm font-semibold">
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 object-contain bg-white/95 rounded-md p-1"
          />
          MID Arabia · HR
        </SheetTitle>
        <SheetDescription className="sr-only">
          Primary navigation between dashboard, employees, contracts, insurance,
          imports, review queue, admin and settings.
        </SheetDescription>
        <nav className="p-3" role="navigation" aria-label="Sections">
          <ul className="flex flex-col gap-0.5">
            {visibleNav.map((n) => {
              const Icon = n.icon;
              return (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.to === '/dashboard'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 h-10 px-3 rounded-md text-[13px]',
                        'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                        'active:scale-[0.985] active:bg-sidebar-accent',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground/85',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {n.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
