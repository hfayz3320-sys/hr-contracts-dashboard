function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashArrayBuffer(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return toHex(digest);
}

export async function hashBlob(blob) {
  if (!(blob instanceof Blob)) {
    return '';
  }

  const buffer = await blob.arrayBuffer();
  return hashArrayBuffer(buffer);
}
