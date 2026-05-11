/**
 * ActionMenu — operational row/page action dropdown.
 *
 * Thin convenience wrapper around Radix DropdownMenu. The trigger uses the
 * upgraded `<Button>` (so it has the press-down feel). Menu surface uses the
 * existing shadcn DropdownMenu styling.
 *
 * Why a wrapper:
 *   - One import for the "More actions" surface across the app.
 *   - Forced `aria-label` on icon-only triggers so screen readers always
 *     have a name.
 *   - Easy place to extend with chevrons/badges/keyboard-shortcut hints
 *     without touching every callsite.
 */
import * as React from 'react';
import { MoreHorizontal, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Inserts a separator BEFORE this item. */
  separatorBefore?: boolean;
  /** Render as a static (non-interactive) label heading. */
  isLabel?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Visible button label. Omit for icon-only "more" menu. */
  label?: React.ReactNode;
  /** Required when `label` is omitted, to give the trigger an accessible name. */
  ariaLabel?: string;
  /** Trigger size. */
  size?: 'sm' | 'default' | 'icon';
  /** Trigger variant. */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  /** Force-disable the trigger. */
  disabled?: boolean;
  /** Optional tooltip text shown via title attribute on the trigger. */
  title?: string;
  /** Optional class for the trigger button. */
  className?: string;
}

export function ActionMenu({
  items,
  label,
  ariaLabel,
  size = 'default',
  variant = 'outline',
  disabled,
  title,
  className,
}: ActionMenuProps) {
  // Defensive a11y: if there's no visible label, the trigger MUST carry an
  // aria-label. We throw in dev so it shows up early.
  if (import.meta.env.DEV && !label && !ariaLabel) {
    // eslint-disable-next-line no-console
    console.warn(
      '<ActionMenu> rendered with no `label` and no `ariaLabel`. Add one of the two to give the trigger an accessible name.',
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={label ? size : 'icon'}
          disabled={disabled}
          aria-label={ariaLabel}
          title={title}
          className={cn(className)}
        >
          {label ? (
            <>
              {label}
              <ChevronDown className="opacity-70" />
            </>
          ) : (
            <MoreHorizontal aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <React.Fragment key={item.key}>
              {item.separatorBefore && <DropdownMenuSeparator />}
              {item.isLabel ? (
                <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </DropdownMenuLabel>
              ) : (
                <DropdownMenuItem
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                  className={cn(
                    item.destructive && 'text-destructive focus:text-destructive focus:bg-destructive/10',
                  )}
                >
                  {Icon ? <Icon className="size-4 shrink-0" /> : null}
                  <span className="flex-1">{item.label}</span>
                </DropdownMenuItem>
              )}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
