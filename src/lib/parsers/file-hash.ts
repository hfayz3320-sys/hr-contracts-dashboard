/**
 * SHA-256 of a File/Blob using the browser's SubtleCrypto. Produces the same
 * hex string the Worker stores in `source_files.hash`, so re-uploading the
 * same file is a no-op (idempotent by design).
 */
export async function sha256OfFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
