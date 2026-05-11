import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui-foundation/EmptyState';
import { PressableButton } from '@/components/ui-foundation/PressableButton';
import { routes } from '@/lib/routes';

export function NotFoundPage() {
  return (
    <div className="max-w-2xl mx-auto pt-8">
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Compass}
            tone="info"
            title="Page not found"
            description="The page you tried to open doesn't exist in this dashboard. It may have been renamed or removed."
            action={
              <PressableButton asChild>
                <Link to={routes.dashboard}>Back to dashboard</Link>
              </PressableButton>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
