import * as XLSX from 'xlsx';
import JSZip from 'jszip';

/**
 * Sentinel error: a spreadsheet URL exists in the application but the file
 * the URL points to is not an Excel file. Most often raised when an SPA
 * fallback returns index.html for a missing /data/*.xlsx path.
 *
 * Callers can catch this specifically and degrade gracefully instead of
 * crashing the page.
 */
export class SpreadsheetMissingError extends Error {
  constructor(message, { url, contentType, hint } = {}) {
    super(message);
    this.name        = 'SpreadsheetMissingError';
    this.url         = url || null;
    this.contentType = contentType || null;
    this.hint        = hint || null;
  }
}

export async function readSpreadsheetFile(file) {
  const buffer = await file.arrayBuffer();
  return readSpreadsheetArrayBuffer(buffer, file?.name);
}

export async function readSpreadsheetFromUrl(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new SpreadsheetMissingError(
      `Failed to fetch ${url}: HTTP ${response.status}`,
      { url, contentType: response.headers.get('content-type') }
    );
  }

  // SPA fallback detection: when /data/foo.xlsx is missing, Cloudflare Pages
  // (and Vite's dev server) serve index.html with Content-Type: text/html.
  const contentType = response.headers.get('content-type') || '';
  if (/text\/html|application\/xhtml/i.test(contentType)) {
    throw new SpreadsheetMissingError(
      `Expected Excel file at ${url} but received HTML (likely SPA fallback for a missing file).`,
      {
        url,
        contentType,
        hint: 'The file is not present at this path. Place the .xlsx under public/data/ to serve it locally (run `npm run contracts:manifest` after copying), or use the /v3/imports dashboard to upload.',
      }
    );
  }

  const buffer = await response.arrayBuffer();

  // Magic-byte sniff: real .xlsx files are zip archives (start with PK\x03\x04).
  // .xls files start with \xD0\xCF (compound file). Anything else is suspect.
  if (!isLikelySpreadsheetBuffer(buffer)) {
    const head = new TextDecoder('utf-8', { fatal: false })
      .decode(new Uint8Array(buffer.slice(0, 16))).toLowerCase();
    if (head.includes('<!doc') || head.includes('<html') || head.includes('<head')) {
      throw new SpreadsheetMissingError(
        `Expected Excel file at ${url} but received HTML body.`,
        { url, contentType, hint: 'Server returned HTML without text/html Content-Type — likely SPA fallback.' }
      );
    }
    // Otherwise let SheetJS try anyway — it can handle some odd inputs.
  }

  return readSpreadsheetArrayBuffer(buffer, url);
}

function isLikelySpreadsheetBuffer(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  const head = new Uint8Array(buffer.slice(0, 4));
  // PK\x03\x04 → xlsx (zip)
  if (head[0] === 0x50 && head[1] === 0x4b) return true;
  // OLE compound file → legacy xls (D0 CF 11 E0)
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return true;
  return false;
}

export function readSpreadsheetArrayBuffer(arrayBuffer, sourceLabel = '') {
  let workbook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
  } catch (err) {
    // SheetJS sometimes succeeds on HTML and then throws "could not find <table>".
    // Re-wrap as a clear actionable error.
    if (/could not find <table>|Invalid HTML/i.test(err?.message || '')) {
      throw new SpreadsheetMissingError(
        `Tried to parse ${sourceLabel || 'spreadsheet'} as Excel but it appears to be HTML (no <table> found).`,
        { url: sourceLabel || null, hint: 'Upload an .xlsx/.xls file via the Import Dashboard, or place the file under public/data/.' }
      );
    }
    throw err;
  }
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(`No worksheet found in ${sourceLabel || 'spreadsheet'}.`);
  }
  const firstSheetName = workbook.SheetNames[0];
  const worksheet      = workbook.Sheets[firstSheetName];
  const rows           = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return {
    sheetName: firstSheetName,
    rows,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportRowsToXlsx(rows, filename = 'Cleaned.xlsx') {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cleaned');
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, filename);
}

export function exportRowsToCsv(rows, filename = 'report.csv') {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function stripExt(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function baseName(pathValue) {
  return String(pathValue || '').split('/').pop().split('\\').pop();
}

function registerPdf(map, name, value) {
  const base = baseName(name);
  if (!base) {
    return;
  }
  map[base] = value;
  map[stripExt(base)] = value;
}

export function blobMapToObjectUrlMap(blobMap) {
  const urlMap = {};
  const blobToUrl = new Map();

  Object.entries(blobMap || {}).forEach(([key, blob]) => {
    if (!(blob instanceof Blob)) {
      return;
    }
    let url = blobToUrl.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      blobToUrl.set(blob, url);
    }
    urlMap[key] = url;
  });

  return urlMap;
}

export async function parsePdfUploads(files) {
  const blobMap = {};
  const uploadItems = [];
  let importedCount = 0;
  const list = Array.from(files || []);

  for (const file of list) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.pdf')) {
      importedCount += 1;
      registerPdf(blobMap, file.name, file);
      if (file.webkitRelativePath) {
        registerPdf(blobMap, file.webkitRelativePath, file);
      }
      uploadItems.push({
        name: baseName(file.name),
        blob: file,
      });
      continue;
    }

    if (lowerName.endsWith('.zip')) {
      const zipBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(zipBuffer);
      const entries = Object.values(zip.files);

      for (const entry of entries) {
        if (entry.dir || !entry.name.toLowerCase().endsWith('.pdf')) {
          continue;
        }
        importedCount += 1;
        const blob = await entry.async('blob');
        registerPdf(blobMap, entry.name, blob);
        uploadItems.push({
          name: baseName(entry.name),
          blob,
        });
      }
    }
  }

  return {
    blobMap,
    urlMap: blobMapToObjectUrlMap(blobMap),
    importedCount,
    uploadItems,
  };
}
