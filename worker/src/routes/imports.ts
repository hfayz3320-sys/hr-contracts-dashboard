import { Hono } from 'hono';
import type { AppContext } from '../env';
import { isProduction } from '../env';
import {
  importDryRunRequest,
  importUploadRequest,
  importCommitRequest,
} from '@shared/api-contract';
import { resolveDryRun } from '../lib/dry-run';
import {
  createImportJob,
  findImportJobByIdempotencyKey,
  getImportJob,
  updateJobStatusAndCounts,
  insertJobItems,
  clearImportJobItems,
} from '../db/repo-imports';
import {
  upsertSourceFile,
  findSourceFile,
  markSourceFileR2Stored,
} from '../db/repo-source-files';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import { requireAdmin, getActorEmail } from '../lib/auth';
import { commitImportJob, CommitTraceabilityError } from '../lib/commit';

export const importRoutes = new Hono<AppContext>();

const PARSER_VERSION = '2b-corrected/2026-05';

/**
 * POST /api/imports/upload
 *
 * Pre-flight metadata registration (no raw bytes). Used by the FE after it
 * parses the file in-browser. Records the file in source_files (idempotent on
 * hash) and creates an import_jobs row with status='queued'.
 *
 * NOTE: in production, commit will refuse this job until the raw bytes are
 * also uploaded via /api/imports/upload-raw and stored in R2.
 */
importRoutes.post('/api/imports/upload', requireAdmin, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = importUploadRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid upload request', issues: parsed.error.issues },
      400,
    );
  }
  const { type, filename, fileHash, fileSize } = parsed.data;
  const actor = (await getActorEmail(c)) ?? 'unknown';

  const idempotencyKey = `${type}:${fileHash}`;
  const existing = await findImportJobByIdempotencyKey(c.env, idempotencyKey);

  if (existing) {
    const sourceFile =
      (await findSourceFile(c.env, fileHash)) ??
      (await upsertSourceFile(c.env, {
        hash: fileHash,
        filename,
        type: type === 'contracts' ? 'pdf' : 'xlsx',
        size: fileSize,
        importJobId: existing.id,
        uploadedBy: actor,
        parserVersion: PARSER_VERSION,
      }));
    return c.json({ jobId: existing.id, isDuplicate: true, sourceFile });
  }

  const jobId = newId('job');
  await createImportJob(c.env, {
    id: jobId,
    type,
    filename,
    sourceHash: fileHash,
    idempotencyKey,
    status: 'queued',
    triggeredBy: actor,
  });
  const sourceFile = await upsertSourceFile(c.env, {
    hash: fileHash,
    filename,
    type: type === 'contracts' ? 'pdf' : 'xlsx',
    size: fileSize,
    importJobId: jobId,
    uploadedBy: actor,
    parserVersion: PARSER_VERSION,
  });
  await writeAudit(c.env, {
    actor,
    action: 'import.upload',
    target: jobId,
    status: 'ok',
    details: `${type} · ${filename} · ${fileSize} bytes`,
    jobId,
    sourceFileId: fileHash,
  });

  return c.json({ jobId, isDuplicate: false, sourceFile });
});

/**
 * POST /api/imports/upload-raw
 *
 * multipart/form-data with `file` field. Stores the raw bytes in the private
 * R2 bucket so that committed rows have a verifiable origin. The R2 binding
 * is configured in `wrangler.toml`; in local dev it's a miniflare emulation.
 *
 * Form fields:
 *   - file: the binary file
 *   - type: 'employees' | 'insurance' | 'contracts'
 *   - hash: precomputed SHA-256 hex (we re-verify server-side)
 *
 * Worker is hard-capped at 100MB request bodies — for larger uploads use
 * presigned URLs in a future phase.
 */
