function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE);

function apiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  if (!API_BASE) {
    return normalizedPath;
  }
  return new URL(normalizedPath, API_BASE).toString();
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function stripExt(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function registerMapEntry(map, key, value) {
  const cleanKey = String(key || '').trim();
  if (!cleanKey) {
    return;
  }
  map[cleanKey] = value;
  const keyWithoutExt = stripExt(cleanKey);
  if (keyWithoutExt) {
    map[keyWithoutExt] = value;
  }
}

export async function loadRemoteDataset() {
  try {
    const data = await requestJson('/api/dataset');
    return data?.dataset || null;
  } catch (error) {
    console.warn('Remote dataset unavailable:', error);
    return null;
  }
}

export async function saveRemoteDataset(payload) {
  try {
    await requestJson('/api/dataset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload || {}),
    });
    return true;
  } catch (error) {
    console.warn('Failed to save remote dataset:', error);
    return false;
  }
}

export async function clearRemoteDataset() {
  try {
    await requestJson('/api/dataset', { method: 'DELETE' });
    return true;
  } catch (error) {
    console.warn('Failed to clear remote dataset:', error);
    return false;
  }
}

export async function loadRemotePdfMap() {
  try {
    const data = await requestJson('/api/pdfs');
    const files = Array.isArray(data?.files) ? data.files : [];
    const map = {};
    files.forEach((file) => {
      const name = String(file?.name || '').trim();
      const url = String(file?.url || '').trim();
      if (!name || !url) {
        return;
      }
      const resolvedUrl = url.startsWith('http') ? url : apiUrl(url);
      registerMapEntry(map, name, resolvedUrl);
    });
    return map;
  } catch (error) {
    console.warn('Remote PDF map unavailable:', error);
    return {};
  }
}

export async function uploadRemotePdfs(uploadItems) {
  const items = Array.isArray(uploadItems) ? uploadItems : [];
  if (!items.length) {
    return {};
  }

  const formData = new FormData();
  const dedupe = new Set();

  items.forEach((item, index) => {
    const name = String(item?.name || '').trim();
    const blob = item?.blob;
    if (!name || !(blob instanceof Blob)) {
      return;
    }
    const dedupeKey = `${name.toLowerCase()}::${blob.size}`;
    if (dedupe.has(dedupeKey)) {
      return;
    }
    dedupe.add(dedupeKey);
    formData.append('files', blob, name || `file-${index + 1}.pdf`);
  });

  if (!dedupe.size) {
    return {};
  }

  try {
    await requestJson('/api/pdfs', {
      method: 'POST',
      body: formData,
    });
    return await loadRemotePdfMap();
  } catch (error) {
    console.warn('Failed to upload PDFs remotely:', error);
    return {};
  }
}

export async function clearRemotePdfs() {
  try {
    await requestJson('/api/pdfs', { method: 'DELETE' });
    return true;
  } catch (error) {
    console.warn('Failed to clear remote PDFs:', error);
    return false;
  }
}
