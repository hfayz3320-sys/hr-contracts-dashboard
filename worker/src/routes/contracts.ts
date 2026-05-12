import { Hono } from 'hono';
import type { AppContext } from '../env';
import {
  listContracts,
  getContractById,
  updateContractFields,
} from '../db/repo-contracts';
import { findEmployeeByIdentity } from '../db/repo-employees';
import { findSourceFile } from '../db/repo-source-files';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { contractPatchRequest } from '@shared/api-contract';
import { streamR2Object } from '../lib/r2-stream';

export const contractRoutes = new Hono<AppContext>();

contractRoutes.use('/api/contracts', requireAuth);
contractRoutes.use('/api/contracts/*', requireAuth);

contractRoutes.get('/api/contracts', async (c) => {
  // Phase 3B — opt-in joined employee summary. Caller adds ?includeEmployee=1
  // to receive each row's `employeeSummary` + `linkStatus`. Default is the
  // bare contract row for backward compatibility.
  const includeEmployee = c.req.query('includeEmployee') === '1';
  const result = await listContracts(c.env, { includeEmployee });
  return c.json(result);
});

/**
 * GET /api/contracts/:id/file
 *
 * Streams the source PDF for a contract back through the authenticated API.
 * The file bytes live in the private R2 bucket; this endpoint is the only
 * way to read them. Query string:
 *   ?download=1  → Content-Disposition: attachment (browser save dialog)
 *
 * Lookup chain:
 *   contracts.id → contracts.source_file_id → source_files.r2_object_key
 *
 * Returns 404 when:
 *   - contract not found
 *   - contract has no source_file_id (legacy / hand-entered row)
 *   - source_files has no r2_object_key (raw bytes never uploaded — common
 *     during the Phase 2B migration when only metadata was registered)
 *   - the R2 object is missing (manually deleted)
 *
 * Audit: every successful access writes a `contract.file_access` event so
 * we can answer "who opened which contract" after the fact.
 */
contractRoutes.get('/api/contracts/:id/file', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const contract = await getContractById(c.env, id);
  if (!contract) return c.json({ error: 'NOT_FOUND', message: `Contract ${id} not found` }, 404);

  // `getContractById` doesn't return source_file_id; re-fetch the column.
  // Cheaper than reshaping the public Contract type, and keeps the file
  // pointer off the JSON list endpoint (less PII surface area).
  const sf = await c.env.DB
    .prepare('SELECT source_file_id FROM contracts WHERE id = ?')
    .bind(id)
    .first<{ source_file_id: string | null }>();
  const sourceFileId = sf?.source_file_id ?? null;
  if (!sourceFileId) {
    return c.json(
      { error: 'NOT_FOUND', message: 'Contract has no linked source file' },
      404,
    );
  }
  const sourceFile = await findSourceFile(c.env, sourceFileId);
  if (!sourceFile || !sourceFile.r2ObjectKey || !sourceFile.r2Stored) {
    return c.json(
      { error: 'NOT_FOUND', message: 'Source file metadata exists but the PDF is not in R2' },
      404,
    );
  }

  const wantDownload = c.req.query('download') === '1';
  const result = await streamR2Object(c.env, sourceFile.r2ObjectKey, {
    filename: contract.filename || sourceFile.filename,
    forceDownload: wantDownload,
    contentTypeOverride: 'application/pdf',
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
    action: 'contract.file_access',
    target: id,
    status: 'ok',
    details:
      `${wantDownload ? 'downloaded' : 'viewed'} contract PDF · ${contract.filename} · r2:${sourceFile.r2ObjectKey}`,
  });

  return result.response;
});

/**
 * PATCH /api/contracts/:id — admin-only "Fix contract" action.
 *
 * Used by both the Contracts table edit drawer and the Review Queue
 * resolver when an admin corrects an extracted contract.
 *
 * If `identityNumber` changes, employee_id is re-resolved to the new
 * matching employee (if one exists).
 */
contractRoutes.patch('/api/contracts/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);

  const raw = await c.req.json().catch(() => null);
  const parsed = contractPatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid patch payload', issues: parsed.error.issues },
      400,
    );
  }
  const before = await getContractById(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: `Contract ${id} not found` }, 404);
  const actor = (await getActorEmail(c)) ?? 'unknown';

  let patchWithEmployee: Parameters<typeof updateContractFields>[2] = { ...parsed.data };
  if (parsed.data.identityNumber !== undefined && parsed.data.identityNumber !== before.identityNumber) {
    const emp = await findEmployeeByIdentity(c.env, parsed.data.identityNumber);
    if (emp) patchWithEmployee = { ...patchWithEmployee, employeeId: emp.id };
  }
  await updateContractFields(c.env, id, patchWithEmployee);

  const after = await getContractById(c.env, id);
  if (!after) {
    return c.json({ error: 'INTERNAL_ERROR', message: 'Update succeeded but re-read failed' }, 500);
  }

  const changedFields = Object.keys(parsed.data).filter(
    (k) => (parsed.data as Record<string, unknown>)[k] !== undefined,
  );
  await writeAudit(c.env, {
    actor,
    action: 'contract.patch',
    target: id,
    status: 'ok',
    details: `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
  });

  return c.json({ ok: true as const, contract: after });
});
