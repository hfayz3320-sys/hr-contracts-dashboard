import { AlertOctagon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6 border border-destructive/30 bg-destructive/5 rounded-lg',
        className,
      )}
    >
      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
        <AlertOctagon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
