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
          <SheetTitle asChild>
            <div className="text-lg font-semibold leading-tight">{title}</div>
          </SheetTitle>
          {description && (
            <SheetDescription asChild>
              <div className="text-sm text-muted-foreground">{description}</div>
            </SheetDescription>
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
