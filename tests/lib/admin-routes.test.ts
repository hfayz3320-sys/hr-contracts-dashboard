/**
 * Phase 8 — admin route registration sanity.
 *
 * Pins the route tree shape so a refactor can't accidentally drop one of
 * the six admin sub-routes or unmount the AdminGuard. We can't render
 * react-router in jsdom-less node tests, but we CAN walk the exported
 * routeTree and assert the structure.
 */
import { describe, it, expect } from 'vitest';
import { routeTree } from '../../src/app/routes';
import { routes } from '../../src/lib/routes';

describe('admin route tree (Phase 8)', () => {
  // Walk the tree to find the `admin` node under the AppShell child.
  function findAdminNode() {
    const appShell = routeTree.find((r) => r.path === '/');
    expect(appShell).toBeDefined();
    const admin = (appShell?.children ?? []).find((r) => r.path === 'admin');
    return admin;
  }

  it('mounts /admin under the AppShell with a guard wrapping all children', () => {
    const admin = findAdminNode();
    expect(admin).toBeDefined();
    // The guard wraps everything via <Outlet />, so the element must exist
    // and the children must be a non-empty array.
    expect(admin?.element).toBeDefined();
    expect(Array.isArray(admin?.children)).toBe(true);
    expect((admin?.children ?? []).length).toBeGreaterThan(0);
  });

  it('declares all six admin sub-routes', () => {
    const admin = findAdminNode();
    const childPaths = (admin?.children ?? []).map((c) => c.path ?? (c.index ? '<index>' : ''));
    // Index route (dashboard) + 6 named sub-routes.
    expect(childPaths).toEqual(
      expect.arrayContaining([
        '<index>',
        'import',
        'review',
        'import-history',
        'users',
        'config',
        'data-quality',
      ]),
    );
    expect(childPaths.length).toBe(7);
  });

  it('keeps legacy routes /imports, /review, /users, /admin top-level mountable', () => {
    const appShell = routeTree.find((r) => r.path === '/');
    const paths = (appShell?.children ?? []).map((c) => c.path);
    // Legacy paths still present for backward compatibility.
    expect(paths).toContain('imports');
    expect(paths).toContain('imports/new');
    expect(paths).toContain('review');
    expect(paths).toContain('users');
  });

  it('routes.ts exposes the admin sub-route constants', () => {
    // Pins the route constants so consumers (nav, dashboard cards, tests)
    // import the same paths.
    expect(routes.admin).toBe('/admin');
    expect(routes.adminImport).toBe('/admin/import');
    expect(routes.adminReview).toBe('/admin/review');
    expect(routes.adminImportHistory).toBe('/admin/import-history');
    expect(routes.adminUsers).toBe('/admin/users');
    expect(routes.adminConfig).toBe('/admin/config');
    expect(routes.adminDataQuality).toBe('/admin/data-quality');
  });
});
