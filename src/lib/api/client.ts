/**
 * Frontend API client.
 *
 * - Reads `VITE_API_BASE_URL` (e.g. `http://localhost:8787`).
 * - In **production** the value is intentionally empty so that all API calls
 *   are **same-origin** (`fetch('/api/employees')`). The Pages Function at
 *   `functions/api/[[path]].ts` proxies them to the production Worker. This
 *   is what lets the Cloudflare Access JWT (set as a cookie on the Pages
 *   hostname) reach the Worker — a direct cross-origin XHR to the Worker
 *   hostname could not carry that cookie.
 * - In **dev**, an empty value triggers `ApiUnavailableError`, which the
 *   provider catches to fall back to synthetic data. Set
 *   `VITE_API_BASE_URL=http://localhost:8787` in `.env.local` to talk to a
 *   real local worker.
 * - All response bodies are validated against the shared zod schemas, so
 *   wire-format drift surfaces immediately instead of silently corrupting UI.
 * - Admin-only endpoints carry the dev admin email via `X-Dev-Admin-Email`
 *   in development; production relies on Cloudflare Access.
 */
import {
  API_PATHS,
  auditEventsListResponse,
  contractsListResponse,
  employeeDetailResponse,
  employee360Response,
  employeesListResponse,
  healthResponseSchema,
  importJobsListResponse,
  importJobDetailResponse,
  importJobItemsResponse,
  importDryRunResponse,
  importUploadResponse,
  importUploadRawResponse,
  importCommitResponse,
  insuranceListResponse,
  meResponseSchema,
  appUsersListResponse,
  appUserSchema,
  reviewQueueListResponse,
  reviewActionResponse,
  sourceFilesListResponse,
  employeePatchResponse,
  insurancePatchResponse,
  contractPatchResponse,
  appUserPatchResponse,
  debugCountsResponse,
} from '@shared/api-contract';
import type { z } from 'zod';
import type {
  importDryRunRequest,
  importUploadRequest,
  importCommitRequest,
  reviewResolveRequest,
  reviewDismissRequest,
  employeePatchRequest,
  insurancePatchRequest,
  contractPatchRequest,
  appUserCreateRequest,
  appUserPatchRequest,
  appUserDeactivateRequest,
  reviewApproveRequest,
  reviewRejectRequest,
} from '@shared/api-contract';
import { adminHeaders } from './admin';

/**
 * Resolve the API base URL.
 *
 * Phase 3A hotfix: in PRODUCTION builds we hard-strip any localhost /
 * 127.0.0.1 / private-network URL even if a `.env.local` accidentally
 * leaks into the build. A baked-in `http://localhost:8787` made every
 * production fetch cross-origin to a private network address, which
 * Chrome surfaces as the "Access other apps and services on this
 * device" Private Network Access prompt and then fails as
 * "Failed to fetch" because the URL is unreachable from the user's
 * device. In production we always want same-origin `/api/*` so the
 * Pages Function proxy forwards through Cloudflare Access.
 */
function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  if (!raw) return '';
  if (import.meta.env.PROD) {
    // Forbid private / loopback hosts in the production bundle.
    if (/^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(raw)) {
      // eslint-disable-next-line no-console
      console.warn('[api] ignoring private-network VITE_API_BASE_URL in production:', raw);
      return '';
    }
  }
  return raw;
}

export const API_BASE_URL: string = resolveApiBase();

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

type RequestOpts = RequestInit & { admin?: boolean };

