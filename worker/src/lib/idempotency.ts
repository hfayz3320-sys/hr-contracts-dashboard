/**
 * Phase 4A A2 — idempotency helper for employee_transactions.
 *
 * Contract recap (mirrors shared/api-contract.ts comment block above
 * `employeeTransactionCreateRequest`):
 *
 *   1. NULL key                       → always insert a new row. SQLite
 *                                       treats multiple NULLs as distinct
 *                                       under UNIQUE.
 *   2. Same key + same canonical body → API returns 200 with the existing
 *                                       row (exactly-once retry).
 *   3. Same key + different body      → API returns 409 Conflict. The
 *                                       stored row is NOT updated.
 *
 * "Canonical body" is the subset of fields enumerated by
 * `employeeTransactionIdempotencyEqualityKeys`. Drift between this helper
 * and the canonical list is what we explicitly want to make hard, so we
 * IMPORT that list and iterate over it — there is no second hard-coded
 * field list here.
 *
 * Stability rules
 * ---------------
 *   * Missing key in input  → treated as null. Two requests where one
 *                              omits `currency` and the other sets it to
 *                              null are considered equal.
 *   * Empty string vs null  → NOT treated as equal. `currency: ''` and
 *                              `currency: null` produce different
 *                              canonical strings. If you mean "no value",
 *                              send null.
 *   * Object payloads       → recursively key-sorted so
 *                              `{ a:1, b:2 }` and `{ b:2, a:1 }` produce
 *                              the same canonical string.
 *   * Arrays                → order is preserved (positional meaning).
 *
 * The output is a deterministic string suitable for `===` comparison.
 * No cryptographic hashing — equality of two requests is checked by
 * comparing canonical strings directly. We never persist the canonical
 * body; we recompute it on each lookup against the stored row's
 * fields.
 */
import {
  employeeTransactionIdempotencyEqualityKeys,
  type EmployeeTransaction,
  type EmployeeTransactionCreateRequest,
} from '@shared/api-contract';

/**
 * Subset of any object containing only the idempotency equality keys.
 * Used both for incoming create requests and for "request-shaped"
 * projections of stored transaction rows.
 */
type IdempotencyComparable = Partial<
  Pick<
    EmployeeTransactionCreateRequest,
    (typeof employeeTransactionIdempotencyEqualityKeys)[number]
  >
>;

/**
 * Defaults applied at insert time. We MUST apply the same defaults before
 * canonicalizing an incoming request, otherwise:
 *
 *   incoming { type, title, payload }           — status undefined
 *   stored   { type, title, payload, status='requested' }
 *
 * would canonicalize differently and a same-key retry would 409 itself.
 *
 * Single source of truth: routes use `applyTransactionInsertDefaults` for
 * both the canonical comparison and the actual insert. Tests assert the
 * two paths agree.
 */
export function applyTransactionInsertDefaults(
  input: EmployeeTransactionCreateRequest,
): EmployeeTransactionCreateRequest {
  return {
    ...input,
    status: input.status ?? 'requested',
    payloadSchemaVersion: input.payloadSchemaVersion ?? 1,
    reviewRequired: input.reviewRequired ?? false,
  };
}

/**
 * Stable JSON.stringify — objects' keys are sorted recursively. Arrays
 * keep their order. Falls back to JSON.stringify for primitives, null
 * and undefined.
 */
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  );
}

/**
 * Returns the canonical comparable string for an idempotency-comparable
 * input. Missing keys are normalized to null so omission vs explicit-null
 * is treated equal.
 */
export function canonicalIdempotencyBody(input: IdempotencyComparable): string {
  const subset: Record<string, unknown> = {};
  for (const k of employeeTransactionIdempotencyEqualityKeys) {
    const v = (input as Record<string, unknown>)[k];
    subset[k] = v === undefined ? null : v;
  }
  return stableStringify(subset);
}

/**
 * Project a stored EmployeeTransaction row to the idempotency-comparable
 * shape (i.e. the same shape the create request had). Use this when
 * checking whether a re-submitted request matches a stored row.
 *
 * Note we explicitly do NOT include `metadata`, `createdBy/At`,
 * `updatedBy/At`, or `idempotencyKey` — those are excluded from the
 * equality check per the contract.
 */
export function storedTransactionToComparable(
  t: EmployeeTransaction,
): IdempotencyComparable {
  return {
    type: t.type,
    status: t.status,
    title: t.title,
    effectiveDate: t.effectiveDate,
    endDate: t.endDate,
    amount: t.amount,
    currency: t.currency,
    refNumber: t.refNumber,
    payload: t.payload,
    payloadSchemaVersion: t.payloadSchemaVersion,
    sourceFileId: t.sourceFileId,
    reviewRequired: t.reviewRequired,
    reviewReason: t.reviewReason,
  };
}

/**
 * `true` if two requests have the same canonical idempotency body.
 * Convenience wrapper around `canonicalIdempotencyBody`.
 */
export function idempotencyBodiesEqual(
  a: IdempotencyComparable,
  b: IdempotencyComparable,
): boolean {
  return canonicalIdempotencyBody(a) === canonicalIdempotencyBody(b);
}
