import { Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { EmployeeProfilePage } from '@/pages/EmployeeProfilePage';
import { ContractsPage } from '@/pages/ContractsPage';
import { InsurancePage } from '@/pages/InsurancePage';
import { ImportsPage } from '@/pages/ImportsPage';
import { ReviewQueuePage } from '@/pages/ReviewQueuePage';
import { UsersPage } from '@/pages/UsersPage';
import { AdminPage } from '@/pages/AdminPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { DesignLabPage } from '@/pages/design-lab/DesignLabPage';
import { HrErpDesignLab } from '@/pages/design-lab/hr-erp';
// Phase 8 — Admin module shell.
import { AdminGuard } from '@/components/common/AdminGuard';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminImportPage } from '@/pages/admin/AdminImportPage';
import { AdminImportReviewPage } from '@/pages/admin/AdminImportReviewPage';
import { AdminConfigPage } from '@/pages/admin/AdminConfigPage';
import { AdminDataQualityPage } from '@/pages/admin/AdminDataQualityPage';
import { routes } from '@/lib/routes';

export const routeTree: RouteObject[] = [
  // Design lab — standalone (paints its own chrome). Not wired into the
  // sidebar nav; reach it directly at /design-lab. Will be deleted once a
  // concept is approved and merged into production pages.
  //
  // Odoo-inspired HR ERP exploration lives at /design-lab/hr-erp. Mount it
  // before the wildcard so its route wins.
  { path: '/design-lab/hr-erp/*', element: <HrErpDesignLab /> },
  { path: '/design-lab/*',        element: <DesignLabPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={routes.dashboard} replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'employees/:id', element: <EmployeeProfilePage /> },
      { path: 'contracts', element: <ContractsPage /> },
      { path: 'insurance', element: <InsurancePage /> },
      // Legacy routes — kept working for backward compatibility. New nav
      // entries route through the Admin module at /admin/*.
      { path: 'imports',  element: <ImportsPage /> },
      { path: 'imports/new', element: <ImportsPage /> },
      { path: 'review',   element: <ReviewQueuePage /> },
      { path: 'users',    element: <UsersPage /> },
      { path: 'settings', element: <SettingsPage /> },

      // Phase 8 — Admin module. AdminGuard short-circuits non-admin /
      // non-hr_manager callers with a friendly forbidden surface. Worker
      // endpoints remain the source of truth via requireAdmin.
      {
        path: 'admin',
        element: <AdminGuard />,
        children: [
          { index: true,            element: <AdminDashboardPage /> },
          { path: 'import',         element: <AdminImportPage /> },
          { path: 'import-review',          element: <AdminImportReviewPage /> },
          { path: 'import-review/:jobId',   element: <AdminImportReviewPage /> },
          { path: 'review',         element: <ReviewQueuePage /> },
          { path: 'import-history', element: <AdminPage /> },
          { path: 'users',          element: <UsersPage /> },
          { path: 'config',         element: <AdminConfigPage /> },
          { path: 'data-quality',   element: <AdminDataQualityPage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
