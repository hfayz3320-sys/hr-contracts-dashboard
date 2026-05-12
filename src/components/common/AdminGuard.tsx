/**
 * AdminGuard — route wrapper that only lets admin / hr_manager through.
 *
 * Three branches:
 *   1. /api/me still loading → render a small loading state (don't flash a
 *      forbidden screen at admins whose me-query is in flight).
 *   2. /api/me returned and the user has admin / hr_manager → render the
 *      child route via <Outlet />.
 *   3. anything else (viewer, disabled, network error) → render the
 *      ForbiddenSurface — a friendly 403 page that links back to dashboard.
 *
 * The server-side endpoints are independently `requireAdmin`-gated. This
 * guard is a UX layer; never the only line of defence.
 */
import { Link, Outlet } from 'react-router-dom';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { useMe } from '@/lib/api/use-me';
import { canAccessAdmin } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function AdminGuard() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!canAccessAdmin(me.data)) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-0">
          <EmptyState
            icon={ShieldOff}
            tone="expired"
            title="Admin area"
            description={
              me.data
                ? `Your role is ${me.data.role}. Only admin and hr_manager roles can open the admin module.`
                : 'Sign in with an admin or hr_manager account to access this area.'
            }
            action={
              // Plain styled Link — avoids the PressableButton+Radix-Slot
              // `React.Children.only` crash when the empty-state action
              // wraps a Link with multiple children.
              <Link
                to={routes.dashboard}
                className={cn(
                  'inline-flex items-center gap-2 h-9 px-4 rounded-md border border-input bg-background text-sm font-medium',
                  'transition-[transform,background-color,box-shadow] duration-fast ease-out-quart',
                  'hover:bg-accent hover:text-accent-foreground hover:-translate-y-px hover:shadow-hover',
                  'active:translate-y-[1px] active:duration-75 active:shadow-press',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                )}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Dashboard
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return <Outlet />;
}
