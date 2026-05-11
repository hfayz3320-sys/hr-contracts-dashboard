import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Global filter pattern. Drawers are NEVER permanently visible — every page
 * places a Filter button in the header that opens this Sheet on demand.
 */
export function FilterDrawer({
  open,
  onOpenChange,
  title,
  description,
  activeCount,
  onApply,
  onReset,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  activeCount?: number;
  onApply: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              {title}
              {activeCount && activeCount > 0 ? (
                <Badge variant="secondary" className="ml-1">
                  {activeCount}
                </Badge>
              ) : null}
            </SheetTitle>
            <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
              Reset
            </Button>
          </div>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">{children}</div>
        </ScrollArea>

        <SheetFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}
            className="w-full sm:w-auto"
          >
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function FilterGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

export function FilterButton({
  onClick,
  activeCount,
}: {
  onClick: () => void;
  activeCount?: number;
}) {
  return (
    <Button variant="outline" onClick={onClick} className="gap-2">
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {activeCount && activeCount > 0 ? (
        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
          {activeCount}
        </Badge>
      ) : null}
    </Button>
  );
}
