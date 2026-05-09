// -*- coding: utf-8 -*-
/**
 * GET /api/hr/contracts/:contractId/file
 *
 * Streams the original PDF for a single contract record from the private
 * R2 bucket. The r2_object_key is NEVER returned to the client — only
 * the binary stream and a sanitized Content-Disposition filename.
 *
 * Auth model:
 *   - In front of CF Access: every authenticated viewer can access.
 *   - Without CF Access: only Bearer-token holders (admins) can access.
 *     This avoids exposing PDFs to the open internet when Access is not
 *     yet configured.
 *
 *   404 → contract not found OR contract has no private file
 *   401/403 → auth gate (see requireViewer helper)
 *   500 → R2 binding missing OR object fetch failed
 */
import { requireViewer } from '../../../../lib/requireViewer.js';

function safeFilename(s) {
  // Strip control characters and quotes so the filename is safe inside
  // a Content-Disposition header. Keep unicode (Arabic source filenames).
  return String(s || 'contract.pdf')
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1f"]/g, '_')
    .slice(0, 200);
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }),
    { status, headers: { 'content-type': 'application/json' } });
}

export const onRequestGet = async ({ env, request, params }) => {
  const denied = requireViewer(request, env);
  if (denied) return denied;

  if (!env.DB)       return jsonError(500, 'D1 binding "DB" missing on this environment');
  if (!env.HR_FILES) return jsonError(500, 'R2 binding "HR_FILES" missing on this environment');

  const contractId = params?.contractId;
  if (!contractId) return jsonError(400, 'contractId path param required');

  // Look up contract row
  const row = await env.DB
    .prepare(`SELECT id, source_file_name, r2_object_key, has_private_file
              FROM contracts WHERE id = ?`)
    .bind(contractId)
    .first();
  if (!row)                             return jsonError(404, 'Contract not found');
  if (!row.has_private_file || !row.r2_object_key) return jsonError(404, 'No private file stored for this contract');

  // Stream from R2
  const obj = await env.HR_FILES.get(row.r2_object_key);
  if (!obj) return jsonError(404, 'R2 object missing — file may have been removed');

  const filename = safeFilename(row.source_file_name);
  return new Response(obj.body, {
    status: 200,
    headers: {
      'content-type':         obj.httpMetadata?.contentType || 'application/pdf',
      'content-disposition':  `inline; filename="${filename}"`,
      'cache-control':        'private, no-store, max-age=0',
      // Belt-and-braces: never let proxies/CDNs cache this private PDF.
      'x-content-type-options': 'nosniff',
    },
  });
};
