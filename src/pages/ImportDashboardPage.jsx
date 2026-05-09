// -*- coding: utf-8 -*-
/**
 * ImportDashboardPage.jsx  (Phase 2 — gated behind FEATURE_FLAGS.newImports)
 *
 * Two upload tiles (Employee Master Excel + Contract PDFs), preview-first
 * flow, commit button only after preview is generated. No DB writes happen
 * until the user clicks Commit.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { readSpreadsheetFile, readSpreadsheetFromUrl, parsePdfUploads } from '../utils/fileImport';
import { cleanDataset } from '../utils/cleaning';
import { FEATURE_FLAGS } from '../utils/featureFlags';

import { buildEmployeeMasterImportPreview } from '../services/imports/employeeMasterImportService';
import { buildContractImportPreview }       from '../services/imports/contractPdfImportService';
import {
  commitEmployeeMasterImport,
  commitContractImport,
} from '../services/imports/importCommitService';
import { commitLocalAssetsWithRollback } from '../services/imports/importRollbackService';
import { buildImportQualityGate }         from '../services/imports/importQualityGate';
import { extractContractFromPdf } from '../services/imports/parsers';

import { personRepository }                 from '../storage/repositories/personRepository';
import { employeeMasterSnapshotRepository } from '../storage/repositories/employeeMasterSnapshotRepository';
import { contractRecordRepository }         from '../storage/repositories/contractRecordRepository';
import { employeeNumberHistoryRepository }  from '../storage/repositories/employeeNumberHistoryRepository';

// ── presentation helpers ─────────────────────────────────────────────────────

function StatTile({ label, value, tone }) {
  const colour =
    tone === 'critical' ? '#b91c1c'
    : tone === 'warning' ? '#b45309'
    : tone === 'success' ? '#15803d'
    : '#1f2937';
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '12px 16px',
      minWidth: 150,
      flex: '0 0 auto',
    }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: colour }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 12, color: '#111827' }}>{title}</h3>
      {children}
    </section>
  );
}

function FlagDisabledNotice() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h2>Identity-centric import flow — disabled</h2>
      <p>
        <code>FEATURE_FLAGS.newImports</code> is currently <strong>false</strong>.
        This UI is part of Phase 2 and is gated behind the flag until acceptance.
      </p>
      <p>To enable locally for testing, run in the browser console:</p>
      <pre style={{
        background: '#f3f4f6', padding: 12, borderRadius: 6, display: 'inline-block',
      }}>
        localStorage.setItem('feature.newImports', 'true');{'\n'}window.location.reload();
      </pre>
    </div>
  );
}

// ── EM Excel preview/commit ─────────────────────────────────────────────────

async function buildEMPreview(file) {
  const { rows: rawRows, sheetName } = await readSpreadsheetFile(file);
  const { cleanedRows, issues, summary } = cleanDataset(rawRows);

  const [persons, snapshots, history] = await Promise.all([
    personRepository.listAll(),
    employeeMasterSnapshotRepository.listAll(),
    employeeNumberHistoryRepository.listAll(),
  ]);

  const preview = buildEmployeeMasterImportPreview({
    cleanedRows,
    existingPersons:   persons,
    existingSnapshots: snapshots,
    existingHistory:   history,
    sourceFile:        file.name,
    importedBy:        null,
  });
  return { preview, issues, summary, sheetName };
}

function EMUploadTile({ onPreviewBuilt, busy, setBusy }) {
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      const result = await buildEMPreview(file);
      onPreviewBuilt('em', result, file.name);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={tileStyle}>
      <h3 style={{ marginTop: 0 }}>Employee Master (Excel)</h3>
      <p style={tileHint}>
        Drop or pick بيانات الموظفين.xlsx (or any compatible HR export).
        Arabic and English column headers are both recognised.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={busy}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {fileName && <div style={{ fontSize: 12, marginTop: 6 }}>Selected: <code>{fileName}</code></div>}
      {error && <div style={errStyle}>{error}</div>}
    </div>
  );
}

// ── PDF preview/commit ──────────────────────────────────────────────────────

async function buildPDFPreview(uploadItems) {
  const extracted = [];
  for (const item of uploadItems) {
    const buf = await item.blob.arrayBuffer();
    const result = await extractContractFromPdf(buf, item.name);
    extracted.push(result);
  }

  const [persons, contractRecords, history] = await Promise.all([
    personRepository.listAll(),
    contractRecordRepository.listAll(),
    employeeNumberHistoryRepository.listAll(),
  ]);

  const preview = buildContractImportPreview({
    extractedContracts:      extracted,
    existingPersons:         persons,
    existingContractRecords: contractRecords,
    existingHistory:         history,
    sourceFiles:             uploadItems.map((u) => u.name),
    importedBy:              null,
  });
  return { preview, extractedCount: extracted.length };
}

function PDFUploadTile({ onPreviewBuilt, busy, setBusy }) {
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress('Unpacking files…');
    try {
      const { uploadItems, importedCount } = await parsePdfUploads(fileList);
      if (importedCount === 0) {
        setError('No PDF files found in the selection.');
        return;
      }
      setProgress(`Extracting ${importedCount} PDF(s)…`);
      const result = await buildPDFPreview(uploadItems);
      onPreviewBuilt('pdf', result, `${importedCount} PDF(s)`);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div style={tileStyle}>
      <h3 style={{ marginTop: 0 }}>Contract PDFs</h3>
      <p style={tileHint}>
        Drop one PDF, several PDFs, an entire folder, or a ZIP archive.
        Templates auto-classified (bilingual / unified / Arabic-only).
      </p>
      <input
        type="file"
        accept=".pdf,.zip"
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div style={{ marginTop: 6 }}>
        <input
          type="file"
          // @ts-ignore - non-standard attributes for folder upload
          webkitdirectory=""
          directory=""
          mozdirectory=""
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>
          (folder upload — Chromium / Firefox)
        </span>
      </div>
      {progress && <div style={{ fontSize: 12, marginTop: 6 }}>{progress}</div>}
      {error    && <div style={errStyle}>{error}</div>}
    </div>
  );
}

// ── Load Local HR Assets ────────────────────────────────────────────────────
//
// One-click fetch from public/data/. Tries the operator's real Arabic-named
// file first (بيانات الموظفين.xlsx), then sample.xlsx. Reads the manifest
// at /data/contracts-manifest.json to discover PDFs in either Contract/ or
// contracts/ folder. All paths are local-only and gitignored.

async function buildLocalAssetsPreview() {
  const candidates = [
    '/data/' + encodeURIComponent('بيانات الموظفين.xlsx'),
    '/data/sample.xlsx',
  ];
  // Try Excel candidates in order
  let emRows = null;
  let emSourceFile = null;
  let emError = null;
  for (const url of candidates) {
    try {
      const { rows } = await readSpreadsheetFromUrl(url);
      if (rows && rows.length) {
        emRows = rows;
        emSourceFile = url.split('/').pop();
        break;
      }
    } catch (err) {
      emError = err;
    }
  }

  if (!emRows) {
    throw new Error(
      'No Employee Master Excel found under /public/data/. ' +
      'Place بيانات الموظفين.xlsx (or sample.xlsx) in public/data/, then retry.\n' +
      (emError ? 'Last error: ' + emError.message : '')
    );
  }

  // Load contracts manifest to know what PDFs exist
  const manifest = await fetch('/data/contracts-manifest.json', { cache: 'no-store' })
    .then((r) => (r.ok && /json/i.test(r.headers.get('content-type') || '') ? r.json() : []))
    .catch(() => []);

  // Fetch each PDF blob and feed them through the same flow as drag-drop
  const pdfFiles = [];
  for (const entry of manifest) {
    try {
      const r = await fetch(entry.path, { cache: 'no-store' });
      if (!r.ok) continue;
      const blob = await r.blob();
      pdfFiles.push(new File([blob], entry.fileName, { type: 'application/pdf' }));
    } catch {
      /* skip individual fetch failures */
    }
  }

  // Build EM preview (cleanDataset → buildEmployeeMasterImportPreview)
  const { cleanedRows } = cleanDataset(emRows);
  const [persons, snapshots, history, contractRecs] = await Promise.all([
    personRepository.listAll(),
    employeeMasterSnapshotRepository.listAll(),
    employeeNumberHistoryRepository.listAll(),
    contractRecordRepository.listAll(),
  ]);
  const emPreview = buildEmployeeMasterImportPreview({
    cleanedRows,
    existingPersons:   persons,
    existingSnapshots: snapshots,
    existingHistory:   history,
    sourceFile:        emSourceFile,
  });

  // Build PDF preview by extracting each fetched PDF
  const extracted = [];
  for (const file of pdfFiles) {
    const buf = await file.arrayBuffer();
    extracted.push(await extractContractFromPdf(buf, file.name));
  }
  const pdfPreview = buildContractImportPreview({
    extractedContracts:      extracted,
    existingPersons:         persons,
    existingContractRecords: contractRecs,
    existingHistory:         history,
    sourceFiles:             pdfFiles.map((f) => f.name),
  });

  return {
    em:  { preview: emPreview,  sourceFile: emSourceFile },
    pdf: { preview: pdfPreview, extractedCount: extracted.length, totalManifest: manifest.length },
  };
}

