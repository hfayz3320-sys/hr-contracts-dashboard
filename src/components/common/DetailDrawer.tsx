import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Right-side detail drawer driven by URL search params via useDrawerParam.
 * Width is wider than FilterDrawer to comfortably show entity details + tabs.
 *
 * Accessibility (Phase 3D):
 *
 * Radix Dialog (the underlying primitive of `<Sheet>`) emits two console
 * warnings when its `<DialogContent>` is missing either a `<DialogTitle>`
 * or a `<DialogDescription>` / `aria-describedby`. The previous version of
 * this component used `asChild` to forward the SheetTitle into a custom
 * <div>, AND only rendered the description when one was supplied. Both
 * triggered Radix's checks on the contract detail drawer:
 *
 *   ▲ Warning: DialogContent requires a DialogTitle for the component to
 *     be accessible for screen reader users.
 *   ▲ Warning: Missing Description or aria-describedby={undefined} for
 *     {DialogContent}.
 *
 * Fix:
 *   1. Always render `<SheetTitle>` directly (no `asChild`) — Radix's
 *      Slot wasn't injecting the heading role reliably for screen
 *      readers when the inner JSX contained badges/spans.
 *   2. Always render `<SheetDescription>`. If the caller did not pass a
 *      description, render an `sr-only` placeholder so Radix's aria
 *      contract is satisfied without changing the visible layout.
 *   3. `<SheetTitle>` accepts arbitrary ReactNode children; visible
 *      badges (e.g. StatusBadge in the Contract drawer header) live
 *      inside it as before.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-lg font-semibold leading-tight">
            {title}
          </SheetTitle>
          {description !== undefined && description !== null ? (
            <SheetDescription className="text-sm text-muted-foreground">
              {description}
            </SheetDescription>
          ) : (
            // Visually hidden description satisfies Radix's accessibility
            // contract (Dialog.Content needs DialogDescription or
            // aria-describedby). The text is intentionally generic so a
            // screen reader announces "Detail panel" instead of nothing.
            <SheetDescription className="sr-only">Detail panel</SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5">{children}</div>
        </ScrollArea>

        {footer && <div className="px-6 py-4 border-t bg-muted/30">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
