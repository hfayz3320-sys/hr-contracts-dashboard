// -*- coding: utf-8 -*-
/**
 * reviewQueueService.js  (v3)
 *
 * High-level operations on the v3 review queue. Items are stored via the
 * existing reviewQueueRepository (legacy schema preserved) — v3-specific
 * fields live inside `extractedData.v3 === true` payload.
 *
 * Phase 1 surface area:
 *   - listOpenV3()            — every unresolved v3 item, newest first
 *   - listByPriority()        — filter by CRITICAL/HIGH/MEDIUM/LOW
 *   - listByImportJob(jobId)  — show every item produced by one import
 *   - listByReviewType(type)
 *   - markResolved(itemId, resolution)
 *   - markDismissed(itemId, reason)
 *   - statsByPriority()       — count map for dashboard tiles
 *
 * The commit service writes the items; this service is the read/update side.
 */

import { reviewQueueRepository } from '../../storage/repositories/reviewQueueRepository';
import { REVIEW_STATUSES }       from '../../storage/indexedDb/dbSchema';
import { PRIORITIES, REVIEW_TYPES } from '../../utils/identityModel';

function isV3Item(item) {
  return Boolean(item?.extractedData?.v3);
}

function v3Payload(item) {
  return item?.extractedData || {};
}

function compareCreatedAtDesc(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function listOpenV3() {
  const all = await reviewQueueRepository.listAll();
  return (all || [])
    .filter(isV3Item)
    .filter((it) => it.status === REVIEW_STATUSES.OPEN)
    .sort(compareCreatedAtDesc);
}

export async function listByPriority(priority) {
  const all = await listOpenV3();
  return all.filter((it) => v3Payload(it).priority === priority);
}

export async function listByImportJob(importJobId) {
  if (!importJobId) return [];
  const all = await reviewQueueRepository.listAll();
  return (all || [])
    .filter(isV3Item)
    .filter((it) => it.importJobId === importJobId)
    .sort(compareCreatedAtDesc);
}

export async function listByReviewType(reviewType) {
  const all = await listOpenV3();
  return all.filter((it) => v3Payload(it).reviewType === reviewType);
}

export async function statsByPriority() {
  const open = await listOpenV3();
  const counts = {
    [PRIORITIES.CRITICAL]: 0,
    [PRIORITIES.HIGH]:     0,
    [PRIORITIES.MEDIUM]:   0,
    [PRIORITIES.LOW]:      0,
  };
  for (const it of open) {
    const p = v3Payload(it).priority;
    if (p in counts) counts[p] += 1;
  }
  return counts;
}

// ── writes (resolve / dismiss) ───────────────────────────────────────────────

async function patchItem(itemId, patch) {
  const all = await reviewQueueRepository.listAll();
  const item = (all || []).find((x) => x.id === itemId);
  if (!item) throw new Error(`reviewQueueService: item not found: ${itemId}`);
  const updated = {
    ...item,
    ...patch,
    extractedData: { ...(item.extractedData || {}), ...(patch.extractedData || {}) },
  };
  return reviewQueueRepository.save(updated);
}

export async function markResolved(itemId, { resolvedBy = null, resolutionNote = '' } = {}) {
  return patchItem(itemId, {
    status: REVIEW_STATUSES.CONFIRMED,
    extractedData: {
      resolvedBy,
      resolutionNote,
      resolvedAt: new Date().toISOString(),
    },
  });
}

export async function markDismissed(itemId, { dismissedBy = null, reason = '' } = {}) {
  return patchItem(itemId, {
    status: REVIEW_STATUSES.SKIPPED,
    extractedData: {
      dismissedBy,
      dismissReason: reason,
      dismissedAt: new Date().toISOString(),
    },
  });
}

// Re-export the v3 enums so consumers have a single import surface.
export { PRIORITIES, REVIEW_TYPES };
