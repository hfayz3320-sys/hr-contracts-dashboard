/**
 * Phase 4A — unit tests for the read-time document-status computer.
 *
 * The priority order is the contract:
 *
 *   1. archived          (terminal — is_current=0 OR storedStatus='archived')
 *   2. review_required   (manual flag OR missing-required-fields-for-type)
 *   3. expired           (expires_at < today, well-formed)
 *   4. active            (default)
 *
 * These tests assert each precedence step plus the type-specific
 * required-field matrix.
 */
import { describe, it, expect } from 'vitest';
import { computeEmployeeDocumentStatus } from '../../worker/src/lib/employee-document-status';

const TODAY = new Date().toISOString().slice(0, 10);
const yesterday = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();
const farFuture = '2999-12-31';

describe('computeEmployeeDocumentStatus', () => {
  it('archived wins over expired/review/active when isCurrent=0', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active', // stored disagrees
      isCurrent: false,
      reviewRequired: true,
      docNumber: '1234567890',
      expiresAt: yesterday,
    });
    expect(s).toBe('archived');
  });

  it('archived wins when storedStatus=archived even if isCurrent=1', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'archived',
      isCurrent: true,
      reviewRequired: false,
      docNumber: '1234567890',
      expiresAt: farFuture,
    });
    expect(s).toBe('archived');
  });

  it('review_required when manual flag is set', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: true,
      docNumber: '1234567890',
      expiresAt: farFuture,
    });
    expect(s).toBe('review_required');
  });

  it('review_required when iqama is missing doc_number', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: null,
      expiresAt: farFuture,
    });
    expect(s).toBe('review_required');
  });

  it('review_required when iqama is missing expires_at', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: '1234567890',
      expiresAt: null,
    });
    expect(s).toBe('review_required');
  });

  it('expired when isCurrent=1, not flagged, but expires_at < today', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active', // stored disagrees → expired wins
      isCurrent: true,
      reviewRequired: false,
      docNumber: '1234567890',
      expiresAt: yesterday,
    });
    expect(s).toBe('expired');
  });

  it('active when current, no review, well-formed expires_at in future', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: '1234567890',
      expiresAt: farFuture,
    });
    expect(s).toBe('active');
  });

  it('active for `other` even with no required fields', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'other',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
    });
    expect(s).toBe('active');
  });

  it('contract_pdf needs source_file_id — without it, review_required', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'contract_pdf',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      sourceFileId: null,
    });
    expect(s).toBe('review_required');
  });

  it('contract_pdf is active when source_file_id is supplied', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'contract_pdf',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      sourceFileId: 'sha256-abc',
    });
    expect(s).toBe('active');
  });

  it('medical_certificate needs issued_at — missing → review_required', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'medical_certificate',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      issuedAt: null,
    });
    expect(s).toBe('review_required');
  });

  it('medical_certificate active when issued_at present', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'medical_certificate',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      issuedAt: '2024-01-15',
    });
    expect(s).toBe('active');
  });

  it('work_permit only needs expires_at (doc_number optional)', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'work_permit',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: null,
      expiresAt: farFuture,
    });
    expect(s).toBe('active');
  });

  it('insurance_card needs doc_number — missing → review_required', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'insurance_card',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: null,
    });
    expect(s).toBe('review_required');
  });

  it('malformed expires_at is ignored (no false-positive expired)', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: '1',
      expiresAt: 'not-a-date',
    });
    // Note: docNumber='1' AND expiresAt missing-shape — but the function
    // considers expiresAt as 'present' (non-empty string) for the
    // required-field check. It only ignores it for the < today numeric
    // compare. So this row is active.
    expect(s).toBe('active');
  });

  it('today value of TODAY is not expired (boundary inclusive)', () => {
    const s = computeEmployeeDocumentStatus({
      type: 'iqama',
      storedStatus: 'active',
      isCurrent: true,
      reviewRequired: false,
      docNumber: '1234567890',
      expiresAt: TODAY,
    });
    expect(s).toBe('active');
  });
});
