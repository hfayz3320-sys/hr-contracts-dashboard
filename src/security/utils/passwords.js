function getCryptoApi() {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }

  throw new Error('Web Crypto API is not available in this environment.');
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSalt(length = 16) {
  const cryptoApi = getCryptoApi();
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashPassword(password, salt) {
  const cryptoApi = getCryptoApi();
  const payload = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await cryptoApi.subtle.digest('SHA-256', payload);
  return toHex(new Uint8Array(digest));
}

export async function createPasswordRecord(password) {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  return {
    algorithm: 'SHA-256',
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };
}

export async function verifyPassword(password, passwordRecord) {
  if (!passwordRecord?.salt || !passwordRecord?.hash) {
    return false;
  }

  const hash = await hashPassword(password, passwordRecord.salt);
  return hash === passwordRecord.hash;
}
