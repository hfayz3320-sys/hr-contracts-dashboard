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
      { path: 'imports',  element: <ImportsPage /> },
      { path: 'imports/new', element: <ImportsPage /> },
      { path: 'review',   element: <ReviewQueuePage /> },
      { path: 'users',    element: <UsersPage /> },
      { path: 'admin',    element: <AdminPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
