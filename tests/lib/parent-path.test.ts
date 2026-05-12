/**
 * Phase 9 — parentPathFor rule table.
 *
 * Pins the rule set used by PathBackButton so a route refactor can't
 * silently change "Back" destinations. The function is pure — no router
 * involvement — so this is a plain unit test.
 */
import { describe, it, expect } from 'vitest';
import { parentPathFor } from '../../src/lib/parent-path';

describe('parentPathFor', () => {
  it('returns null for the admin dashboard itself', () => {
    expect(parentPathFor('/admin')).toBeNull();
  });

  it('returns /admin for every admin sub-route', () => {
    expect(parentPathFor('/admin/import')).toBe('/admin');
    expect(parentPathFor('/admin/review')).toBe('/admin');
    expect(parentPathFor('/admin/import-history')).toBe('/admin');
    expect(parentPathFor('/admin/users')).toBe('/admin');
    expect(parentPathFor('/admin/config')).toBe('/admin');
    expect(parentPathFor('/admin/data-quality')).toBe('/admin');
  });

  it('returns /admin for any nested admin route (prefix rule)', () => {
    // Defensive: when a future sub-route nests further, the parent should
    // still be the admin dashboard.
    expect(parentPathFor('/admin/users/usr_123')).toBe('/admin');
    expect(parentPathFor('/admin/data-quality/contracts')).toBe('/admin');
  });

  it('returns /employees for an employee detail route', () => {
    expect(parentPathFor('/employees/emp-0001')).toBe('/employees');
    expect(parentPathFor('/employees/emp-with-dashes-0042')).toBe('/employees');
  });

  it('returns null for the employees list itself', () => {
    expect(parentPathFor('/employees')).toBeNull();
  });

  it('returns null for top-level pages that have no parent', () => {
    for (const p of [
      '/dashboard',
      '/contracts',
      '/insurance',
      '/imports',
      '/review',
      '/users',
      '/settings',
      '/',
    ]) {
      expect(parentPathFor(p)).toBeNull();
    }
  });

  it('returns null for unknown paths', () => {
    expect(parentPathFor('/no-such-route')).toBeNull();
    expect(parentPathFor('/employees-without-slash')).toBeNull();
  });
});