async function request<T extends z.ZodTypeAny>(
  schema: T,
  path: string,
  opts: RequestOpts = {},
): Promise<z.infer<T>> {
  // Empty API_BASE_URL is valid in production (same-origin via Pages Function
  // proxy at /api/*). Only surface as ApiUnavailableError in dev, where it
  // signals "no API configured → use synthetic dataset".
  if (!API_BASE_URL && import.meta.env.DEV) {
    throw new ApiUnavailableError('VITE_API_BASE_URL is not set');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.admin ? adminHeaders() : {}),
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  } catch (err) {
    throw new ApiUnavailableError(
      err instanceof Error ? `Network error: ${err.message}` : 'Network error',
    );
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    const err = new Error(`API ${path} → ${res.status}: ${msg}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Surface the full zod issue list in dev — silently failing on schema drift
    // was the bug behind "Employees page shows 0" in Phase 2F: one malformed
    // row would reject the entire 501-row response, which then got mapped to
    // `[]` by the provider's Promise.allSettled fallback. Now the dev console
    // prints every issue with its path, and the production error message
    // includes the first few issues (no row data) so an admin debug panel can
    // display it without leaking PII.
    const issues = parsed.error.issues;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(
        `[api] zod validation failed for ${path} — ${issues.length} issue(s):`,
        issues,
        '\nReceived top-level keys:',
        json && typeof json === 'object' ? Object.keys(json) : typeof json,
      );
    }
    const preview = issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : '';
    throw new Error(`API ${path} returned invalid payload — ${preview}${more}`);
  }
  return parsed.data as z.infer<T>;
}

export const api = {
  health: () => request(healthResponseSchema, API_PATHS.health),
  me: () => request(meResponseSchema, API_PATHS.me),
  users: () => request(appUsersListResponse, API_PATHS.users),
  createUser: (payload: { email: string; displayName?: string; role: 'admin' | 'hr_manager' | 'viewer' | 'disabled' }) =>
    request(appUserSchema, API_PATHS.users, {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  updateUser: (id: string, payload: { displayName?: string | null; role?: 'admin' | 'hr_manager' | 'viewer' | 'disabled' }) =>
    request(appUserSchema, API_PATHS.user(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
      admin: true,
    }),
  disableUser: (id: string) =>
    request(appUserSchema, API_PATHS.userDisable(id), { method: 'PATCH', admin: true }),
  enableUser: (id: string) =>
    request(appUserSchema, API_PATHS.userEnable(id), { method: 'PATCH', admin: true }),
  employees: () => request(employeesListResponse, API_PATHS.employees),
  employee: (id: string) => request(employeeDetailResponse, API_PATHS.employee(id)),
  /**
   * Phase 4A (A5.1) — Employee 360 aggregate.
   *
   * Returns the same employee/contracts/insurance/audit payload as `employee()`
   * plus `documents`, `transactions`, and (admin/hr) `dataQuality`. The
   * underlying endpoint is identical (`GET /api/employees/:id`); the only
   * difference is the response schema we validate against.
   */
  employee360: (id: string) => request(employee360Response, API_PATHS.employee(id)),
  /**
   * @param opts.includeEmployee — when true, each contract row carries an
   *   `employeeSummary` (id, name, redacted identity, employee number,
   *   department, jobTitle) plus `linkStatus`. Required by the Contracts
   *   page so employee names render even if a parallel /api/employees
   *   call fails.
   */
  contracts: (opts: { includeEmployee?: boolean } = {}) =>
    request(
      contractsListResponse,
      opts.includeEmployee ? `${API_PATHS.contracts}?includeEmployee=1` : API_PATHS.contracts,
    ),
  /** Same flag semantics as `contracts`. */
  insurance: (opts: { includeEmployee?: boolean } = {}) =>
    request(
      insuranceListResponse,
      opts.includeEmployee ? `${API_PATHS.insurance}?includeEmployee=1` : API_PATHS.insurance,
    ),
  importJobs: () => request(importJobsListResponse, API_PATHS.importJobs),
  importJob: (id: string) => request(importJobDetailResponse, API_PATHS.importJob(id)),
  importJobItems: (id: string) =>
    request(importJobItemsResponse, API_PATHS.importJobItems(id)),
  reviewQueue: (status?: 'open' | 'resolved' | 'dismissed') =>
    request(
      reviewQueueListResponse,
      status ? `${API_PATHS.reviewQueue}?status=${status}` : API_PATHS.reviewQueue,
    ),
  auditEvents: () => request(auditEventsListResponse, API_PATHS.auditEvents),
  sourceFiles: () => request(sourceFilesListResponse, API_PATHS.sourceFiles),

  // ---- admin-only mutations ------------------------------------------------
  importsUpload: (payload: z.infer<typeof importUploadRequest>) =>
    request(importUploadResponse, API_PATHS.importsUpload, {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),

  /**
   * Upload the RAW file bytes via multipart/form-data — required for
   * production traceability. The server recomputes and verifies the SHA-256.
   */
  importsUploadRaw: async (args: { file: File; type: 'employees' | 'insurance' | 'contracts'; fileHash: string }) => {
    if (!API_BASE_URL && import.meta.env.DEV) throw new ApiUnavailableError('VITE_API_BASE_URL is not set');
    const fd = new FormData();
    fd.append('file', args.file);
    fd.append('type', args.type);
    fd.append('hash', args.fileHash);
    const headers = adminHeaders();
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${API_PATHS.importsUploadRaw}`, {
        method: 'POST',
        body: fd,
        headers,
      });
    } catch (err) {
      throw new ApiUnavailableError(err instanceof Error ? err.message : 'Network error');
    }
    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const msg = typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message) : `HTTP ${res.status}`;
      throw new Error(`API ${API_PATHS.importsUploadRaw} → ${res.status}: ${msg}`);
    }
    const json = await res.json();
    const parsed = importUploadRawResponse.safeParse(json);
    if (!parsed.success) throw new Error(`upload-raw bad payload: ${parsed.error.message}`);
    return parsed.data;
  },
  importsDryRun: (payload: z.infer<typeof importDryRunRequest>) =>
    request(importDryRunResponse, API_PATHS.importsDryRun, {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  importsCommit: (payload: z.infer<typeof importCommitRequest>) =>
    request(importCommitResponse, API_PATHS.importsCommit, {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  reviewResolve: (id: string, payload: z.infer<typeof reviewResolveRequest>) =>
    request(reviewActionResponse, API_PATHS.reviewResolve(id), {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  reviewDismiss: (id: string, payload: z.infer<typeof reviewDismissRequest>) =>
    request(reviewActionResponse, API_PATHS.reviewDismiss(id), {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  // Phase 2D — entity edit endpoints (admin-only).
  patchEmployee: (id: string, payload: z.infer<typeof employeePatchRequest>) =>
    request(employeePatchResponse, API_PATHS.employeePatch(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
      admin: true,
    }),
  patchInsurance: (id: string, payload: z.infer<typeof insurancePatchRequest>) =>
    request(insurancePatchResponse, API_PATHS.insurancePatch(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
      admin: true,
    }),
  patchContract: (id: string, payload: z.infer<typeof contractPatchRequest>) =>
    request(contractPatchResponse, API_PATHS.contractPatch(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
      admin: true,
    }),
  // Phase 2E — Users CRUD (admin-only).
  createAppUser: (payload: z.infer<typeof appUserCreateRequest>) =>
    request(appUserPatchResponse, API_PATHS.userCreate, {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  patchAppUser: (id: string, payload: z.infer<typeof appUserPatchRequest>) =>
    request(appUserPatchResponse, API_PATHS.userPatch(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
      admin: true,
    }),
  deactivateAppUser: (id: string, payload: z.infer<typeof appUserDeactivateRequest>) =>
    request(appUserPatchResponse, API_PATHS.userDeactivate(id), {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  // Phase 2E — Review approve / reject.
  reviewApprove: (id: string, payload: z.infer<typeof reviewApproveRequest>) =>
    request(reviewActionResponse, API_PATHS.reviewApprove(id), {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  reviewReject: (id: string, payload: z.infer<typeof reviewRejectRequest>) =>
    request(reviewActionResponse, API_PATHS.reviewReject(id), {
      method: 'POST',
      body: JSON.stringify(payload),
      admin: true,
    }),
  // Phase 3A — admin debug counts (DB + schema-health probes).
  debugCounts: () =>
    request(debugCountsResponse, API_PATHS.debugCounts, { admin: true }),
};
