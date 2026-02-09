import cors from 'cors';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'storage');
const PDF_DIR = path.join(STORAGE_DIR, 'pdfs');
const DATASET_FILE = path.join(STORAGE_DIR, 'latest-dataset.json');
const DIST_DIR = path.join(__dirname, '..', 'dist');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8787);
const MAX_JSON_SIZE = process.env.MAX_JSON_SIZE || '100mb';

const app = express();

app.use(cors());
app.use(express.json({ limit: MAX_JSON_SIZE }));

function sanitizePdfFileName(name) {
  const base = path.basename(String(name || '').trim());
  const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  if (!cleaned.toLowerCase().endsWith('.pdf')) {
    return '';
  }
  return cleaned || '';
}

async function ensureStorage() {
  await fs.mkdir(PDF_DIR, { recursive: true });
}

async function readDataset() {
  try {
    const raw = await fs.readFile(DATASET_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeDataset(payload) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await fs.writeFile(DATASET_FILE, JSON.stringify(payload), 'utf-8');
}

async function removeDataset() {
  try {
    await fs.unlink(DATASET_FILE);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function listPdfs() {
  await ensureStorage();
  const entries = await fs.readdir(PDF_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

async function removeAllPdfs() {
  await ensureStorage();
  const names = await listPdfs();
  await Promise.all(names.map((name) => fs.unlink(path.join(PDF_DIR, name))));
}

function toPdfPayload(name) {
  return {
    name,
    url: `/api/pdfs/file/${encodeURIComponent(name)}`,
  };
}

const storage = multer.diskStorage({
  destination: async (_req, _file, callback) => {
    try {
      await ensureStorage();
      callback(null, PDF_DIR);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    const safeName = sanitizePdfFileName(file.originalname);
    if (!safeName) {
      callback(new Error(`Invalid PDF filename: ${file.originalname}`));
      return;
    }
    callback(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 2000,
    fileSize: 30 * 1024 * 1024,
  },
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/dataset', async (_req, res, next) => {
  try {
    const dataset = await readDataset();
    res.json({ ok: true, dataset });
  } catch (error) {
    next(error);
  }
});

app.post('/api/dataset', async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid payload.' });
      return;
    }
    if (!Array.isArray(payload.rows)) {
      res.status(400).json({ ok: false, error: 'Payload must include rows array.' });
      return;
    }
    await writeDataset(payload);
    res.json({ ok: true, rows: payload.rows.length });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/dataset', async (_req, res, next) => {
  try {
    await removeDataset();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/pdfs', async (_req, res, next) => {
  try {
    const names = await listPdfs();
    res.json({ ok: true, files: names.map(toPdfPayload) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/pdfs', upload.array('files'), async (req, res, next) => {
  try {
    const uploaded = (req.files || []).map((file) => sanitizePdfFileName(file.filename)).filter(Boolean);
    const names = await listPdfs();
    res.json({
      ok: true,
      uploadedCount: uploaded.length,
      files: names.map(toPdfPayload),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/pdfs/file/:fileName', async (req, res, next) => {
  try {
    await ensureStorage();
    const safeName = sanitizePdfFileName(req.params.fileName);
    if (!safeName) {
      res.status(404).json({ ok: false, error: 'File not found.' });
      return;
    }
    const targetPath = path.join(PDF_DIR, safeName);
    await fs.access(targetPath);
    res.sendFile(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      res.status(404).json({ ok: false, error: 'File not found.' });
      return;
    }
    next(error);
  }
});

app.delete('/api/pdfs', async (_req, res, next) => {
  try {
    await removeAllPdfs();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/all', async (_req, res, next) => {
  try {
    await removeDataset();
    await removeAllPdfs();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(DIST_DIR));

app.get('*', async (req, res, next) => {
  try {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ ok: false, error: 'API route not found.' });
      return;
    }
    const indexPath = path.join(DIST_DIR, 'index.html');
    await fs.access(indexPath);
    res.sendFile(indexPath);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const message = error && error.message ? error.message : 'Server error';
  res.status(500).json({ ok: false, error: message });
});

ensureStorage()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`HR Dashboard API listening on http://${HOST}:${PORT}`);
      console.log(`Storage path: ${STORAGE_DIR}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start API server:', error);
    process.exit(1);
  });
