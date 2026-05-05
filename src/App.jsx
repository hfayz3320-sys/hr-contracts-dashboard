import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import ForbiddenPage from './pages/ForbiddenPage';
import HRDashboardLayout from './modules/hr/HRDashboardLayout';
import { useAuthStore } from './auth/useAuthStore';
import PublicRoute from './security/guards/PublicRoute';
import ProtectedRoute from './security/guards/ProtectedRoute';
import { MODULES } from './security/config/modules';
import { PAGE_KEYS } from './security/config/pages';
import { permissionService } from './security/services/permissionService';

// Phase 2 — identity-centric import UI. Routes gated by FEATURE_FLAGS.newImports.
import ImportDashboardPage from './pages/ImportDashboardPage';
import ReviewQueuePage    from './pages/ReviewQueuePage';
import PersonsListPage    from './pages/PersonsListPage';
import PersonProfilePage  from './pages/PersonProfilePage';

function HomeRedirect() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const access = permissionService.resolveUserAccess(currentUser, roles);
  return <Navigate to={permissionService.getDefaultRoute(access)} replace />;
}

function HRModuleRedirect() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);
  const access = permissionService.resolveUserAccess(currentUser, roles);
  const accessiblePages = permissionService.getAccessiblePages(access, MODULES.HR_MODULE);

  return (
    <Navigate
      to={accessiblePages[0]?.route || permissionService.getDefaultRoute(access)}
      replace
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/forbidden"
          element={
            <ProtectedRoute>
              <ForbiddenPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute pageKey={PAGE_KEYS.ADMIN}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hr"
          element={
            <ProtectedRoute moduleKey={MODULES.HR_MODULE}>
              <HRModuleRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hr/:pageSlug"
          element={
            <ProtectedRoute moduleKey={MODULES.HR_MODULE}>
              <HRDashboardLayout />
            </ProtectedRoute>
          }
        />

        {/*
          Phase 2 — identity-centric routes. Each page checks
          FEATURE_FLAGS.newImports internally and shows a "disabled" notice
          when the flag is off. Routes are mounted unconditionally so the
          flag can be toggled at runtime via localStorage without a rebuild.
        */}
        <Route
          path="/v3/imports"
          element={
            <ProtectedRoute>
              <ImportDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/v3/review-queue"
          element={
            <ProtectedRoute>
              <ReviewQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/v3/persons"
          element={
            <ProtectedRoute>
              <PersonsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/v3/persons/:identityNumber"
          element={
            <ProtectedRoute>
              <PersonProfilePage />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
