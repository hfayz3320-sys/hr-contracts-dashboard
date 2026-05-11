import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { routes } from '@/lib/routes';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <Compass className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        The page you tried to open doesn't exist in this dashboard.
      </p>
      <Button asChild className="mt-5">
        <Link to={routes.dashboard}>Back to dashboard</Link>
      </Button>
    </div>
  );
}
