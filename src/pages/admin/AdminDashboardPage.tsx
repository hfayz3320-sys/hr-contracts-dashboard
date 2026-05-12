/**
 * Admin Dashboard — Phase 8.
 *
 * Six destination cards into the admin module. Each card shows a real
 * count from an existing API where available, or an honest empty state.
 * NO fake numbers, NO decorative deltas.
 *
 * Access: gated upstream by AdminGuard (admin / hr_manager only). This
 * page does NOT re-check; it can assume `me` is allowed.
 */
import { Link } from 'react-router-dom';
import {
  Upload, AlertTriangle, History, UserCog, Settings as SettingsIcon, Gauge,
  ArrowUpRight,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { routes } from '@/lib/routes';
import { useMe } from '@/lib/api/use-me';
import {
  useImportJobs, useReviewQueue, useAppUsers,
} from '@/lib/api/hooks';

type CardTone = 'info' | 'expiring' | 'active' | 'default';

const TONE_CLASSES: Record<CardTone, string> = {
  info:     'bg-status-info-soft text-[hsl(var(--status-info))]',
  expiring: 'bg-status-expiring-soft text-[hsl(var(--status-expiring))]',
  active:   'bg-status-active-soft text-[hsl(var(--status-active))]',
  default:  'bg-muted text-muted-foreground',
};

export function AdminDashboardPage() {
  const me = useMe();

  // Real counts from existing endpoints. Each card falls back to a safe
  // empty/loading state — never an invented number.
  const importJobs = useImportJobs();
  const reviewOpen = useReviewQueue('open');
  const users = useAppUsers();

  const importJobsCount = importJobs.data?.items?.length ?? null;
  const lastImport = importJobs.data?.items?.[0]?.startedAt ?? null;
  const openReviewCount = reviewOpen.data?.items?.length ?? null;
  const usersCount = users.data?.items?.length ?? null;
  const activeUsersCount = users.data?.items?.filter((u) => u.status === 'active').length ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description={
          me.data
            ? `Signed in as ${me.data.displayName || me.data.email} · ${me.data.role}.`
            : 'Loading…'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminCard
          to={routes.adminImport}
          icon={Upload}
          tone="info"
          title="Import Center"
          description="Upload Excel (employees / insurance) or PDF contracts. Preview before commit, raw bytes go to private R2."
          status={
            importJobs.isLoading
              ? { kind: 'loading' }
              : importJobsCount != null
                ? { kind: 'value', value: importJobsCount, unit: importJobsCount === 1 ? 'job total' : 'jobs total' }
                : { kind: 'empty', label: 'No data yet' }
          }
        />

        <AdminCard
          to={routes.adminReview}
          icon={AlertTriangle}
          tone="expiring"
          title="Review Queue"
          description="Rows held back at import — missing identity, unmatched, unknown template, negative duration. Resolve or reject."
          status={
            reviewOpen.isLoading
              ? { kind: 'loading' }
              : openReviewCount != null
                ? { kind: 'value', value: openReviewCount, unit: openReviewCount === 1 ? 'open item' : 'open items' }
                : { kind: 'empty', label: 'No data yet' }
          }
        />

        <AdminCard
          to={routes.adminImportHistory}
          icon={History}
          tone="default"
          title="Import History"
          description="Operational view of every import job — counts, source files, audit log, errors, security."
          status={
            importJobs.isLoading
              ? { kind: 'loading' }
              : lastImport
                ? { kind: 'detail', value: 'Last run', detail: lastImport.slice(0, 16).replace('T', ' ') }
                : { kind: 'empty', label: 'No imports yet' }
          }
        />

        <AdminCard
          to={routes.adminUsers}
          icon={UserCog}
          tone="active"
          title="Users & Roles"
          description="Manage admin / hr_manager / viewer membership. Self-deactivation and self-role-change are blocked server-side."
          status={
            users.isLoading
              ? { kind: 'loading' }
              : usersCount != null
                ? { kind: 'value', value: usersCount, unit: `users · ${activeUsersCount ?? 0} active` }
                : { kind: 'empty', label: 'No data yet' }
          }
        />

        <AdminCard
          to={routes.adminConfig}
          icon={SettingsIcon}
          tone="info"
          title="HR Configuration"
          description="Reference tables — contract types, document types, payroll components, learning categories. Read-only in this phase."
          status={{ kind: 'detail', value: 'Read-only', detail: '14 reference tables seeded' }}
        />

        <AdminCard
          to={routes.adminDataQuality}
          icon={Gauge}
          tone="expiring"
          title="Data Quality"
          description="Per-employee data-quality issues are computed on the profile page; an aggregate summary is not wired yet."
          status={{ kind: 'empty', label: 'Aggregate API not wired' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card primitive
// ---------------------------------------------------------------------------

type CardStatus =
  | { kind: 'loading' }
  | { kind: 'value'; value: number | string; unit: string }
  | { kind: 'detail'; value: string; detail: string }
  | { kind: 'empty'; label: string };

function AdminCard({
  to, icon: Icon, tone, title, description, status,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: CardTone;
  title: string;
  description: string;
  status: CardStatus;
}) {
  return (
    <Link to={to} className="block group focus-visible:outline-none">
      <Card
        className={cn(
          'h-full transition-[transform,box-shadow,border-color] duration-fast ease-out-quart',
          'group-hover:-translate-y-[1px] group-hover:shadow-hover group-hover:border-border',
          'group-active:translate-y-[1px] group-active:duration-75 group-active:shadow-press',
          'group-focus-visible:ring-2 group-focus-visible:ring-ring',
        )}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <span className={cn('h-9 w-9 rounded-md flex items-center justify-center', TONE_CLASSES[tone])}>
              <Icon className="h-4 w-4" />
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />
          </div>
          <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{title}</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{description}</p>
          <div className="mt-4">
            {status.kind === 'loading' && (
              <Skeleton className="h-5 w-24" />
            )}
            {status.kind === 'value' && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tight">{status.value}</span>
                <span className="text-[11px] text-muted-foreground uppercase tracking-[0.06em]">{status.unit}</span>
              </div>
            )}
            {status.kind === 'detail' && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">{status.value}</div>
                <div className="mt-0.5 text-[12.5px] tabular-nums">{status.detail}</div>
              </div>
            )}
            {status.kind === 'empty' && (
              <div className="text-[11.5px] text-muted-foreground italic">{status.label}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
