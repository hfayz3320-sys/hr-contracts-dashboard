/**
 * Phase 8 — FE admin-access predicates.
 *
 * Pins the rule used by AdminGuard, the sidebar's nav filter, and the
 * mobile sheet. The server is still the source of truth — these tests
 * just keep the UX layer honest.
 */
import { describe, it, expect } from 'vitest';
import { canAccessAdmin, canPerformAdminWrites } from '../../src/lib/auth';
import type { MeResponse } from '../../shared/api-contract';

function me(over: Partial<MeResponse>): MeResponse {
  return {
    email: 'x@y.z',
    displayName: 'X',
    role: 'viewer',
    isAdmin: false,
    status: 'active',
    authProvider: 'cloudflare_access',
    lastLoginAt: null,
    ...over,
  };
}

describe('canAccessAdmin', () => {
  it('allows isAdmin=true', () => {
    expect(canAccessAdmin(me({ role: 'admin', isAdmin: true }))).toBe(true);
  });

  it('allows role=hr_manager even when isAdmin=false', () => {
    // hr_manager is a read-with-elevated-visibility role; they can see the
    // admin module but not perform admin-only writes.
    expect(canAccessAdmin(me({ role: 'hr_manager', isAdmin: false }))).toBe(true);
  });

  it('rejects role=viewer', () => {
    expect(canAccessAdmin(me({ role: 'viewer', isAdmin: false }))).toBe(false);
  });

  it('rejects disabled accounts regardless of role', () => {
    expect(canAccessAdmin(me({ role: 'admin', isAdmin: true, status: 'disabled' }))).toBe(false);
    expect(canAccessAdmin(me({ role: 'hr_manager', status: 'disabled' }))).toBe(false);
  });

  it('rejects undefined / null /api/me responses', () => {
    expect(canAccessAdmin(undefined)).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });
});

describe('canPerformAdminWrites', () => {
  it('allows only isAdmin=true', () => {
    expect(canPerformAdminWrites(me({ role: 'admin', isAdmin: true }))).toBe(true);
  });

  it('rejects hr_manager (read-only in admin module)', () => {
    expect(canPerformAdminWrites(me({ role: 'hr_manager', isAdmin: false }))).toBe(false);
  });

  it('rejects viewer and disabled', () => {
    expect(canPerformAdminWrites(me({ role: 'viewer' }))).toBe(false);
    expect(canPerformAdminWrites(me({ role: 'admin', isAdmin: true, status: 'disabled' }))).toBe(false);
  });
});
