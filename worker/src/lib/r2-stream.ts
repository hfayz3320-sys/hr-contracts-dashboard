/**
 * R2 → HTTP response helper.
 *
 * Used by:
 *   GET /api/contracts/:id/file
 *   GET /api/employees/:id/documents/:docId/file
 *
 * Why this lives here, not inline in each route:
 *   - Both endpoints need the same content-type / Content-Disposition
 *     logic, and the same private-path guard (defense in depth: refuse to
 *     stream anything stored under a `public/...` key even though our
 *     writers never produce such a key).
 *   - The Cloudflare R2 binding returns an `R2ObjectBody` whose `.body`
 *     is a `ReadableStream`. Returning that directly avoids buffering the
 *     entire file in memory (important for multi-MB contract PDFs).
 */
import type { Env } from '../env';

export interface StreamOptions {
  /** Filename surfaced to the browser. `null` → use the R2 key basename. */
  filename?: string | null;
  /** True → Content-Disposition: attachment (download). False → inline. */
  forceDownload?: boolean;
  /** Override the content-type from R2 metadata. */
  contentTypeOverride?: string | null;
}

export type StreamResult =
  | { kind: 'ok'; response: Response }
  | { kind: 'not_found' }
  | { kind: 'forbidden_path' };

export async function streamR2Object(
  env: Env,
  r2Key: string,
  opts: StreamOptions = {},
): Promise<StreamResult> {
  // Defense in depth — refuse to stream anything stored under a public
  // path. Our writers never produce keys under `public/...` (every R2
  // put() in this codebase uses `employees/...`, `contracts/...`, or
  // `insurance/...`), so this check fires only if a malicious DB row
  // was hand-crafted. We surface a distinct outcome so the route can
  // log it without leaking the suspect key in the response body.
  if (
    r2Key.startsWith('public/') ||
    r2Key.includes('/public/') ||
    r2Key.startsWith('/') // absolute paths are not valid R2 keys for our scheme
  ) {
    return { kind: 'forbidden_path' };
  }

  const obj = await env.RAW_FILES.get(r2Key);
  if (!obj) return { kind: 'not_found' };

  const basename = r2Key.split('/').pop() ?? 'file';
  const filename = opts.filename ?? basename;
  const contentType =
    opts.contentTypeOverride ??
    obj.httpMetadata?.contentType ??
    inferContentType(filename);

  // Quote the filename per RFC 6266 — escape backslashes and double-quotes
  // so a name like `iqama "scan".pdf` is safe to embed.
  const safeName = filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const disposition = opts.forceDownload
    ? `attachment; filename="${safeName}"`
    : `inline; filename="${safeName}"`;

  return {
    kind: 'ok',
    response: new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        // Private + same-origin only — never let a public CDN cache a
        // potentially PII-bearing file.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(obj.size != null ? { 'Content-Length': String(obj.size) } : {}),
      },
    }),
  };
}

function inferContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':  return 'application/pdf';
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif':  return 'image/gif';
    case 'webp': return 'image/webp';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':  return 'application/vnd.ms-excel';
    case 'doc':  return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:     return 'application/octet-stream';
  }
}
