import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export async function readSpreadsheetFile(file) {
  const buffer = await file.arrayBuffer();
  return readSpreadsheetArrayBuffer(buffer);
}

export async function readSpreadsheetFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const buffer = await response.arrayBuffer();
  return readSpreadsheetArrayBuffer(buffer);
}

export function readSpreadsheetArrayBuffer(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
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
