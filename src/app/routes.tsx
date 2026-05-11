import { Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { ContractsPage } from '@/pages/ContractsPage';
import { InsurancePage } from '@/pages/InsurancePage';
import { ImportsPage } from '@/pages/ImportsPage';
import { ReviewQueuePage } from '@/pages/ReviewQueuePage';
import { UsersPage } from '@/pages/UsersPage';
import { AdminPage } from '@/pages/AdminPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { routes } from '@/lib/routes';

export const routeTree: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={routes.dashboard} replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'employees', element: <EmployeesPage /> },
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
