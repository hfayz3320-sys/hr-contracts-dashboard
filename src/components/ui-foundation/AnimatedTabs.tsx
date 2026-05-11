/**
 * AnimatedTabs — premium operational tab bar.
 *
 * Built on Radix Tabs (keyboard-perfect: ←/→, Home/End, Enter/Space already
 * handled). Adds:
 *
 *   - An animated underline indicator that slides between tabs via
 *     Framer Motion `layoutId="tabs-active"`.
 *   - Optional URL binding (`urlKey` prop) — the active tab is stored in
 *     the `?tab=<value>` search param via `useSearchParams`, so browser
 *     back/forward and shareable links work.
 *   - A panel crossfade via `<AnimatePresence mode="wait">`.
 *
 * The Tab/TabList/TabPanel components are thin wrappers; consumers stay
 * close to the Radix API.
 *
 * Reduced motion: indicator and panel transitions collapse to 0 duration.
 */
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { MOTION, useReducedMotion } from './motion';

export interface AnimatedTabsProps {
  /** Source-of-truth tab keys; first value is the default. */
  defaultValue: string;
  /** Bind to `?<urlKey>=<value>` in the URL. Omit to keep state in-component. */
  urlKey?: string;
  /** Controlled value; overrides URL + internal state when provided. */
  value?: string;
  /** Controlled onChange. */
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface TabsCtx {
  value: string;
}
const TabsContext = React.createContext<TabsCtx | null>(null);
function useTabsCtx(): TabsCtx {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error('AnimatedTabs subcomponents must be used inside <AnimatedTabs>');
  }
  return ctx;
}

export function AnimatedTabs({
  defaultValue,
  urlKey,
  value: valueProp,
  onValueChange,
  children,
  className,
}: AnimatedTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [internal, setInternal] = React.useState(defaultValue);

  const urlValue = urlKey ? searchParams.get(urlKey) : null;
  const value = valueProp ?? urlValue ?? internal;

  function setValue(next: string) {
    if (onValueChange) onValueChange(next);
    if (urlKey) {
      const params = new URLSearchParams(searchParams);
      if (next === defaultValue) {
        params.delete(urlKey);
      } else {
        params.set(urlKey, next);
      }
      // Use replace=false so the back button restores the previous tab.
      setSearchParams(params, { replace: false });
    } else {
      setInternal(next);
    }
  }

  return (
    <TabsContext.Provider value={{ value }}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={setValue}
        className={cn('flex flex-col', className)}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  );
}

export interface TabListProps {
  children: React.ReactNode;
  /** Visual ariant — pill on top, underline below. */
  variant?: 'underline' | 'pill';
  className?: string;
  /** Accessible label for the tab list. */
  'aria-label'?: string;
}

export function TabList({
  children,
  variant = 'underline',
  className,
  ...props
}: TabListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        'relative inline-flex items-center gap-1 overflow-x-auto',
        variant === 'underline' && 'border-b mb-0',
        variant === 'pill' && 'p-1 bg-muted/50 rounded-lg',
        className,
      )}
      data-variant={variant}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export interface TabProps {
  value: string;
  children: React.ReactNode;
  /** Optional small badge after the label (e.g. count). */
  badge?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Tab({ value, children, badge, disabled, className }: TabProps) {
  const { value: active } = useTabsCtx();
  const isActive = active === value;
  const reduced = useReducedMotion();

  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 h-9 text-[13px]',
        'transition-[color,background-color] duration-fast ease-out-quart',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
      {badge != null && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full px-1.5 h-4 min-w-[16px] text-[10px] font-medium',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {badge}
        </span>
      )}
      {isActive && (
        <motion.span
          layoutId="tabs-active"
          className="absolute left-2 right-2 -bottom-px h-[2px] bg-primary rounded-full"
          transition={
            reduced
              ? { duration: 0 }
              : { type: 'spring', stiffness: 380, damping: 30, duration: MOTION.base / 1000 }
          }
          aria-hidden="true"
        />
      )}
    </TabsPrimitive.Trigger>
  );
}

export interface TabPanelProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Single tab panel. The panel crossfades (Framer Motion AnimatePresence) when
 * the active tab changes. Each panel renders only when active — Radix
 * Tabs hides inactive panels with `hidden`, but we go further and unmount
 * via AnimatePresence so the crossfade has actual incoming + outgoing
 * elements.
 */
export function TabPanel({ value, children, className }: TabPanelProps) {
  const { value: active } = useTabsCtx();
  const reduced = useReducedMotion();

  return (
    <TabsPrimitive.Content
      value={value}
      forceMount
      className={cn(
        'mt-6 outline-none',
        // Radix sets data-state="inactive" for inactive panels — we hide
        // them visually but keep AnimatePresence in control of the
        // mount/unmount transition.
        'data-[state=inactive]:hidden',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {active === value && (
          <motion.div
            key={value}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: MOTION.fast / 1000, ease: [0.25, 1, 0.5, 1] }
            }
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </TabsPrimitive.Content>
  );
}
