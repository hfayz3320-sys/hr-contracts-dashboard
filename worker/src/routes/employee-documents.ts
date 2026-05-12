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
  employeeDocumentTypeSchema,
} from '@shared/api-contract';
import { streamR2Object } from '../lib/r2-stream';

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

// ---- DOWNLOAD / VIEW ------------------------------------------------------
//
// GET /api/employees/:id/documents/:docId/file
//
// Streams the raw bytes of an uploaded employee document from the private
// R2 bucket back through the authenticated API. Query string:
//   ?download=1 → Content-Disposition: attachment (browser save dialog)
//
// The R2 key is read from `employee_documents.metadata.r2ObjectKey` (set by
// the upload endpoint). Returns 404 when:
//   - document not found
//   - document.employeeId mismatches the path param (defense in depth so a
//     valid docId can't be retrieved against a wrong employee scope)
//   - metadata.r2ObjectKey is missing (legacy / hand-entered metadata-only row)
//   - the R2 object is missing
//
// Audit: every access writes `employee_document.file_access`.
employeeDocumentRoutes.get(
  '/api/employees/:id/documents/:docId/file',
  async (c) => {
    const id = c.req.param('id');
    const docId = c.req.param('docId');
    if (!id || !docId) {
      return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
    }
    const doc = await getDocumentById(c.env, docId);
    if (!doc || doc.employeeId !== id) {
      return c.json(
        { error: 'NOT_FOUND', message: `Document ${docId} not found for employee ${id}` },
        404,
      );
    }
    const r2Key =
      typeof doc.metadata?.['r2ObjectKey'] === 'string'
        ? (doc.metadata['r2ObjectKey'] as string)
        : null;
    const originalFilename =
      typeof doc.metadata?.['originalFilename'] === 'string'
        ? (doc.metadata['originalFilename'] as string)
        : null;
    const contentTypeMeta =
      typeof doc.metadata?.['contentType'] === 'string'
        ? (doc.metadata['contentType'] as string)
        : null;
    if (!r2Key) {
      return c.json(
        { error: 'NOT_FOUND', message: 'Document has no R2 object (metadata-only row)' },
        404,
      );
    }

    const wantDownload = c.req.query('download') === '1';
    const result = await streamR2Object(c.env, r2Key, {
      filename: originalFilename ?? `${doc.type}.bin`,
      forceDownload: wantDownload,
      contentTypeOverride: contentTypeMeta,
    });
    if (result.kind === 'not_found') {
      return c.json({ error: 'NOT_FOUND', message: 'R2 object missing' }, 404);
    }
    if (result.kind === 'forbidden_path') {
      return c.json({ error: 'FORBIDDEN', message: 'Refusing to stream a public path' }, 403);
    }

    const actor = (await getActorEmail(c)) ?? 'unknown';
    await writeAudit(c.env, {
      actor,
      action: 'employee_document.file_access',
      target: docId,
      status: 'ok',
      details: `${wantDownload ? 'downloaded' : 'viewed'} ${doc.type} document for employee ${id} · r2:${r2Key}`,
    });

    return result.response;
  },
);

