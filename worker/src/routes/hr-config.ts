/**
 * Phase 6A-1 — HR Configuration routes.
 *
 * Reads:  16 endpoints under /api/config/*  — auth-required.
 * Writes: 8 endpoints (org-units, job-titles, positions, grades only).
 *         All admin-only. All write an audit_events row.
 *
 * Rules enforced here (NOT in the repo):
 *   * `code` is IMMUTABLE post-create. Patch requests omit it; the repo
 *     also refuses to write the column on update as defense-in-depth.
 *   * Cycle guard on hr_org_units re-parent.
 *   * 409 on duplicate code (create).
 *   * No DELETE endpoints — retire via PATCH { active: false }.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import { requireAuth, requireAdmin, getActorEmail } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { newId } from '../lib/id';
import {
  hrOrgUnitCreateRequest, hrOrgUnitPatchRequest,
  hrJobTitleCreateRequest, hrJobTitlePatchRequest,
  hrPositionCreateRequest, hrPositionPatchRequest,
  hrGradeCreateRequest, hrGradePatchRequest,
} from '@shared/api-contract';
import type { HrOrgUnitNode } from '@shared/domain';
import {
  listOrgUnits, getOrgUnit, getOrgUnitByCode, insertOrgUnit, updateOrgUnit,
  computeOrgUnitLevel, wouldCreateOrgCycle,
  listJobTitles, getJobTitle, getJobTitleByCode, insertJobTitle, updateJobTitle,
  listPositions, getPosition, getPositionByCode, insertPosition, updatePosition,
  listGrades, getGrade, getGradeByCode, insertGrade, updateGrade,
  listTrades,
  listContractTypes,
  listPayrollComponents,
  listMedicalProviders,
  listMedicalPolicyClasses,
  listDocumentTypes,
  listTransactionTypes,
  listActivityTypes,
  listLearningCategories,
  listSocialInsuranceRules,
} from '../db/repo-hr-config';

export const hrConfigRoutes = new Hono<AppContext>();

// All /api/config/* routes require auth. Mutations are gated per-route below.
hrConfigRoutes.use('/api/config/*', requireAuth);

// ============================================================================
// Bundled snapshot — single fetch for FE bootstrap
// ============================================================================
hrConfigRoutes.get('/api/config/hr', async (c) => {
  const [
    orgUnits, jobTitles, positions, grades, trades, contractTypes,
    payrollComponents, learningCategories, medicalProviders,
    medicalPolicyClasses, socialInsuranceRules,
    documentTypes, transactionTypes, activityTypes,
  ] = await Promise.all([
    listOrgUnits(c.env), listJobTitles(c.env), listPositions(c.env),
    listGrades(c.env), listTrades(c.env), listContractTypes(c.env),
    listPayrollComponents(c.env), listLearningCategories(c.env),
    listMedicalProviders(c.env), listMedicalPolicyClasses(c.env),
    listSocialInsuranceRules(c.env), listDocumentTypes(c.env),
    listTransactionTypes(c.env), listActivityTypes(c.env),
  ]);
  return c.json({
    orgUnits, jobTitles, positions, grades, trades, contractTypes,
    payrollComponents, learningCategories, medicalProviders,
    medicalPolicyClasses, socialInsuranceRules,
    documentTypes, transactionTypes, activityTypes,
  });
});

// ============================================================================
// Org units (reads + admin writes + tree + hierarchy guards)
// ============================================================================

hrConfigRoutes.get('/api/config/org-units', async (c) => {
  const items = await listOrgUnits(c.env);
  return c.json({ items });
});

hrConfigRoutes.get('/api/config/org-units/tree', async (c) => {
  const flat = await listOrgUnits(c.env);
  const byId = new Map<string, HrOrgUnitNode>();
  for (const u of flat) byId.set(u.id, { ...u, children: [] });
  const roots: HrOrgUnitNode[] = [];
  for (const u of flat) {
    const node = byId.get(u.id)!;
    if (u.parentId && byId.has(u.parentId)) byId.get(u.parentId)!.children.push(node);
    else roots.push(node);
  }
  return c.json({ items: roots });
});

hrConfigRoutes.post('/api/config/org-units', requireAdmin, async (c) => {
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const raw = await c.req.json().catch(() => null);
  const parsed = hrOrgUnitCreateRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid payload', issues: parsed.error.issues }, 400);
  }
  const dup = await getOrgUnitByCode(c.env, parsed.data.code);
  if (dup) return c.json({ error: 'CONFLICT', message: `code ${parsed.data.code} already exists` }, 409);
  if (parsed.data.parentId) {
    const parent = await getOrgUnit(c.env, parsed.data.parentId);
    if (!parent) return c.json({ error: 'BAD_REQUEST', message: 'parent_id not found' }, 400);
  }
  const id = newId('org');
  const level = await computeOrgUnitLevel(c.env, parsed.data.parentId ?? null);
  await insertOrgUnit(c.env, {
    id,
    code: parsed.data.code,
    name: parsed.data.name,
    nameAr: parsed.data.nameAr ?? null,
    type: parsed.data.type,
    parentId: parsed.data.parentId ?? null,
    level,
    managerEmployeeId: parsed.data.managerEmployeeId ?? null,
    siteCode: parsed.data.siteCode ?? null,
    projectCode: parsed.data.projectCode ?? null,
    displayOrder: parsed.data.displayOrder,
    createdBy: actor,
    updatedBy: actor,
  });
  await writeAudit(c.env, { actor, action: 'config.org_unit.create', target: id, status: 'ok', details: `code=${parsed.data.code}` });
  const created = await getOrgUnit(c.env, id);
  return c.json({ ok: true as const, item: created });
});

hrConfigRoutes.patch('/api/config/org-units/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const before = await getOrgUnit(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: 'org unit not found' }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = hrOrgUnitPatchRequest.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid patch', issues: parsed.error.issues }, 400);
  }
  // Cycle guard: a re-parent must not make `id` an ancestor of itself.
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== before.parentId) {
    if (await wouldCreateOrgCycle(c.env, id, parsed.data.parentId ?? null)) {
      return c.json({ error: 'BAD_REQUEST', message: 'parent_id would create a cycle' }, 400);
    }
  }
  // Re-compute level if parent changed.
  let nextLevel: number | undefined;
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== before.parentId) {
    nextLevel = await computeOrgUnitLevel(c.env, parsed.data.parentId ?? null);
  }
  await updateOrgUnit(c.env, id, { ...parsed.data, level: nextLevel }, actor);
  await writeAudit(c.env, { actor, action: 'config.org_unit.patch', target: id, status: 'ok',
    details: Object.keys(parsed.data).join(',') });
  const after = await getOrgUnit(c.env, id);
  return c.json({ ok: true as const, item: after });
});

// ============================================================================
// Job titles
// ============================================================================

hrConfigRoutes.get('/api/config/job-titles', async (c) => {
  const items = await listJobTitles(c.env);
  return c.json({ items });
});

hrConfigRoutes.post('/api/config/job-titles', requireAdmin, async (c) => {
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const raw = await c.req.json().catch(() => null);
  const parsed = hrJobTitleCreateRequest.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: 'Invalid payload', issues: parsed.error.issues }, 400);
  const dup = await getJobTitleByCode(c.env, parsed.data.code);
  if (dup) return c.json({ error: 'CONFLICT', message: `code ${parsed.data.code} already exists` }, 409);
  const id = newId('jtl');
  await insertJobTitle(c.env, {
    id, code: parsed.data.code, name: parsed.data.name, nameAr: parsed.data.nameAr ?? null,
    category: parsed.data.category ?? null, description: parsed.data.description ?? null,
    displayOrder: parsed.data.displayOrder, createdBy: actor, updatedBy: actor,
  });
  await writeAudit(c.env, { actor, action: 'config.job_title.create', target: id, status: 'ok', details: `code=${parsed.data.code}` });
  const created = await getJobTitle(c.env, id);
  return c.json({ ok: true as const, item: created });
});

hrConfigRoutes.patch('/api/config/job-titles/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const before = await getJobTitle(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: 'job title not found' }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = hrJobTitlePatchRequest.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: 'Invalid patch', issues: parsed.error.issues }, 400);
  await updateJobTitle(c.env, id, parsed.data, actor);
  await writeAudit(c.env, { actor, action: 'config.job_title.patch', target: id, status: 'ok',
    details: Object.keys(parsed.data).join(',') });
  const after = await getJobTitle(c.env, id);
  return c.json({ ok: true as const, item: after });
});

// ============================================================================
// Positions
// ============================================================================

hrConfigRoutes.get('/api/config/positions', async (c) => {
  const items = await listPositions(c.env);
  return c.json({ items });
});

hrConfigRoutes.post('/api/config/positions', requireAdmin, async (c) => {
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const raw = await c.req.json().catch(() => null);
  const parsed = hrPositionCreateRequest.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: 'Invalid payload', issues: parsed.error.issues }, 400);
  const dup = await getPositionByCode(c.env, parsed.data.code);
  if (dup) return c.json({ error: 'CONFLICT', message: `code ${parsed.data.code} already exists` }, 409);
  const jt = await getJobTitle(c.env, parsed.data.jobTitleId);
  if (!jt) return c.json({ error: 'BAD_REQUEST', message: 'job_title_id not found' }, 400);
  const ou = await getOrgUnit(c.env, parsed.data.orgUnitId);
  if (!ou) return c.json({ error: 'BAD_REQUEST', message: 'org_unit_id not found' }, 400);
  if (parsed.data.gradeId) {
    const g = await getGrade(c.env, parsed.data.gradeId);
    if (!g) return c.json({ error: 'BAD_REQUEST', message: 'grade_id not found' }, 400);
  }
  const id = newId('pos');
  await insertPosition(c.env, {
    id, code: parsed.data.code,
    jobTitleId: parsed.data.jobTitleId, orgUnitId: parsed.data.orgUnitId,
    gradeId: parsed.data.gradeId ?? null, reportsToPositionId: parsed.data.reportsToPositionId ?? null,
    headcountAllowed: parsed.data.headcountAllowed,
    displayOrder: parsed.data.displayOrder, createdBy: actor, updatedBy: actor,
  });
  await writeAudit(c.env, { actor, action: 'config.position.create', target: id, status: 'ok', details: `code=${parsed.data.code}` });
  const created = await getPosition(c.env, id);
  return c.json({ ok: true as const, item: created });
});

hrConfigRoutes.patch('/api/config/positions/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const before = await getPosition(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: 'position not found' }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = hrPositionPatchRequest.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: 'Invalid patch', issues: parsed.error.issues }, 400);
  // Validate FKs the patch touches.
  if (parsed.data.jobTitleId !== undefined) {
    const jt = await getJobTitle(c.env, parsed.data.jobTitleId);
    if (!jt) return c.json({ error: 'BAD_REQUEST', message: 'job_title_id not found' }, 400);
  }
  if (parsed.data.orgUnitId !== undefined) {
    const ou = await getOrgUnit(c.env, parsed.data.orgUnitId);
    if (!ou) return c.json({ error: 'BAD_REQUEST', message: 'org_unit_id not found' }, 400);
  }
  if (parsed.data.gradeId) {
    const g = await getGrade(c.env, parsed.data.gradeId);
    if (!g) return c.json({ error: 'BAD_REQUEST', message: 'grade_id not found' }, 400);
  }
  await updatePosition(c.env, id, parsed.data, actor);
  await writeAudit(c.env, { actor, action: 'config.position.patch', target: id, status: 'ok',
    details: Object.keys(parsed.data).join(',') });
  const after = await getPosition(c.env, id);
  return c.json({ ok: true as const, item: after });
});

// ============================================================================
// Grades
// ============================================================================

hrConfigRoutes.get('/api/config/grades', async (c) => {
  const items = await listGrades(c.env);
  return c.json({ items });
});

hrConfigRoutes.post('/api/config/grades', requireAdmin, async (c) => {
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const raw = await c.req.json().catch(() => null);
  const parsed = hrGradeCreateRequest.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: 'Invalid payload', issues: parsed.error.issues }, 400);
  const dup = await getGradeByCode(c.env, parsed.data.code);
  if (dup) return c.json({ error: 'CONFLICT', message: `code ${parsed.data.code} already exists` }, 409);
  const id = newId('grd');
  await insertGrade(c.env, {
    id, code: parsed.data.code, name: parsed.data.name, nameAr: parsed.data.nameAr ?? null,
    level: parsed.data.level,
    salaryBandMin: parsed.data.salaryBandMin ?? null,
    salaryBandMax: parsed.data.salaryBandMax ?? null,
    currency: parsed.data.currency,
    displayOrder: parsed.data.displayOrder, createdBy: actor, updatedBy: actor,
  });
  await writeAudit(c.env, { actor, action: 'config.grade.create', target: id, status: 'ok', details: `code=${parsed.data.code}` });
  const created = await getGrade(c.env, id);
  return c.json({ ok: true as const, item: created });
});

hrConfigRoutes.patch('/api/config/grades/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'BAD_REQUEST', message: 'Missing id' }, 400);
  const actor = (await getActorEmail(c)) ?? 'unknown';
  const before = await getGrade(c.env, id);
  if (!before) return c.json({ error: 'NOT_FOUND', message: 'grade not found' }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = hrGradePatchRequest.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'BAD_REQUEST', message: 'Invalid patch', issues: parsed.error.issues }, 400);
  await updateGrade(c.env, id, parsed.data, actor);
  await writeAudit(c.env, { actor, action: 'config.grade.patch', target: id, status: 'ok',
    details: Object.keys(parsed.data).join(',') });
  const after = await getGrade(c.env, id);
  return c.json({ ok: true as const, item: after });
});

// ============================================================================
// Read-only routes for the remaining 9 tables (no admin mutations in 6A-1)
// ============================================================================

hrConfigRoutes.get('/api/config/trades',                   async (c) => c.json({ items: await listTrades(c.env) }));
hrConfigRoutes.get('/api/config/contract-types',           async (c) => c.json({ items: await listContractTypes(c.env) }));
hrConfigRoutes.get('/api/config/payroll-components',       async (c) => c.json({ items: await listPayrollComponents(c.env) }));
hrConfigRoutes.get('/api/config/learning-categories',      async (c) => c.json({ items: await listLearningCategories(c.env) }));
hrConfigRoutes.get('/api/config/medical-providers',        async (c) => c.json({ items: await listMedicalProviders(c.env) }));
hrConfigRoutes.get('/api/config/medical-policy-classes',   async (c) => c.json({ items: await listMedicalPolicyClasses(c.env) }));
hrConfigRoutes.get('/api/config/social-insurance-rules',   async (c) => c.json({ items: await listSocialInsuranceRules(c.env) }));
hrConfigRoutes.get('/api/config/document-types',           async (c) => c.json({ items: await listDocumentTypes(c.env) }));
hrConfigRoutes.get('/api/config/transaction-types',        async (c) => c.json({ items: await listTransactionTypes(c.env) }));
hrConfigRoutes.get('/api/config/activity-types',           async (c) => c.json({ items: await listActivityTypes(c.env) }));
