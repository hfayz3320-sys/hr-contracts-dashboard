/**
 * Crypto-random IDs. `crypto.randomUUID` is available in the Cloudflare
 * Workers runtime (V8 + WebCrypto).
 */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}
