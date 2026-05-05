// -*- coding: utf-8 -*-
/**
 * ReviewQueuePage.jsx
 *
 * Lists open v3 review queue items, filtered by tab (review type).
 * Resolve / dismiss actions update item status without modifying any
 * other v3 entity. Gated behind FEATURE_FLAGS.newImports.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { FEATURE_FLAGS } from '../utils/featureFlags';
import {
  listOpenV3,
  listByPriority,
  listByReviewType,
  markResolved,
  markDismissed,
  statsByPriority,
  PRIORITIES,
  REVIEW_TYPES,
} from '../services/imports/reviewQueueService';

const TABS = [
  { key: 'all',                       label: 'All' },
  { key: REVIEW_TYPES.MISSING_IDENTITY, label: 'Missing Identity' },
  { key: REVIEW_TYPES.INVALID_IDENTITY, label: 'Invalid Identity' },
  { key: REVIEW_TYPES.AMBIGUOUS_MATCH,  label: 'Ambiguous Match' },
  { key: REVIEW_TYPES.SALARY_CONFLICT,  label: 'Salary Conflict' },
  { key: REVIEW_TYPES.DATE_CONFLICT,    label: 'Date Conflict' },
];

const PRIORITY_COLOURS = {
  CRITICAL: '#b91c1c',
  HIGH:     '#b45309',
  MEDIUM:   '#1d4ed8',
  LOW:      '#374151',
};

function PriorityBadge({ priority }) {
  return (
    <span style={{
      padding: '2px 8px',
      background: PRIORITY_COLOURS[priority] || '#6b7280',
      color: 'white',
      fontSize: 11,
      borderRadius: 10,
      fontWeight: 600,
    }}>
      {priority}
    </span>
  );
}

function FlagDisabled() {
  return <div style={{ padding: 24 }}>Feature flag <code>newImports</code> is off.</div>;
}

export default function ReviewQueuePage() {
  if (!FEATURE_FLAGS.newImports) return <FlagDisabled />;

  const [tab, setTab]     = useState('all');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
  const [busy, setBusy]   = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const list = tab === 'all' ? await listOpenV3() : await listByReviewType(tab);
        const s    = await statsByPriority();
        if (!cancelled) {
          setItems(list);
          setStats(s);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, refresh]);

  async function onResolve(item) {
    await markResolved(item.id, { resolutionNote: 'Marked resolved from UI' });
    setRefresh((n) => n + 1);
  }
  async function onDismiss(item) {
    await markDismissed(item.id, { reason: 'Dismissed from UI' });
    setRefresh((n) => n + 1);
  }

  const totalOpen = useMemo(
    () => Object.values(stats).reduce((a, b) => a + b, 0),
    [stats]
  );

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1280, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Review Queue</h1>
        <nav style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <Link to="/v3/imports">Import Dashboard</Link>
          <Link to="/v3/persons">Persons</Link>
        </nav>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Object.entries(stats).map(([p, n]) => (
          <div key={p} style={{
            padding: '6px 12px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <PriorityBadge priority={p} />
            <span>{n}</span>
          </div>
        ))}
        <div style={{ padding: '6px 12px', background: '#f3f4f6', borderRadius: 8 }}>
          Total open: <strong>{totalOpen}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px',
              background: tab === t.key ? '#fff' : 'transparent',
              border: '1px solid #e5e7eb',
              borderBottomColor: tab === t.key ? '#fff' : '#e5e7eb',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontWeight: tab === t.key ? 600 : 400,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {busy && <div>Loading…</div>}
      {!busy && items.length === 0 && <div style={{ padding: 24, color: '#6b7280' }}>No items in this tab.</div>}

      {!busy && items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={th}>Priority</th>
              <th style={th}>Type</th>
              <th style={th}>Identity</th>
              <th style={th}>Reason</th>
              <th style={th}>Source</th>
              <th style={th}>Created</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const v3 = it.extractedData || {};
              return (
                <tr key={it.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={td}><PriorityBadge priority={v3.priority} /></td>
                  <td style={td}><code>{v3.reviewType}</code></td>
                  <td style={td}>
                    {it.entityId
                      ? <Link to={`/v3/persons/${encodeURIComponent(it.entityId)}`}>{it.entityId}</Link>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={td}>{v3.reason || it.title}</td>
                  <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>
                    {v3.sourceType}<br />{v3.sourceFile}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>
                    {String(it.createdAt || '').slice(0, 19).replace('T', ' ')}
                  </td>
                  <td style={td}>
                    <button type="button" style={btnSmall}    onClick={() => onResolve(it)}>Resolve</button>
                    <button type="button" style={btnSmallGhost} onClick={() => onDismiss(it)}>Dismiss</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#374151' };
const td = { padding: '10px 12px', fontSize: 13, verticalAlign: 'top' };
const btnSmall      = { padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 6, fontSize: 12 };
const btnSmallGhost = { padding: '4px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