importRoutes.post('/api/imports/upload-raw', requireAdmin, async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'BAD_REQUEST', message: 'Expected multipart/form-data' }, 400);
  }
  const file = form.get('file');
  const type = form.get('type');
  const claimedHash = form.get('hash');
  // Cloudflare Workers' formData() returns Blob-like entries with `name`, `size`,
  // and `arrayBuffer()`. We accept anything that quacks like a file blob.
  if (
    file == null ||
    typeof file === 'string' ||
    typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== 'function'
  ) {
    return c.json({ error: 'BAD_REQUEST', message: '`file` field is required' }, 400);
  }
  const blob = file as Blob & { name?: string };
  const filename = blob.name ?? 'upload.bin';
  const fileSize = blob.size;
  const fileType = (blob as { type?: string }).type ?? 'application/octet-stream';
  if (typeof type !== 'string' || !['employees', 'insurance', 'contracts'].includes(type)) {
    return c.json({ error: 'BAD_REQUEST', message: '`type` must be employees|insurance|contracts' }, 400);
  }

  // Recompute the hash server-side; never trust the client's claim.
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hexHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (typeof claimedHash === 'string' && claimedHash !== hexHash) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Client-claimed hash does not match server-computed hash' },
      400,
    );
  }

  const actor = (await getActorEmail(c)) ?? 'unknown';
  const r2Key = `${type}/${hexHash}/${filename}`;
  await c.env.RAW_FILES.put(r2Key, buf, {
    httpMetadata: { contentType: fileType },
    customMetadata: {
      type,
      uploadedBy: actor,
      parserVersion: PARSER_VERSION,
    },
  });

  // Find existing import_job for this hash (created by /upload), or create one.
  const idempotencyKey = `${type as 'employees' | 'insurance' | 'contracts'}:${hexHash}`;
  let job = await findImportJobByIdempotencyKey(c.env, idempotencyKey);
  const isDuplicate = !!job;
  if (!job) {
    const jobId = newId('job');
    await createImportJob(c.env, {
      id: jobId,
      type: type as 'employees' | 'insurance' | 'contracts',
      filename,
      sourceHash: hexHash,
      idempotencyKey,
      status: 'queued',
      triggeredBy: actor,
    });
    job = (await getImportJob(c.env, jobId))!;
  }

  const sourceFile = await upsertSourceFile(c.env, {
    hash: hexHash,
    filename,
    type: type === 'contracts' ? 'pdf' : 'xlsx',
    size: fileSize,
    importJobId: job.id,
    uploadedBy: actor,
    parserVersion: PARSER_VERSION,
    r2ObjectKey: r2Key,
    r2Stored: true,
  });
  await markSourceFileR2Stored(c.env, hexHash, r2Key);

  await writeAudit(c.env, {
    actor,
    action: 'import.upload_raw',
    target: job.id,
    status: 'ok',
    details: `${type} · ${filename} · ${fileSize} bytes · r2:${r2Key}`,
    jobId: job.id,
    sourceFileId: hexHash,
  });

  return c.json({ jobId: job.id, isDuplicate, sourceFile, r2ObjectKey: r2Key });
});

/**
 * POST /api/imports/dry-run
 *
 * Accepts already-parsed JSON rows (from the FE preview parser). Persists the
 * resolution to job_items but never mutates target tables.
 */
importRoutes.post('/api/imports/dry-run', requireAdmin, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = importDryRunRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid request body', issues: parsed.error.issues },
      400,
    );
  }
  const { type, filename, rows, fileHash } = parsed.data;
  const actor = (await getActorEmail(c)) ?? 'unknown';

  let jobId = parsed.data.jobId;
  if (jobId) {
    const job = await getImportJob(c.env, jobId);
    if (!job) return c.json({ error: 'NOT_FOUND', message: `Job ${jobId} not found` }, 404);
    if (job.status === 'committed') {
      return c.json(
        { error: 'CONFLICT', message: 'Job already committed; dry-run not allowed' },
        409,
      );
    }
    await clearImportJobItems(c.env, jobId);
  } else {
    jobId = newId('job');
    await createImportJob(c.env, {
      id: jobId,
      type,
      filename,
      sourceHash: fileHash ?? null,
      idempotencyKey: fileHash ? `${type}:${fileHash}` : null,
      status: 'queued',
      triggeredBy: actor,
    });
  }

  const result = await resolveDryRun(c.env, type, rows);

  await insertJobItems(
    c.env,
    jobId,
    result.items.map((it, idx) => ({
      id: newId('itm'),
      rowIndex: it.rowIndex,
      identityNumber: it.identityNumber,
      rawPayload: rows[idx] ?? {},
      resolvedAction: it.resolvedAction,
      ...(it.targetId !== undefined ? { targetId: it.targetId } : {}),
      ...(it.diff !== undefined ? { diff: it.diff } : {}),
      ...(it.reason !== undefined ? { reason: it.reason } : {}),
    })),
  );
  await updateJobStatusAndCounts(c.env, jobId, 'review', result.counts);
  await writeAudit(c.env, {
    actor,
    action: 'import.dry_run',
    target: jobId,
    status: 'ok',
    details: `${type} · ${filename} · ${rows.length} rows`,
    jobId,
    sourceFileId: fileHash,
  });

  return c.json({ jobId, counts: result.counts, items: result.items });
});

/**
 * POST /api/imports/commit
 *
 * Apply resolved actions. Idempotent. Refuses to run if the job has no
 * source_hash, or if the source_files row isn't r2_stored in production.
 */
importRoutes.post('/api/imports/commit', requireAdmin, async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = importCommitRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: 'BAD_REQUEST', message: 'Invalid commit request', issues: parsed.error.issues },
      400,
    );
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';

  try {
    const result = await commitImportJob(c.env, parsed.data.jobId, actor);
    return c.json(result);
  } catch (err) {
    if (err instanceof CommitTraceabilityError) {
      return c.json(
        {
          error: 'TRACEABILITY_REQUIRED',
          message: err.message,
          mode: isProduction(c.env) ? 'production' : 'development',
        },
        409,
      );
    }
    return c.json(
      { error: 'COMMIT_FAILED', message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
