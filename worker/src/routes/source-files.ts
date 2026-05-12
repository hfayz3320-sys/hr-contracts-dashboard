import { Hono } from 'hono';
import type { AppContext } from '../env';
import { listSourceFiles, findSourceFile } from '../db/repo-source-files';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { streamR2Object } from '../lib/r2-stream';

export const sourceFilesRoutes = new Hono<AppContext>();

sourceFilesRoutes.use('/api/source-files', requireAuth);
sourceFilesRoutes.use('/api/source-files/*', requireAuth);

sourceFilesRoutes.get('/api/source-files', async (c) => {
  const result = await listSourceFiles(c.env);
  return c.json(result);
});

/**
 * GET /api/source-files/:hash/file
 *
 * Streams the raw bytes of an uploaded source file (contract PDF, XLSX
 * import sheet) from the private R2 bucket. Admin-only — this is the
 * pre-commit equivalent of `/api/contracts/:id/file`: during the import
 * review flow the contract row does not yet exist, but the admin still
 * needs to see the source PDF before clicking Confirm Import.
 *
 * Lookup: `source_files.hash` is the SHA-256 of the file bytes, set by
 * `/api/imports/upload-raw` when the file lands in R2. We refuse if
 * `r2_object_key` is null or `r2_stored=0` — same gate as the contract-
 * file endpoint.
 *
 * `?download=1` switches to attachment Content-Disposition. Audit row:
 * `contract_import.source_file_access` so we can answer "who opened
 * which contract PDF before commit".
 */
sourceFilesRoutes.get('/api/source-files/:hash/file', requireAdmin, async (c) => {
  const hash = c.req.param('hash');
  if (!hash) return c.json({ error: 'BAD_REQUEST', message: 'Missing hash' }, 400);
  const sf = await findSourceFile(c.env, hash);
  if (!sf || !sf.r2ObjectKey || !sf.r2Stored) {
    return c.json(
      { error: 'NOT_FOUND', message: 'Source file metadata exists but the bytes are not in R2' },
      404,
    );
  }

  const wantDownload = c.req.query('download') === '1';
  const result = await streamR2Object(c.env, sf.r2ObjectKey, {
    filename: sf.filename,
    forceDownload: wantDownload,
    // type is 'pdf' | 'xlsx' — set explicit Content-Type so the browser
    // doesn't sniff (and so the inline viewer behaves predictably).
    contentTypeOverride:
      sf.type === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
    action: 'contract_import.source_file_access',
    target: hash,
    status: 'ok',
    details:
      `${wantDownload ? 'downloaded' : 'viewed'} source file ${sf.filename}` +
      ` (${sf.type}) · r2:${sf.r2ObjectKey}`,
  });
  return result.response;
});
