/**
 * Open or save a Blob in the browser.
 *
 * The downloaded bytes already come from an authenticated fetch (see
 * `api.fetchContractFile` / `api.fetchEmployeeDocumentFile`) — this module
 * is purely about producing the right side-effect from a Blob:
 *
 *   openBlobInNewTab(blob, filename)   → window.open(blob:…) for inline view
 *   saveBlobAs(blob, filename)         → anchor[download] click for save-as
 *
 * Both helpers revoke the object URL after a short delay so we don't leak
 * memory if the user opens many files in one session.
 */
const REVOKE_DELAY_MS = 60_000; // 1 min — long enough for the new tab to start loading.

export function openBlobInNewTab(blob: Blob, _filename?: string): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    // Popup blocked — fall back to save-as so the user still gets the file.
    saveBlobAs(blob, _filename ?? 'file');
    URL.revokeObjectURL(url);
    return;
  }
  // Don't revoke immediately — Safari/Firefox can race the open() and load
  // a blank tab if the URL is gone before the navigation completes.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'file';
  // Some browsers require the anchor to be in the DOM to honor `download`.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
