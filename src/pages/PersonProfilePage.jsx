// -*- coding: utf-8 -*-
/**
 * PersonProfilePage.jsx
 *
 * Tabs: master snapshot / contracts timeline / EmpNo history / audit log /
 *       review items.
 * Gated behind FEATURE_FLAGS.newImports.
 *
 * Per the identity model: canonicalName = Person.currentName (from EM),
 * rawExtractedName = name pulled from PDF (visual-order ambiguous). Both are
 * shown; a nameMismatch warning surfaces when they differ.
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams }      from 'react-router-dom';
import { FEATURE_FLAGS }        from '../utils/featureFlags';
import { getPersonProfile }     from '../services/persons/personProfileService';

const TAB_KEYS = {
  MASTER:    'master',
  CONTRACTS: 'contracts',
  EMPNO:     'empno',
  AUDIT:     'audit',
  REVIEW:    'review',
};

function FieldRow({ label, value }) {
  return (
    <tr>
      <td style={{ padding: '6px 12px', fontSize: 12, color: '#6b7280', width: 200 }}>{label}</td>
      <td style={{ padding: '6px 12px', fontSize: 13 }}>{value || <span style={{ color: '#9ca3af' }}>—</span>}</td>
    </tr>
  );
}

function MasterTab({ profile }) {
  const s = profile.masterSnapshot;
  if (!s) return <div style={{ padding: 16, color: '#6b7280' }}>No Employee Master snapshot for this person.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <FieldRow label="Employee Number"   value={s.employeeNumber} />
        <FieldRow label="Profession"        value={s.profession} />
        <FieldRow label="Location"          value={s.location} />
        <FieldRow label="Contract Type"     value={s.contractType} />
        <FieldRow label="Gross salary"      value={s.grossSalary} />
        <FieldRow label="Start date"        value={s.startDate} />
        <FieldRow label="End date"          value={s.endDate} />
        <FieldRow label="Joining date"      value={s.joiningDate} />
        <FieldRow label="Date of birth"     value={s.dateOfBirth} />
        <FieldRow label="Health insurance"  value={s.healthInsuranceStatus} />
        <FieldRow label="Source file"       value={s.sourceFile} />
        <FieldRow label="Imported"          value={s.importDate} />
      </tbody>
    </table>
  );
}

function ContractsTab({ profile }) {
  if (!profile.contracts.length) return <div style={{ padding: 16, color: '#6b7280' }}>No contract records for this person.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
      <thead>
        <tr style={{ background: '#f3f4f6' }}>
          <th style={th}>Contract #</th>
          <th style={th}>EmpNo</th>
          <th style={th}>Version</th>
          <th style={th}>Status</th>
          <th style={th}>End type</th>
          <th style={th}>Start</th>
          <th style={th}>End</th>
          <th style={th}>Basic</th>
          <th style={th}>Gross</th>
          <th style={th}>Source PDF</th>
        </tr>
      </thead>
      <tbody>
        {profile.contracts.map((c) => (
          <tr key={c.id} style={{ borderTop: '1px solid #e5e7eb' }}>
            <td style={td}>{c.contractNumber}</td>
            <td style={td}>{c.employeeNumber || '—'}</td>
            <td style={td}><code style={{ fontSize: 11 }}>{c.contractVersion}</code></td>
            <td style={td}>{c.extractionStatus}</td>
            <td style={td}>{c.contractEndType}</td>
            <td style={td}>{c.startDate || '—'}</td>
            <td style={td}>{c.endDate || '—'}</td>
            <td style={td}>{c.basicSalary ?? '—'}</td>
            <td style={td}>{c.grossCashMonthly ?? '—'}</td>
            <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{c.sourcePdf}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmpNoTab({ profile }) {
  const list = profile.employeeNumberHistory;
  if (!list.length) return <div style={{ padding: 16, color: '#6b7280' }}>No EmployeeNumber history.</div>;
  const uniqueCount = new Set(list.map((e) => e.employeeNumber)).size;
  return (
    <>
      {profile.flags?.hasMultipleEmpNos && (
        <div style={{ padding: 8, marginBottom: 12, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 4, color: '#92400e' }}>
          ⚠ This person has {uniqueCount} different EmployeeNumbers across sources.
          This is recorded as history (renewal / rehire / cycle), NOT a conflict.
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={th}>EmpNo</th>
            <th style={th}>Source</th>
            <th style={th}>Source file</th>
            <th style={th}>Contract #</th>
            <th style={th}>First seen</th>
            <th style={th}>Last seen</th>
            <th style={th}>Status</th>
            <th style={th}>Note</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={td}><code>{e.employeeNumber}</code></td>
              <td style={td}>{e.sourceType}</td>
              <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{e.sourceFile}</td>
              <td style={td}>{e.contractNumber || '—'}</td>
              <td style={td}>{e.firstSeenDate || '—'}</td>
              <td style={td}>{e.lastSeenDate  || '—'}</td>
              <td style={td}>{e.status}</td>
              <td style={td}>{e.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AuditTab({ profile }) {
  const list = profile.auditLog;
  if (!list.length) return <div style={{ padding: 16, color: '#6b7280' }}>No audit entries.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
      <thead>
        <tr style={{ background: '#f3f4f6' }}>
          <th style={th}>Timestamp</th>
          <th style={th}>Action</th>
          <th style={th}>Entity</th>
          <th style={th}>Field</th>
          <th style={th}>Old → New</th>
          <th style={th}>Source</th>
        </tr>
      </thead>
      <tbody>
        {list.map((a) => (
          <tr key={a.id} style={{ borderTop: '1px solid #e5e7eb' }}>
            <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>
              {String(a.importTimestamp || '').slice(0, 19).replace('T', ' ')}
            </td>
            <td style={td}>{a.action}</td>
            <td style={td}><code style={{ fontSize: 11 }}>{a.entityType}</code></td>
            <td style={td}>{a.field || '(create)'}</td>
            <td style={{ ...td, fontSize: 11 }}>
              {a.field
                ? <><code>{JSON.stringify(a.oldValue)}</code> → <code>{JSON.stringify(a.newValue)}</code></>
                : <code>{JSON.stringify(a.newValue)}</code>}
            </td>
            <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>
              {a.sourceType}<br />{a.sourceFile}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReviewTab({ profile }) {
  const list = profile.openReviewItems || [];
  if (!list.length) return <div style={{ padding: 16, color: '#6b7280' }}>No open review items for this person.</div>;
  return (
    <ul>
      {list.map((it) => {
        const v3 = it.extractedData || {};
        return (
          <li key={it.id} style={{ marginBottom: 8 }}>
            <strong>{v3.priority}</strong> · <code>{v3.reviewType}</code> — {v3.reason || it.title}
          </li>
        );
      })}
    </ul>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function PersonProfilePage() {
  if (!FEATURE_FLAGS.newImports) {
    return <div style={{ padding: 24 }}>Feature flag <code>newImports</code> is off.</div>;
  }

  const { identityNumber } = useParams();
  const [profile, setProfile] = useState(null);
  const [busy, setBusy]       = useState(true);
  const [tab, setTab]         = useState(TAB_KEYS.MASTER);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const p = await getPersonProfile(identityNumber);
        if (!cancelled) setProfile(p);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [identityNumber]);

  if (busy) return <div style={{ padding: 24 }}>Loading person {identityNumber}…</div>;
  if (!profile?.person) return <div style={{ padding: 24 }}>Person <code>{identityNumber}</code> not found.</div>;

  const p = profile.person;

  // displayName is resolved by personProfileService using getPersonDisplayName().
  // It prefers Person.currentName (EM canonical), falls back to the latest
  // contract's source-PDF basename when the canonical name is visually corrupted.
  const displayName            = profile.displayName || p.currentName || '(name unknown)';
  const rawExtractedName       = profile.rawExtractedName || '';
  const nameVisualCorrupted    = profile.flags?.nameVisualCorrupted;
  const isContractOnly         = profile.flags?.isContractOnly;

  // Highlight cases where canonicalName and rawExtractedName from the most
  // recent contract diverge — informational only, never used for matching.
  const latestContract  = profile.contracts[0];
  const latestPdfName   = latestContract?.rawExtractionJson?.Name || '';
  const canonicalName   = String(p.currentName || '').trim();
  const nameMismatchInfo = canonicalName && latestPdfName
    && canonicalName.replace(/\s+/g, ' ').toLowerCase() !== latestPdfName.replace(/\s+/g, ' ').toLowerCase();

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1280, margin: '0 auto', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <Link to="/v3/persons" style={{ fontSize: 12, color: '#6b7280' }}>← Persons list</Link>
          <h1 dir="auto" style={{ margin: '4px 0 0 0', wordBreak: 'break-word' }}>{displayName}</h1>
          <div style={{ fontSize: 13, color: '#4b5563' }}>
            <code>{p.identityNumber}</code> · {p.idType} · {p.nationality || '—'}
            {isContractOnly && <span style={{ marginLeft: 8, color: '#b45309' }}>· ContractOnly</span>}
          </div>
        </div>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13 }}>
          <Link to="/v3/imports">Import Dashboard</Link>
          <Link to="/v3/review-queue">Review queue</Link>
        </nav>
      </header>

      {nameVisualCorrupted && (
        <div style={{
          marginBottom: 12, padding: 8,
          background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
          color: '#92400e', fontSize: 13,
        }}>
          ⚠ <strong>PDF extracted name differs / RTL extraction limitation:</strong>{' '}
          The raw name extracted from the contract PDF is in visual-order Arabic
          (presentation forms) and would not display readably. Showing the source
          PDF filename as the readable name instead. The raw extraction is preserved
          below for audit/reference.
          <div style={{ marginTop: 6, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
            <div>displayName       = {displayName}</div>
            <div>rawExtractedName  = {rawExtractedName || '(empty)'}</div>
          </div>
        </div>
      )}

      {!nameVisualCorrupted && nameMismatchInfo && (
        <div style={{
          marginBottom: 12, padding: 8,
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6,
          color: '#1e40af', fontSize: 13,
        }}>
          ℹ <strong>Name mismatch warning:</strong> the canonical name from the
          Employee Master differs from the name extracted from the latest contract PDF.
          Arabic visual-order extraction can produce slightly different word groupings —
          this is a display-only flag, never used for matching.
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <div>canonicalName     = <code>{canonicalName}</code></div>
            <div>rawExtractedName  = <code>{latestPdfName}</code></div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
        {[
          [TAB_KEYS.MASTER,    'Master snapshot'],
          [TAB_KEYS.CONTRACTS, `Contracts (${profile.contracts.length})`],
          [TAB_KEYS.EMPNO,     `EmpNo history (${profile.employeeNumberHistory.length})`],
          [TAB_KEYS.AUDIT,     `Audit log (${profile.auditLog.length})`],
          [TAB_KEYS.REVIEW,    `Review (${(profile.openReviewItems||[]).length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '8px 14px',
              background: tab === key ? '#fff' : 'transparent',
              border: '1px solid #e5e7eb',
              borderBottomColor: tab === key ? '#fff' : '#e5e7eb',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontWeight: tab === key ? 600 : 400,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 16 }}>
        {tab === TAB_KEYS.MASTER    && <MasterTab    profile={profile} />}
        {tab === TAB_KEYS.CONTRACTS && <ContractsTab profile={profile} />}
        {tab === TAB_KEYS.EMPNO     && <EmpNoTab     profile={profile} />}
        {tab === TAB_KEYS.AUDIT     && <AuditTab     profile={profile} />}
        {tab === TAB_KEYS.REVIEW    && <ReviewTab    profile={profile} />}
      </div>
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#374151' };
const td = { padding: '10px 12px', fontSize: 13, verticalAlign: 'top' };