// ---- UPLOAD (multipart) ---------------------------------------------------
// Phase 10 — direct file upload from the Employee Profile.
//
// Accepts `multipart/form-data` with fields:
//   - file        : the raw bytes (required)
//   - type        : EmployeeDocumentType (required)
//   - expiresAt   : optional ISO date
//   - docNumber   : optional
//   - status      : optional ('active' default)
//   - isCurrent   : optional 'true' | 'false' string ('true' default)
//   - notes       : optional
//
// Side-effects:
//   - Stores the file in the PRIVATE R2 bucket at
//     `employees/<empId>/<docId>/<filename>`. Never written anywhere
//     reachable by `public/...` paths — R2 is private by binding.
//   - Creates an `employee_documents` row with `metadata.r2ObjectKey`,
//     `metadata.fileHash`, `metadata.fileSize`, `metadata.contentType`.
//   - Calls `supersedeCurrentDocumentOfType` first so the partial UNIQUE
//     INDEX is not violated.
//   - Writes an audit event with the R2 key in details.
//
// The Worker re-hashes the file server-side: we never trust the client's
// claimed hash. Body size is bounded by the Worker's 100MB request cap.
employeeDocumentRoutes.post(
  '/api/employees/:id/documents/upload',
  requireAdmin,
  async (c) => {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

    const employee = await getEmployee(c.env, id);
    if (!employee) {
      return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'BAD_REQUEST', message: 'Expected multipart/form-data' }, 400);
    }
    const file = form.get('file');
    const type = form.get('type');
    if (
      file == null ||
      typeof file === 'string' ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== 'function'
    ) {
      return c.json({ error: 'BAD_REQUEST', message: '`file` field is required' }, 400);
    }
    if (typeof type !== 'string') {
      return c.json({ error: 'BAD_REQUEST', message: '`type` field is required' }, 400);
    }

    // Reuse the canonical zod enum so the server enforces the same set of
    // document types the FE picker offers.
    const typeCheck = employeeDocumentTypeSchema.safeParse(type);
    if (!typeCheck.success) {
      return c.json(
        { error: 'BAD_REQUEST', message: `Invalid document type: ${type}` },
        400,
      );
    }
    const docType = typeCheck.data;

    const blob = file as Blob & { name?: string };
    const filename = blob.name ?? 'upload.bin';
    const fileSize = blob.size;
    const contentType = (blob as { type?: string }).type ?? 'application/octet-stream';

    // Hash the bytes ourselves; the client never gets to choose this.
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const fileHash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const actor = (await getActorEmail(c)) ?? 'unknown';
    const docId = newId('doc');

    // R2 key — private path, never under any `public/` prefix.
    const safeName = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const r2Key = `employees/${id}/${docId}/${safeName}`;
    if (r2Key.startsWith('public/') || r2Key.includes('/public/')) {
      // Defense in depth — this should be unreachable given the prefix.
      return c.json(
        { error: 'INTERNAL_ERROR', message: 'Refusing to write under a public path' },
        500,
      );
    }

    await c.env.RAW_FILES.put(r2Key, buf, {
      httpMetadata: { contentType },
      customMetadata: {
        kind: 'employee_document',
        employeeId: id,
        documentId: docId,
        documentType: docType,
        uploadedBy: actor,
      },
    });

    // Optional metadata fields from form. We treat empty strings as "not set".
    const formStr = (k: string): string | null => {
      const v = form.get(k);
      if (typeof v !== 'string' || v.trim() === '') return null;
      return v.trim();
    };
    const expiresAt = formStr('expiresAt');
    const docNumber = formStr('docNumber');
    const notesField = formStr('notes');
    const statusField = formStr('status');
    const isCurrentField = formStr('isCurrent');
    const willBeCurrent = isCurrentField !== 'false';

    if (willBeCurrent) {
      await supersedeCurrentDocumentOfType(c.env, id, docType, actor);
    }

    await insertDocument(c.env, {
      id: docId,
      employeeId: id,
      type: docType,
      docNumber,
      issuedAt: null,
      expiresAt,
      status: (statusField as 'active' | 'expired' | 'archived' | 'review_required') ?? 'active',
      isCurrent: willBeCurrent,
      reviewRequired: false,
      reviewReason: null,
      sourceFileId: null,
      metadata: {
        r2ObjectKey: r2Key,
        fileHash,
        fileSize,
        contentType,
        originalFilename: filename,
      },
      notes: notesField,
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
      action: 'employee_document.uploaded',
      target: docId,
      status: 'ok',
      details: `Uploaded ${docType} document for employee ${id} · ${fileSize} bytes · r2:${r2Key}`,
    });

    return c.json({
      ok: true as const,
      document: created,
      r2ObjectKey: r2Key,
      sourceFileId: fileHash,
    });
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
