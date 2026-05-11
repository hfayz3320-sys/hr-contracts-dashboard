import type { Env } from '../env';
import type { SourceFile } from '@shared/domain';

export type SourceFileRecord = SourceFile & {
  parserVersion: string;
  uploadedBy: string;
  extractionConfidence: number | null;
  r2ObjectKey: string | null;
  r2Stored: boolean;
};

type SourceFileRow = {
  hash: string;
  filename: string;
  type: 'xlsx' | 'pdf';
  size: number;
  uploaded_at: string;
  import_job_id: string | null;
  parser_version: string;
  uploaded_by: string;
  extraction_confidence: number | null;
  r2_object_key: string | null;
  r2_stored: number;
};

function rowToSourceFile(r: SourceFileRow): SourceFile {
  return {
    hash: r.hash,
    filename: r.filename,
    type: r.type,
    size: r.size,
    uploadedAt: r.uploaded_at,
    ...(r.import_job_id != null ? { importJobId: r.import_job_id } : {}),
  };
}

function rowToRecord(r: SourceFileRow): SourceFileRecord {
  return {
    ...rowToSourceFile(r),
    parserVersion: r.parser_version,
    uploadedBy: r.uploaded_by,
    extractionConfidence: r.extraction_confidence,
    r2ObjectKey: r.r2_object_key,
    r2Stored: r.r2_stored === 1,
  };
}

export async function listSourceFiles(env: Env): Promise<{ items: SourceFile[]; total: number }> {
  const rows = await env.DB
    .prepare(`SELECT * FROM source_files ORDER BY uploaded_at DESC LIMIT 200`)
    .all<SourceFileRow>();
  const items = (rows.results ?? []).map(rowToSourceFile);
  return { items, total: items.length };
}

export async function findSourceFile(env: Env, hash: string): Promise<SourceFileRecord | null> {
  const r = await env.DB
    .prepare(`SELECT * FROM source_files WHERE hash = ?`)
    .bind(hash)
    .first<SourceFileRow>();
  return r ? rowToRecord(r) : null;
}

export async function upsertSourceFile(
  env: Env,
  file: {
    hash: string;
    filename: string;
    type: 'xlsx' | 'pdf';
    size: number;
    importJobId?: string | null;
    uploadedBy: string;
    parserVersion?: string;
    extractionConfidence?: number | null;
    r2ObjectKey?: string | null;
    r2Stored?: boolean;
  },
): Promise<SourceFileRecord> {
  await env.DB
    .prepare(
      `INSERT INTO source_files
       (hash, filename, type, size, import_job_id, parser_version,
        uploaded_by, extraction_confidence, r2_object_key, r2_stored)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO UPDATE SET
         filename = excluded.filename,
         type = excluded.type,
         size = excluded.size,
         import_job_id = COALESCE(source_files.import_job_id, excluded.import_job_id),
         parser_version = excluded.parser_version,
         uploaded_by = excluded.uploaded_by,
         extraction_confidence = COALESCE(excluded.extraction_confidence, source_files.extraction_confidence),
         r2_object_key = COALESCE(excluded.r2_object_key, source_files.r2_object_key),
         r2_stored = MAX(source_files.r2_stored, excluded.r2_stored)`,
    )
    .bind(
      file.hash,
      file.filename,
      file.type,
      file.size,
      file.importJobId ?? null,
      file.parserVersion ?? '0',
      file.uploadedBy,
      file.extractionConfidence ?? null,
      file.r2ObjectKey ?? null,
      file.r2Stored ? 1 : 0,
    )
    .run();
  const updated = await findSourceFile(env, file.hash);
  if (!updated) throw new Error('Failed to upsert source file');
  return updated;
}

export async function markSourceFileR2Stored(
  env: Env,
  hash: string,
  r2ObjectKey: string,
): Promise<void> {
  await env.DB
    .prepare(`UPDATE source_files SET r2_object_key = ?, r2_stored = 1 WHERE hash = ?`)
    .bind(r2ObjectKey, hash)
    .run();
}
