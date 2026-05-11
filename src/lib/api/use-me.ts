/**
 * useMe — react-query hook for the authenticated user.
 *
 * Calls /api/me same-origin (the Pages Function proxies it to the Worker,
 * which validates the CF Access JWT and resolves the user against the
 * app_users table). Returns:
 *
 *   - data:    MeResponse  (email, displayName, role, isAdmin, …)
 *   - error:   set if 401/403 — meaning the user is authenticated by Access
 *              but either unprovisioned in app_users or disabled.
 *   - isLoading
 *
 * Cache TTL is generous (5 minutes) because the answer only changes when
 * an admin edits the user record. Mutations on the user CRUD endpoints
 * should invalidate this query.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { MeResponse } from '@shared/api-contract';

export const ME_QUERY_KEY = ['me'] as const;

export function useMe() {
  return useQuery<MeResponse, Error>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.me(),
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      // Don't retry on 401/403 — those are intentional rejections, not
      // transient failures.
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });
}