function LocalAssetsTile({ onPreviewBuilt, busy, setBusy }) {
  const [error, setError]       = useState(null);
  const [progress, setProgress] = useState(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    setProgress('Reading public/data/ …');
    try {
      const result = await buildLocalAssetsPreview();
      onPreviewBuilt('local', result, 'public/data/ (Excel + Contract folder)');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div style={tileStyle}>
      <h3 style={{ marginTop: 0 }}>Load Local HR Assets</h3>
      <p style={tileHint}>
        One click — reads the Employee Master Excel + every PDF under
        <code> public/data/Contract/</code> in one go. Use after running
        <code> npm run contracts:manifest</code>.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        style={{
          padding: '8px 16px',
          background: '#0f766e',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontWeight: 600,
        }}
      >
        {busy ? 'Loading…' : 'Load from public/data/'}
      </button>
      {progress && <div style={{ fontSize: 12, marginTop: 6 }}>{progress}</div>}
      {error    && <div style={errStyle}>{error}</div>}
    </div>
  );
}

function LocalPreviewPanel({ preview, onCommit, onCancel, committing, committed }) {
  const em  = preview.em.preview.summary;
  const pdf = preview.pdf.preview.summary;
  const gate = buildImportQualityGate({
    emPreview:  preview.em.preview,
    pdfPreview: preview.pdf.preview,
  });
  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Preview — Local HR Assets</h2>
      <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
        Source: <code>public/data/</code> · Excel: <code>{preview.em.sourceFile}</code> ·
        PDFs in manifest: <strong>{preview.pdf.totalManifest}</strong> · extracted: <strong>{preview.pdf.extractedCount}</strong>
      </div>

      {/* ── Quality gate ───────────────────────────────────────────────── */}
      <div style={{
        marginBottom: 16, padding: 12,
        background: gate.safeToCommit ? '#f0fdf4' : '#fef2f2',
        border: '1px solid ' + (gate.safeToCommit ? '#86efac' : '#fca5a5'),
        borderRadius: 8,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Quality gate — {gate.safeToCommit ? '✓ Safe to commit' : '⚠ Blockers present'}
        </div>
        <div style={statRowStyle}>
          <StatTile label="Complete contracts"  value={gate.summary.completeContracts}  tone="success" />
          <StatTile label="Partial contracts"   value={gate.summary.partialContracts}   tone="warning" />
          <StatTile label="Missing identity"    value={gate.summary.missingIdentity}    tone="critical" />
          <StatTile label="Invalid identity"    value={gate.summary.invalidIdentity}    tone="critical" />
          <StatTile label="ContractOnly"        value={gate.summary.contractOnlyPersons} />
          <StatTile label="Duplicate identity" value={gate.summary.duplicateIdentity}  tone="critical" />
          <StatTile label="EmpNo divergence"   value={gate.summary.empNoDivergence}    tone="warning" />
        </div>
        {gate.blockers.length > 0 && (
          <ul style={{ marginTop: 8, color: '#b91c1c', fontSize: 13 }}>
            {gate.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
        {gate.warnings.length > 0 && (
          <ul style={{ marginTop: 8, color: '#92400e', fontSize: 13 }}>
            {gate.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>

      <h3 style={{ marginTop: 16, marginBottom: 8 }}>Employee Master rows</h3>
      <div style={statRowStyle}>
        <StatTile label="Total rows"       value={em.total} />
        <StatTile label="New persons"      value={em.new}              tone="success" />
        <StatTile label="Updated"          value={em.updated} />
        <StatTile label="Unchanged"        value={em.unchanged} />
        <StatTile label="EmpNo history"    value={em.empNoHistoryCandidates}  tone="warning" />
        <StatTile label="Invalid identity" value={em.invalidIdentity}         tone="critical" />
        <StatTile label="Missing identity" value={em.missingIdentity}         tone="critical" />
      </div>

      <h3 style={{ marginTop: 16, marginBottom: 8 }}>Contract PDFs</h3>
      <div style={statRowStyle}>
        <StatTile label="Total"            value={pdf.total} />
        <StatTile label="Matched person"   value={pdf.newContractForExistingPerson} tone="success" />
        <StatTile label="Contract-only"    value={pdf.newContractOnlyPerson} />
        <StatTile label="Duplicate"        value={pdf.duplicateContract} />
        <StatTile label="EmpNo history"    value={pdf.empNoHistoryCandidates}     tone="warning" />
        <StatTile label="Invalid identity" value={pdf.invalidIdentity}            tone="critical" />
        <StatTile label="Missing identity" value={pdf.missingIdentity}            tone="critical" />
        <StatTile label="Extraction errs"  value={pdf.extractionError}            tone="critical" />
      </div>

      {!committed && (
        <div style={btnRowStyle}>
          <button type="button" style={btnPrimaryStyle} disabled={committing} onClick={onCommit}>
            {committing ? 'Committing…' : 'Commit (EM then PDFs)'}
          </button>
          <button type="button" style={btnGhostStyle} disabled={committing} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
      {committed && (
        <div style={successStyle}>
          ✓ Imported. EM job: <code>{committed.emJobId}</code> · PDF job: <code>{committed.pdfJobId}</code>
        </div>
      )}
    </div>
  );
}

// ── preview panels ──────────────────────────────────────────────────────────

function EMPreviewPanel({ preview, onCommit, onCancel, committing, committed }) {
  const s = preview.summary;
  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Preview — Employee Master</h2>
      <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
        Source: <code>{preview.sourceFile}</code>
      </div>
      <div style={statRowStyle}>
        <StatTile label="Total rows"       value={s.total} />
        <StatTile label="New persons"      value={s.new}                 tone="success" />
        <StatTile label="Updated"          value={s.updated} />
        <StatTile label="Unchanged"        value={s.unchanged} />
        <StatTile label="EmpNo history"    value={s.empNoHistoryCandidates}   tone="warning" />
        <StatTile label="Needs review"     value={s.needsReview}              tone="warning" />
        <StatTile label="Invalid identity" value={s.invalidIdentity}          tone="critical" />
        <StatTile label="Missing identity" value={s.missingIdentity}          tone="critical" />
      </div>
      {(s.invalidIdentity > 0 || s.missingIdentity > 0) && (
        <p style={warningStyle}>
          ⚠ {s.invalidIdentity + s.missingIdentity} row(s) without a valid IdentityNumber will be sent to the Review Queue. They will not create persons.
        </p>
      )}
      {!committed && (
        <div style={btnRowStyle}>
          <button type="button" style={btnPrimaryStyle} disabled={committing} onClick={onCommit}>
            {committing ? 'Committing…' : 'Commit import'}
          </button>
          <button type="button" style={btnGhostStyle} disabled={committing} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
      {committed && (
        <div style={successStyle}>
          ✓ Imported. Job ID: <code>{committed.importJobId}</code>
        </div>
      )}
    </div>
  );
}

function PDFPreviewPanel({ preview, extractedCount, onCommit, onCancel, committing, committed }) {
  const s = preview.summary;
  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Preview — Contract PDFs</h2>
      <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
        Total PDFs extracted: <strong>{extractedCount}</strong>
      </div>
      <div style={statRowStyle}>
        <StatTile label="Total"            value={s.total} />
        <StatTile label="Matched person"   value={s.newContractForExistingPerson} tone="success" />
        <StatTile label="Contract-only"    value={s.newContractOnlyPerson} />
        <StatTile label="Duplicate"        value={s.duplicateContract} />
        <StatTile label="EmpNo history"    value={s.empNoHistoryCandidates}       tone="warning" />
        <StatTile label="Needs review"     value={s.needsReview}                  tone="warning" />
        <StatTile label="Invalid identity" value={s.invalidIdentity}              tone="critical" />
        <StatTile label="Missing identity" value={s.missingIdentity}              tone="critical" />
        <StatTile label="Extraction errs"  value={s.extractionError}              tone="critical" />
      </div>
      {(s.invalidIdentity + s.missingIdentity + s.extractionError) > 0 && (
        <p style={warningStyle}>
          ⚠ {s.invalidIdentity + s.missingIdentity + s.extractionError} contract(s) without a valid IdentityNumber will be sent to the Review Queue.
        </p>
      )}
      {s.empNoHistoryCandidates > 0 && (
        <p style={infoStyle}>
          ℹ {s.empNoHistoryCandidates} contract(s) introduce a new EmployeeNumber for an existing person — recorded in EmployeeNumberHistory (renewal / rehire / cycle / first-seen). This is informational, not a conflict.
        </p>
      )}
      {!committed && (
        <div style={btnRowStyle}>
          <button type="button" style={btnPrimaryStyle} disabled={committing} onClick={onCommit}>
            {committing ? 'Committing…' : 'Commit import'}
          </button>
          <button type="button" style={btnGhostStyle} disabled={committing} onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
      {committed && (
        <div style={successStyle}>
          ✓ Imported. Job ID: <code>{committed.importJobId}</code>
        </div>
      )}
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function ImportDashboardPage() {
  if (!FEATURE_FLAGS.newImports) return <FlagDisabledNotice />;

  const [busy, setBusy]               = useState(false);
  const [activePreview, setActivePreview] = useState(null);   // { kind, data }
  const [committing, setCommitting]   = useState(false);
  const [committed, setCommitted]     = useState(null);
  const [commitError, setCommitError] = useState(null);

  function handlePreviewBuilt(kind, data, label) {
    setActivePreview({ kind, data, label });
    setCommitted(null);
    setCommitError(null);
  }

  function handleCancel() {
    setActivePreview(null);
    setCommitted(null);
    setCommitError(null);
  }

  async function handleCommit() {
    if (!activePreview) return;
    setCommitting(true);
    setCommitError(null);
    try {
      if (activePreview.kind === 'local') {
        // Two-phase commit with rollback safety. If PDF commit fails, the EM
        // commit is reversed before the error surfaces.
        const result = await commitLocalAssetsWithRollback({
          emPreview:  activePreview.data.em.preview,
          pdfPreview: activePreview.data.pdf.preview,
          opts:       { importedBy: null },
        });
        setCommitted({
          emJobId:  result.em.importJobId,
          pdfJobId: result.pdf.importJobId,
          counts:   result.counts,
        });
      } else {
        const fn = activePreview.kind === 'em' ? commitEmployeeMasterImport : commitContractImport;
        const res = await fn(activePreview.data.preview, { importedBy: null });
        setCommitted(res);
      }
    } catch (err) {
      setCommitError(err?.message || String(err));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1280, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Import Dashboard</h1>
        <nav style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <Link to="/v3/review-queue">Review queue</Link>
          <Link to="/v3/persons">Persons</Link>
        </nav>
      </header>

      <p style={{ color: '#6b7280' }}>
        IdentityNumber is the only matching key. EmployeeNumber differences are recorded as history, never blocking.
        Name extracted from PDFs is reference-only.
      </p>

      <Section title="1 — Pick a source">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <EMUploadTile      onPreviewBuilt={handlePreviewBuilt} busy={busy} setBusy={setBusy} />
          <PDFUploadTile     onPreviewBuilt={handlePreviewBuilt} busy={busy} setBusy={setBusy} />
          <LocalAssetsTile   onPreviewBuilt={handlePreviewBuilt} busy={busy} setBusy={setBusy} />
        </div>
      </Section>

      {activePreview && (
        <Section title="2 — Review the preview">
          {activePreview.kind === 'em' && (
            <EMPreviewPanel
              preview={{ ...activePreview.data.preview, sourceFile: activePreview.label }}
              onCommit={handleCommit}
              onCancel={handleCancel}
              committing={committing}
              committed={committed}
            />
          )}
          {activePreview.kind === 'pdf' && (
            <PDFPreviewPanel
              preview={activePreview.data.preview}
              extractedCount={activePreview.data.extractedCount}
              onCommit={handleCommit}
              onCancel={handleCancel}
              committing={committing}
              committed={committed}
            />
          )}
          {activePreview.kind === 'local' && (
            <LocalPreviewPanel
              preview={activePreview.data}
              onCommit={handleCommit}
              onCancel={handleCancel}
              committing={committing}
              committed={committed}
            />
          )}
          {commitError && <div style={errStyle}>Commit failed: {commitError}</div>}
        </Section>
      )}

      {committed && (
        <Section title="3 — Where to next">
          <ul>
            <li><Link to="/v3/review-queue">Review Queue</Link> — resolve missing/invalid identities ({committed.counts.review || 0} new items)</li>
            <li><Link to="/v3/persons">Persons</Link> — see the upserted records</li>
          </ul>
        </Section>
      )}
    </div>
  );
}

// ── inline styles (Phase 2 keeps it minimal — Phase 3 can move to CSS) ──────

const tileStyle    = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, minWidth: 320, flex: '1 1 320px' };
const tileHint     = { fontSize: 12, color: '#6b7280', marginBottom: 8 };
const errStyle     = { marginTop: 8, padding: 8, background: '#fef2f2', color: '#b91c1c', borderRadius: 4, fontSize: 12 };
const panelStyle   = { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 };
const statRowStyle = { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 };
const warningStyle = { padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, color: '#92400e', fontSize: 13 };
const infoStyle    = { padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1e40af', fontSize: 13 };
const successStyle = { padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 13 };
const btnRowStyle  = { display: 'flex', gap: 10, marginTop: 12 };
const btnPrimaryStyle = { padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const btnGhostStyle   = { padding: '8px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' };
