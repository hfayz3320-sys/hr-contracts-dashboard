/**
 * Phase 4A A2 — employee_transactions routes.
 *
 *   GET   /api/employees/:id/transactions               — list (requireAuth)
 *   POST  /api/employees/:id/transactions               — create (requireAdmin)
 *   PATCH /api/employees/:id/transactions/:txnId        — update (requireAdmin)
 *
 * Idempotency contract (POST)
 * ---------------------------
 *   - idempotencyKey omitted/null   → always create a new row
 *   - idempotencyKey + same body    → 200, return existing row
 *   - idempotencyKey + diff body    → 409 Conflict, existing row in response
 *
 * "Same body" is defined by `employeeTransactionIdempotencyEqualityKeys`
 * in shared/api-contract.ts. The check is done by
 * `canonicalIdempotencyBody` in worker/src/lib/idempotency.ts; the two
 * lists are kept in sync (one PR, one tests asserts equality).
 *
 * Payload validation
 * ------------------
 * The `type` column is free TEXT in D1, but the API enforces the
 * canonical enum via zod. The per-type payload schema is dispatched by
 * `payloadSchemaForType(type)` and applied to `payload` if a payload was
 * supplied. Unknown types fall through to an open schema; we don't
 * reject just because nobody has filed a schema yet.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import { getEmployee } from '../db/repo-employees';
import {
  listTransactionsForEmployee,
  getTransactionById,
  findTransactionByIdempotencyKey,
  insertTransaction,
  updateTransactionFields,
} from '../db/repo-employee-transactions';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import {
  employeeTransactionCreateRequest,
  employeeTransactionPatchRequest,
  payloadSchemaForType,
} from '@shared/api-contract';
import {
  canonicalIdempotencyBody,
  storedTransactionToComparable,
  applyTransactionInsertDefaults,
} from '../lib/idempotency';

export const employeeTransactionRoutes = new Hono<AppContext>();

employeeTransactionRoutes.use('/api/employees/:id/transactions', requireAuth);
employeeTransactionRoutes.use('/api/employees/:id/transactions/*', requireAuth);

// ---- LIST -----------------------------------------------------------------

employeeTransactionRoutes.get(
  '/api/employees/:id/transactions',
  async (c) => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
    const employee = await getEmployee(c.env, id);
    if (!employee) {
      return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
    }
    const items = await listTransactionsForEmployee(c.env, id);
    return c.json({ items, total: items.length });
  },
);

// ---- CREATE (with idempotency) --------------------------------------------

employeeTransactionRoutes.post(
  '/api/employees/:id/transactions',
  requireAdmin,
  async (c) => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

    const employee = await getEmployee(c.env, id);
    if (!employee) {
      return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = employeeTransactionCreateRequest.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: 'Invalid transaction payload',
          issues: parsed.error.issues,
        },
        400,
      );
    }

    // Per-type payload validation. Skip when payload not supplied.
    if (parsed.data.payload !== undefined) {
      const payloadSchema = payloadSchemaForType(parsed.data.type);
      const pp = payloadSchema.safeParse(parsed.data.payload);
      if (!pp.success) {
        return c.json(
          {
            error: 'BAD_REQUEST',
            message: `Invalid payload for type '${parsed.data.type}'`,
            issues: pp.error.issues,
          },
          400,
        );
      }
    }

    const actor = (await getActorEmail(c)) ?? 'unknown';

    // Apply insert-defaults BEFORE both the canonical comparison and the
    // actual insert, so a same-key retry agrees with the stored row.
    const data = applyTransactionInsertDefaults(parsed.data);

    // Idempotency check. Null key → always create.
    if (data.idempotencyKey) {
      const existing = await findTransactionByIdempotencyKey(
        c.env,
        data.idempotencyKey,
      );
      if (existing) {
        const incomingCanonical = canonicalIdempotencyBody(data);
        const existingCanonical = canonicalIdempotencyBody(
          storedTransactionToComparable(existing),
        );
        if (incomingCanonical === existingCanonical) {
          // Same key + same body → return existing row, 200.
          return c.json({ ok: true as const, transaction: existing });
        }
        // Same key + different body → 409. Do NOT mutate the stored row.
        return c.json(
          {
            error: 'CONFLICT',
            message:
              'idempotencyKey collides with an existing row that has a different canonical body',
            transaction: existing,
          },
          409,
        );
      }
    }

    const txnId = newId('txn');
    await insertTransaction(c.env, {
      id: txnId,
      employeeId: id,
      type: data.type,
      status: data.status,
      title: data.title,
      effectiveDate: data.effectiveDate ?? null,
      endDate: data.endDate ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      refNumber: data.refNumber ?? null,
      payload: data.payload ?? null,
      payloadSchemaVersion: data.payloadSchemaVersion ?? 1,
      metadata: data.metadata ?? null,
      sourceFileId: data.sourceFileId ?? null,
      reviewRequired: data.reviewRequired,
      reviewReason: data.reviewReason ?? null,
      idempotencyKey: data.idempotencyKey ?? null,
      actor,
    });

    const created = await getTransactionById(c.env, txnId);
    if (!created) {
      return c.json(
        { error: 'INTERNAL_ERROR', message: 'Insert succeeded but re-read failed' },
        500,
      );
    }

    await writeAudit(c.env, {
      actor,
      action: 'employee_transaction.created',
      target: txnId,
      status: 'ok',
      details: `Created ${data.type} transaction for employee ${id}: ${data.title}`,
    });

    return c.json({ ok: true as const, transaction: created });
  },
);

// ---- PATCH ----------------------------------------------------------------

employeeTransactionRoutes.patch(
  '/api/employees/:id/transactions/:txnId',
  requireAdmin,
  async (c) => {
    const id = c.req.param('id');
    const txnId = c.req.param('txnId');
    if (!id || !txnId) {
      return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
    }

    const before = await getTransactionById(c.env, txnId);
    if (!before || before.employeeId !== id) {
      return c.json(
        { error: 'NOT_FOUND', message: `Transaction ${txnId} not found for employee ${id}` },
        404,
      );
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = employeeTransactionPatchRequest.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: 'Invalid patch payload',
          issues: parsed.error.issues,
        },
        400,
      );
    }

    // Per-type payload validation on PATCH too. Only when payload is set.
    if (parsed.data.payload !== undefined && parsed.data.payload !== null) {
      const payloadSchema = payloadSchemaForType(before.type);
      const pp = payloadSchema.safeParse(parsed.data.payload);
      if (!pp.success) {
        return c.json(
          {
            error: 'BAD_REQUEST',
            message: `Invalid payload for type '${before.type}'`,
            issues: pp.error.issues,
          },
          400,
        );
      }
    }

    const actor = (await getActorEmail(c)) ?? 'unknown';
    await updateTransactionFields(c.env, txnId, parsed.data, actor);
    const after = await getTransactionById(c.env, txnId);
    if (!after) {
      return c.json(
        { error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' },
        500,
      );
    }

    const changed = Object.keys(parsed.data).filter(
      (k) => (parsed.data as Record<string, unknown>)[k] !== undefined,
    );
    await writeAudit(c.env, {
      actor,
      action: 'employee_transaction.patched',
      target: txnId,
      status: 'ok',
      details: `Updated ${changed.length} field(s): ${changed.join(', ')}`,
    });

    return c.json({ ok: true as const, transaction: after });
  },
);
