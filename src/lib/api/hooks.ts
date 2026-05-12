import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  ImportUploadRequest,
  ImportDryRunRequest,
  ImportCommitRequest,
  ReviewResolveRequest,
  ReviewDismissRequest,
  EmployeePatchRequest,
  InsurancePatchRequest,
  ContractPatchRequest,
  AppUserCreateRequest,
  AppUserPatchRequest,
  AppUserDeactivateRequest,
  ReviewApproveRequest,
  ReviewRejectRequest,
  // Phase 10 — Employee 360 action create/patch requests.
  EmployeeTimelineEntryCreateRequest,
  EmployeeActivityCreateRequest,
  EmployeeActivityPatchRequest,
  EmployeeCompensationCreateRequest,
  EmployeeLearningCreateRequest,
  EmployeeTransactionCreateRequest,
} from '@shared/api-contract';

export const queryKeys = {
  health:        ['health'] as const,
  employees:     ['employees'] as const,
  employee:      (id: string) => ['employee', id] as const,
  employee360:   (id: string) => ['employee', '360', id] as const,
  contracts:     (includeEmployee?: boolean) =>
    includeEmployee ? (['contracts', { includeEmployee: true }] as const) : (['contracts'] as const),
  insurance:     (includeEmployee?: boolean) =>
    includeEmployee ? (['insurance', { includeEmployee: true }] as const) : (['insurance'] as const),
  importJobs:    ['import-jobs'] as const,
  importJob:     (id: string) => ['import-job', id] as const,
  importJobItems: (id: string) => ['import-job-items', id] as const,
  reviewQueue:   (status?: string) => (status ? ['review-queue', status] as const : ['review-queue'] as const),
  auditEvents:   ['audit-events'] as const,
  sourceFiles:   ['source-files'] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: api.health });
}

export function useEmployees(enabled = true) {
  return useQuery({ queryKey: queryKeys.employees, queryFn: api.employees, enabled });
}

export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.employee(id) : ['employee', 'none'],
    queryFn: () => (id ? api.employee(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
  });
}

/**
 * A5.1 — Employee 360 aggregate hook. Same endpoint as `useEmployee` but
 * the response shape includes documents / transactions / dataQuality.
 */
export function useEmployee360(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.employee360(id) : ['employee', '360', 'none'],
    queryFn: () => (id ? api.employee360(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
  });
}

export function useContracts(enabled = true, opts: { includeEmployee?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.contracts(opts.includeEmployee),
    queryFn: () => api.contracts(opts),
    enabled,
  });
}

export function useInsurance(enabled = true, opts: { includeEmployee?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.insurance(opts.includeEmployee),
    queryFn: () => api.insurance(opts),
    enabled,
  });
}

export function useImportJobs(enabled = true) {
  return useQuery({ queryKey: queryKeys.importJobs, queryFn: api.importJobs, enabled });
}

export function useImportJob(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.importJob(id) : ['import-job', 'none'],
    queryFn: () => (id ? api.importJob(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
  });
}

export function useImportJobItems(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.importJobItems(id) : ['import-job-items', 'none'],
    queryFn: () => (id ? api.importJobItems(id) : Promise.reject(new Error('no id'))),
    enabled: !!id,
  });
}

export function useReviewQueue(status?: 'open' | 'resolved' | 'dismissed') {
  return useQuery({
    queryKey: queryKeys.reviewQueue(status),
    queryFn: () => api.reviewQueue(status),
  });
}

export function useAuditEvents(enabled = true) {
  return useQuery({ queryKey: queryKeys.auditEvents, queryFn: api.auditEvents, enabled });
}

export function useSourceFiles(enabled = true) {
  return useQuery({ queryKey: queryKeys.sourceFiles, queryFn: api.sourceFiles, enabled });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Invalidate every query that depends on persisted data so the dashboard
 * automatically refreshes after a successful commit. Used by both the import
 * wizard and the review-queue resolve flow.
 */
export function useInvalidateDataset() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['insurance'] });
    qc.invalidateQueries({ queryKey: ['import-jobs'] });
    qc.invalidateQueries({ queryKey: ['review-queue'] });
    qc.invalidateQueries({ queryKey: ['audit-events'] });
    qc.invalidateQueries({ queryKey: ['source-files'] });
  };
}

export function useImportUpload() {
  return useMutation({
    mutationFn: (payload: ImportUploadRequest) => api.importsUpload(payload),
  });
}

/**
 * Multipart upload of the RAW file bytes to the private R2 bucket. Required
 * before commit in production — the server enforces source traceability and
 * refuses to commit a job whose raw bytes were never persisted.
 */
