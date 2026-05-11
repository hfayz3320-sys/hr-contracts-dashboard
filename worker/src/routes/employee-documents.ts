/**
 * Phase 4A A2 — employee_documents routes.
 *
 *   GET    /api/employees/:id/documents             — list (requireAuth)
 *   POST   /api/employees/:id/documents             — create (requireAdmin)
 *   PATCH  /api/employees/:id/documents/:docId      — update (requireAdmin)
 *   DELETE /api/employees/:id/documents/:docId      — soft archive (requireAdmin)
 *
 * Uniqueness rule
 * ---------------
 * The schema has a partial UNIQUE INDEX on (employee_id, type) WHERE
 * is_current = 1. POST and PATCH both first call
 * `supersedeCurrentDocumentOfType` so the new/promoted row never collides
 * with an existing current of the same type. This is "last writer wins"
 * at the API layer; the SQL index is the backstop if two writers race.
 *
 * Soft delete
 * -----------
 * DELETE doesn't drop the row. It sets `status='archived'` and
 * `is_current=0`. Historic / archived rows remain in 360 for audit.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import { getEmployee } from '../db/repo-employees';
import {
  listDocumentsForEmployee,
  getDocumentById,
  insertDocument,
  updateDocumentFields,
  archiveDocument,
  supersedeCurrentDocumentOfType,
} from '../db/repo-employee-documents';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import {
  employeeDocumentCreateRequest,
  employeeDocumentPatchRequest,
} from '@shared/api-contract';

export const employeeDocumentRoutes = new Hono<AppContext>();

employeeDocumentRoutes.use('/api/employees/:id/documents', requireAuth);
employeeDocumentRoutes.use('/api/employees/:id/documents/*', requireAuth);

// ---- LIST -----------------------------------------------------------------

employeeDocumentRoutes.get('/api/employees/:id/documents', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) {
    return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  }
  const items = await listDocumentsForEmployee(c.env, id);
  return c.json({ items, total: items.length });
});

// ---- CREATE ---------------------------------------------------------------

employeeDocumentRoutes.post(
  '/api/employees/:id/documents',
  requireAdmin,
  async (c) => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

    const employee = await getEmployee(c.env, id);
    if (!employee) {
      return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = employeeDocumentCreateRequest.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: 'Invalid document payload',
          issues: parsed.error.issues,
        },
        400,
      );
    }

    const actor = (await getActorEmail(c)) ?? 'unknown';

    // If the new row is current (default true), demote any existing
    // current row of the same type so the partial UNIQUE INDEX is not
    // violated.
    const willBeCurrent = parsed.data.isCurrent !== false;
    let supersededId: string | null = null;
    if (willBeCurrent) {
      supersededId = await supersedeCurrentDocumentOfType(
        c.env,
        id,
        parsed.data.type,
        actor,
      );
    }

    const docId = newId('doc');
    await insertDocument(c.env, {
      id: docId,
      employeeId: id,
      type: parsed.data.type,
      docNumber: parsed.data.docNumber ?? null,
      issuedAt: parsed.data.issuedAt ?? null,
      expiresAt: parsed.data.expiresAt ?? null,
      status: parsed.data.status,
      isCurrent: willBeCurrent,
      reviewRequired: parsed.data.reviewRequired,
      reviewReason: parsed.data.reviewReason ?? null,
      sourceFileId: parsed.data.sourceFileId ?? null,
      metadata: parsed.data.metadata ?? null,
      notes: parsed.data.notes ?? null,
      actor,
    });

    const created = await getDocumentById(c.env, docId);
    if (!created) {
      return c.json(
        { error: 'INTERNAL_ERROR', message: 'Insert succeeded but re-read failed' },
        500,
      );
    }

    await writeAudit(c.env, {
      actor,
      action: 'employee_document.created',
      target: docId,
      status: 'ok',
      details:
        `Created ${parsed.data.type} document for employee ${id}` +
        (supersededId ? ` (superseded ${supersededId})` : ''),
    });

    return c.json({ ok: true as const, document: created });
  },
);

// ---- PATCH ----------------------------------------------------------------

employeeDocumentRoutes.patch(
  '/api/employees/:id/documents/:docId',
  requireAdmin,
  async (c) => {
    const id = c.req.param('id');
    const docId = c.req.param('docId');
    if (!id || !docId) {
      return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
    }

    const before = await getDocumentById(c.env, docId);
    if (!before || before.employeeId !== id) {
      return c.json(
        { error: 'NOT_FOUND', message: `Document ${docId} not found for employee ${id}` },
        404,
      );
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = employeeDocumentPatchRequest.safeParse(raw);
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

    const actor = (await getActorEmail(c)) ?? 'unknown';

    // If PATCH promotes this row to current and another row of the same
    // type is currently the live one, demote the other first.
    if (parsed.data.isCurrent === true && !before.isCurrent) {
      const otherId = await supersedeCurrentDocumentOfType(
        c.env,
        id,
        before.type,
        actor,
      );
      // Demoting self would be a no-op (we already know `before.isCurrent`
      // is false), but supersedeCurrentDocumentOfType always demotes the
      // current — which is what we want for the OTHER row.
      if (otherId === docId) {
        // shouldn't happen given the if-condition; harmless guard.
      }
    }

    await updateDocumentFields(c.env, docId, parsed.data, actor);
    const after = await getDocumentById(c.env, docId);
    if (!after) {
      return c.json(
        { error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' },
        500,
      );
    }

    const changed = Object.keys(parsed.data).filter(
      (k) =>
        (parsed.data as Record<string, unknown>)[k] !== undefined,
    );
    await writeAudit(c.env, {
      actor,
      action: 'employee_document.patched',
      target: docId,
      status: 'ok',
      details: `Updated ${changed.length} field(s): ${changed.join(', ')}`,
    });

    return c.json({ ok: true as const, document: after });
  },
);

// ---- DELETE (soft archive) ------------------------------------------------

employeeDocumentRoutes.delete(
  '/api/employees/:id/documents/:docId',
  requireAdmin,
  async (c) => {
    const id = c.req.param('id');
    const docId = c.req.param('docId');
    if (!id || !docId) {
      return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
    }
    const before = await getDocumentById(c.env, docId);
    if (!before || before.employeeId !== id) {
      return c.json(
        { error: 'NOT_FOUND', message: `Document ${docId} not found for employee ${id}` },
        404,
      );
    }
    const actor = (await getActorEmail(c)) ?? 'unknown';
    await archiveDocument(c.env, docId, actor);
    const after = await getDocumentById(c.env, docId);
    await writeAudit(c.env, {
      actor,
      action: 'employee_document.archived',
      target: docId,
      status: 'ok',
      details: `Archived ${before.type} document`,
    });
    return c.json({ ok: true as const, document: after });
  },
);
