// -*- coding: utf-8 -*-
/**
 * PersonsListPage.jsx — searchable list of all persons in the v3 store.
 *
 * Layout rules:
 *  - Page never overflows horizontally; only the table card scrolls if needed.
 *  - Header (title + nav) wraps on narrow widths.
 *  - Identity is non-wrapping (monospace), Name wraps with a sensible max-width.
 *  - Display name uses getPersonDisplayName() — visually-corrupted Arabic
 *    extractions are replaced by the source-PDF filename basename.
 *
 * Gated behind FEATURE_FLAGS.newImports.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Link }                                from 'react-router-dom';
import { FEATURE_FLAGS }                       from '../utils/featureFlags';
import { listPersonsSummary }                  from '../services/persons/personProfileService';

export default function PersonsListPage() {
  if (!FEATURE_FLAGS.newImports) {
    return <div style={{ padding: 24 }}>Feature flag <code>newImports</code> is off.</div>;
  }

  const [rows, setRows]     = useState([]);
  const [busy, setBusy]     = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const list = await listPersonsSummary();
        if (!cancelled) setRows(list);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter((r) =>
      String(r.identityNumber).includes(filter) ||
      String(r.displayName  || '').toLowerCase().includes(f) ||
      String(r.currentName  || '').toLowerCase().includes(f)
    );
  }, [rows, filter]);

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Persons ({rows.length})</h1>
        <nav style={navStyle}>
          <Link to="/v3/imports">Import Dashboard</Link>
          <Link to="/v3/review-queue">Review queue</Link>
        </nav>
      </header>

      <input
        type="text"
        placeholder="Filter by IdentityNumber or name…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={searchStyle}
      />

      {busy && <div style={infoStyle}>Loading…</div>}

      {!busy && filtered.length === 0 && (
        <div style={infoStyle}>
          {rows.length === 0 ? 'No persons. Run an import first.' : 'No matches.'}
        </div>
      )}

      {!busy && filtered.length > 0 && (
        <div style={cardStyle}>
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr style={trHeadStyle}>
                  <th style={{ ...thStyle, minWidth: 130 }}>Identity</th>
                  <th style={{ ...thStyle, minWidth: 60  }}>Type</th>
                  <th style={{ ...thStyle, minWidth: 220 }}>Name</th>
                  <th style={{ ...thStyle, minWidth: 110 }}>Nationality</th>
                  <th style={{ ...thStyle, minWidth: 80,  textAlign: 'center' }}>Contracts</th>
                  <th style={{ ...thStyle, minWidth: 100, textAlign: 'center' }}>EmpNo Count</th>
                  <th style={{ ...thStyle, minWidth: 90,  textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((p) => (
                  <tr key={p.identityNumber} style={trBodyStyle}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>
                      {p.hasOpenReview && (
                        <span title="Has open review items" style={reviewDotStyle}>●</span>
                      )}
                      {p.identityNumber}
                    </td>
                    <td style={tdStyle}>{p.idType}</td>
                    <td style={{ ...tdStyle, maxWidth: 360, wordBreak: 'break-word' }}>
                      <span dir="auto">{p.displayName}</span>
                      {p.nameVisualCorrupted && (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          ⚠ raw PDF name visually corrupted
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>{p.nationality}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{p.contractCount}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{p.empNoCount}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link
                        to={`/v3/persons/${encodeURIComponent(p.identityNumber)}`}
                        style={openButtonStyle}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 && (
            <div style={footerHintStyle}>
              Showing first 200 of {filtered.length}. Refine the filter for more.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── inline styles ──────────────────────────────────────────────────────────

const pageStyle = {
  padding: 24,
  fontFamily: 'system-ui',
  maxWidth: 1280,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
  overflowX: 'hidden',         // page itself never scrolls horizontally
};
const headerStyle = {
  display: 'flex',
  flexWrap: 'wrap',            // wrap nav under title on narrow widths
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 16,
};
const navStyle = { display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13 };
const searchStyle = {
  padding: 8,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  width: '100%',
  maxWidth: 360,
  marginBottom: 12,
  boxSizing: 'border-box',
};
const infoStyle = { padding: 24, color: '#6b7280' };
const cardStyle = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  width: '100%',
  boxSizing: 'border-box',
};
const tableScrollStyle = {
  overflowX: 'auto',           // scroll lives INSIDE the card, not the page
  maxWidth: '100%',
};
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 720,               // forces horizontal scroll when card is narrower
};
const trHeadStyle  = { background: '#f3f4f6' };
const trBodyStyle  = { borderTop: '1px solid #e5e7eb' };
const thStyle      = { padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' };
const tdStyle      = { padding: '10px 12px', fontSize: 13, verticalAlign: 'top' };
const reviewDotStyle = { color: '#b45309', marginRight: 6, fontSize: 12 };
const openButtonStyle = {
  display: 'inline-block',
  padding: '4px 10px',
  background: '#2563eb',
  color: '#fff',
  borderRadius: 4,
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 500,
};
const footerHintStyle = { padding: '10px 12px', fontSize: 12, color: '#6b7280', borderTop: '1px solid #e5e7eb' };
