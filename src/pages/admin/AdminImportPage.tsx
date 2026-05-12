/**
 * Admin → Import Center (Phase 8).
 *
 * Renders the existing 4-step ImportWizard inside the admin module. The
 * wizard itself already filters source options by `isAdmin` and the
 * backend gates every /api/imports/* endpoint with `requireAdmin`. This
 * page just adds the admin breadcrumb + header.
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { PathBackButton } from '@/components/common/PathBackButton';
import { ImportWizard } from '@/features/imports/ImportWizard';
import { routes } from '@/lib/routes';

export function AdminImportPage() {
  return (
    <div className="space-y-4">
      <PathBackButton />
      <PageHeader
        title="Import Center"
        description="Admin-only ingestion of HR data (employees / insurance / contract PDFs). Files are parsed in-browser, raw bytes go to private R2, dry-run preview holds back conflicts."
        breadcrumb={[
          { label: 'Admin', to: routes.admin },
          { label: 'Import' },
        ]}
      />
      <ImportWizard />
      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
        Legacy entry point: <Link to={routes.imports} className="underline-offset-2 hover:underline">/imports</Link>
        <ChevronRight className="h-3 w-3" />
        kept working for backward compatibility.
      </p>
    </div>
  );
}
