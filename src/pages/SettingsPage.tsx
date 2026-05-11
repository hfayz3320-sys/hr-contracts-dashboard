import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { appName, appVersion, envLabel, isDev } from '@/lib/env';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="System info and reserved space for future configuration."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Application" value={appName} />
            <Row label="Version" value={appVersion} />
            <Row label="Environment" value={<Badge variant="outline">{envLabel}</Badge>} />
            <Row label="Build" value={isDev ? 'development' : 'production'} />
            <Row label="Backend" value={<Badge variant="outline">Mock (Phase 1)</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Future configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Reserved</AlertTitle>
              <AlertDescription>
                Notification rules, expiry-reminder cadence, retention policies, and SSO will land
                here in Phase 2+.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
