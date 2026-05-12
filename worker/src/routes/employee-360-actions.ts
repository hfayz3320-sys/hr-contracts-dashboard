/**
 * Phase 10 — routes for the four new Employee 360 action entities.
 *
 *   timeline      GET /api/employees/:id/timeline          (requireAuth)
 *                 POST /api/employees/:id/messages         (requireAdmin → admin OR hr_manager via check below)
 *                 POST /api/employees/:id/notes            (same)
 *
 *   activities    GET /api/employees/:id/activities        (requireAuth)
 *                 POST /api/employees/:id/activities       (requireAdmin)
 *                 PATCH /api/employee-activities/:id       (requireAdmin)
 *
 *   compensation  GET /api/employees/:id/compensation      (requireAuth)
 *                 POST /api/employees/:id/compensation     (requireAdmin)
 *
 *   learning      GET /api/employees/:id/learning          (requireAuth)
 *                 POST /api/employees/:id/learning         (requireAdmin)
 *
 * Permission policy:
 *   - read  = any authenticated user
 *   - write = admin OR hr_manager (worker auth treats both as eligible for
 *             HR mutations; requireAdmin gates admin-only ops elsewhere)
 *
 * Audit:
 *   - Every successful write emits an audit_events row tagged with the
 *     target employee id so the entry appears in the Activity panel.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import { getEmployee } from '../db/repo-employees';
import {
  listTimelineForEmployee,
  insertTimelineEntry,
  listActivitiesForEmployee,
  getActivity,
  insertActivity,
  updateActivity,
  listCompensationForEmployee,
  insertCompensationLine,
  listLearningForEmployee,
  insertLearningRecord,
} from '../db/repo-employee-360-actions';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import {
  employeeTimelineEntryCreateRequest,
  employeeActivityCreateRequest,
  employeeActivityPatchRequest,
  employeeCompensationCreateRequest,
  employeeLearningCreateRequest,
} from '@shared/api-contract';

export const employee360ActionsRoutes = new Hono<AppContext>();

// All endpoints require auth (read); write endpoints additionally require
// admin via `requireAdmin` middleware applied per-handler.
employee360ActionsRoutes.use('/api/employees/:id/timeline', requireAuth);
employee360ActionsRoutes.use('/api/employees/:id/activities', requireAuth);
employee360ActionsRoutes.use('/api/employees/:id/compensation', requireAuth);
employee360ActionsRoutes.use('/api/employees/:id/learning', requireAuth);
// Sub-resource updates always require auth; admin gate applied to PATCH below.
employee360ActionsRoutes.use('/api/employee-activities/:id', requireAuth);

// ===========================================================================
// timeline
// ===========================================================================

employee360ActionsRoutes.get('/api/employees/:id/timeline', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const items = await listTimelineForEmployee(c.env, id);
  return c.json({ items, total: items.length });
});

async function postTimeline(c: Parameters<Parameters<typeof employee360ActionsRoutes.post>[2]>[0], entryType: 'message' | 'note') {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = employeeTimelineEntryCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues }, 400);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const newRowId = newId(entryType === 'message' ? 'msg' : 'nte');
  const entry = await insertTimelineEntry(c.env, newRowId, {
    employeeId: id,
    entryType,
    body: parsed.data.body,
    actor,
  });
  await writeAudit(c.env, {
    actor,
    action: entryType === 'message' ? 'employee.message' : 'employee.note',
    target: id,
    status: 'ok',
    details: parsed.data.body.slice(0, 200),
  });
  return c.json({ ok: true as const, entry });
}

employee360ActionsRoutes.post('/api/employees/:id/messages', requireAdmin, (c) => postTimeline(c, 'message'));
employee360ActionsRoutes.post('/api/employees/:id/notes',    requireAdmin, (c) => postTimeline(c, 'note'));

// ===========================================================================
// activities
// ===========================================================================

employee360ActionsRoutes.get('/api/employees/:id/activities', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const items = await listActivitiesForEmployee(c.env, id);
  return c.json({ items, total: items.length });
});

employee360ActionsRoutes.post('/api/employees/:id/activities', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = employeeActivityCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues }, 400);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const activity = await insertActivity(c.env, newId('act'), {
    employeeId: id,
    activityType: parsed.data.activityType,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    dueDate: parsed.data.dueDate ?? null,
    assignedTo: parsed.data.assignedTo ?? null,
    actor,
  });
  await writeAudit(c.env, {
    actor,
    action: 'employee.activity_create',
    target: id,
    status: 'ok',
    details: `${parsed.data.activityType}: ${parsed.data.title}`,
  });
  return c.json({ ok: true as const, activity });
});

employee360ActionsRoutes.patch('/api/employee-activities/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const existing = await getActivity(c.env, id);
  if (!existing) return c.json({ error: 'NOT_FOUND', message: `Activity ${id} not found` }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = employeeActivityPatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues }, 400);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const activity = await updateActivity(c.env, id, {
    ...(parsed.data.status     !== undefined ? { status:      parsed.data.status }     : {}),
    ...(parsed.data.title      !== undefined ? { title:       parsed.data.title }      : {}),
    ...(parsed.data.description!== undefined ? { description: parsed.data.description ?? null } : {}),
    ...(parsed.data.dueDate    !== undefined ? { dueDate:     parsed.data.dueDate ?? null }     : {}),
    ...(parsed.data.assignedTo !== undefined ? { assignedTo:  parsed.data.assignedTo ?? null }  : {}),
    actor,
  });
  await writeAudit(c.env, {
    actor,
    action: 'employee.activity_update',
    target: existing.employeeId,
    status: 'ok',
    details: parsed.data.status ? `status → ${parsed.data.status}` : 'updated',
  });
  return c.json({ ok: true as const, activity });
});

// ===========================================================================
// compensation
// ===========================================================================

employee360ActionsRoutes.get('/api/employees/:id/compensation', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const items = await listCompensationForEmployee(c.env, id);
  return c.json({ items, total: items.length });
});

employee360ActionsRoutes.post('/api/employees/:id/compensation', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = employeeCompensationCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues }, 400);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const line = await insertCompensationLine(c.env, newId('cmp'), {
    employeeId: id,
    componentCode: parsed.data.componentCode,
    componentName: parsed.data.componentName,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    frequency: parsed.data.frequency,
    effectiveFrom: parsed.data.effectiveFrom,
    effectiveTo: parsed.data.effectiveTo ?? null,
    notes: parsed.data.notes ?? null,
    actor,
  });
  await writeAudit(c.env, {
    actor,
    action: 'employee.compensation_add',
    target: id,
    status: 'ok',
    details: `${parsed.data.componentCode} ${parsed.data.amount} ${parsed.data.currency}`,
  });
  return c.json({ ok: true as const, line });
});

// ===========================================================================
// learning
// ===========================================================================

employee360ActionsRoutes.get('/api/employees/:id/learning', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const items = await listLearningForEmployee(c.env, id);
  return c.json({ items, total: items.length });
});

employee360ActionsRoutes.post('/api/employees/:id/learning', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const employee = await getEmployee(c.env, id);
  if (!employee) return c.json({ error: 'NOT_FOUND', message: `Employee ${id} not found` }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = employeeLearningCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid request', issues: parsed.error.issues }, 400);
  }
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const record = await insertLearningRecord(c.env, newId('lrn'), {
    employeeId: id,
    recordType: parsed.data.recordType,
    title: parsed.data.title,
    provider: parsed.data.provider ?? null,
    issueDate: parsed.data.issueDate ?? null,
    expiryDate: parsed.data.expiryDate ?? null,
    level: parsed.data.level ?? null,
    notes: parsed.data.notes ?? null,
    actor,
  });
  await writeAudit(c.env, {
    actor,
    action: 'employee.learning_add',
    target: id,
    status: 'ok',
    details: `${parsed.data.recordType}: ${parsed.data.title}`,
  });
  return c.json({ ok: true as const, record });
});