export function useImportUploadRaw() {
  return useMutation({
    mutationFn: (args: { file: File; type: 'employees' | 'insurance' | 'contracts'; fileHash: string }) =>
      api.importsUploadRaw(args),
  });
}

export function useImportDryRun() {
  return useMutation({
    mutationFn: (payload: ImportDryRunRequest) => api.importsDryRun(payload),
  });
}

export function useImportCommit() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (payload: ImportCommitRequest) => api.importsCommit(payload),
    onSuccess: () => invalidate(),
  });
}

export function useReviewResolve() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: ReviewResolveRequest }) =>
      api.reviewResolve(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

export function useReviewDismiss() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: ReviewDismissRequest }) =>
      api.reviewDismiss(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

// ============================================================================
// Phase 2D — entity edit hooks
// ============================================================================

export function usePatchEmployee() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: EmployeePatchRequest }) =>
      api.patchEmployee(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

export function usePatchInsurance() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: InsurancePatchRequest }) =>
      api.patchInsurance(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

export function usePatchContract() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: ContractPatchRequest }) =>
      api.patchContract(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

// ============================================================================
// Phase 2E — Users CRUD
// ============================================================================

export const userQueryKeys = {
  list: ['app-users'] as const,
};

export function useAppUsers() {
  return useQuery({ queryKey: userQueryKeys.list, queryFn: api.users });
}

export function useCreateAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AppUserCreateRequest) => api.createAppUser(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.list }),
  });
}

export function usePatchAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: AppUserPatchRequest }) =>
      api.patchAppUser(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.list }),
  });
}

export function useDeactivateAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: AppUserDeactivateRequest }) =>
      api.deactivateAppUser(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: userQueryKeys.list }),
  });
}

// ============================================================================
// Phase 2E — Review approve / reject
// ============================================================================

export function useReviewApprove() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: ReviewApproveRequest }) =>
      api.reviewApprove(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

export function useReviewReject() {
  const invalidate = useInvalidateDataset();
  return useMutation({
    mutationFn: (args: { id: string; payload: ReviewRejectRequest }) =>
      api.reviewReject(args.id, args.payload),
    onSuccess: () => invalidate(),
  });
}

// ============================================================================
// Phase 10 — Employee 360 action mutations.
// Each mutation invalidates the matching Employee 360 query so the profile
// updates immediately after a write succeeds.
// ============================================================================

function useEmp360Invalidator(employeeId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.employee360(employeeId) });
}

export function useCreateEmployeeMessage(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (payload: EmployeeTimelineEntryCreateRequest) =>
      api.createEmployeeMessage(employeeId, payload),
    onSuccess: () => invalidate(),
  });
}

export function useCreateEmployeeNote(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (payload: EmployeeTimelineEntryCreateRequest) =>
      api.createEmployeeNote(employeeId, payload),
    onSuccess: () => invalidate(),
  });
}

export function useCreateEmployeeActivity(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (payload: EmployeeActivityCreateRequest) =>
      api.createEmployeeActivity(employeeId, payload),
    onSuccess: () => invalidate(),
  });
}

export function usePatchEmployeeActivity(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (args: { activityId: string; payload: EmployeeActivityPatchRequest }) =>
      api.patchEmployeeActivity(args.activityId, args.payload),
    onSuccess: () => invalidate(),
  });
}

export function useCreateEmployeeCompensation(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (payload: EmployeeCompensationCreateRequest) =>
      api.createEmployeeCompensation(employeeId, payload),
    onSuccess: () => invalidate(),
  });
}

export function useCreateEmployeeLearning(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (payload: EmployeeLearningCreateRequest) =>
      api.createEmployeeLearning(employeeId, payload),
    onSuccess: () => invalidate(),
  });
}

/**
 * Multipart upload — see `api.uploadEmployeeDocument`. Invalidates the
 * Employee 360 query so the Documents tab refreshes after success.
 */
export function useUploadEmployeeDocument(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (args: {
      file: File;
      type: string;
      expiresAt?: string | null;
      docNumber?: string | null;
      notes?: string | null;
      isCurrent?: boolean;
    }) => api.uploadEmployeeDocument(employeeId, args),
    onSuccess: () => invalidate(),
  });
}

export function useCreateEmployeeTransaction(employeeId: string) {
  const invalidate = useEmp360Invalidator(employeeId);
  return useMutation({
    mutationFn: (payload: EmployeeTransactionCreateRequest) =>
      api.createEmployeeTransaction(employeeId, payload),
    onSuccess: () => invalidate(),
  });
}
