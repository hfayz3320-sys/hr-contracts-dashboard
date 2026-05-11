/**
 * /api/debug/counts — admin-only diagnostic endpoint introduced in Phase 3A.
 *
 * Purpose
 * -------
 * When the frontend shows zero rows on a page but the DB has data, an admin
 * needs a fast, side-effect-free way to confirm whether the discrepancy is:
 *   (a) data truly missing from D1
 *   (b) a parse/serialize failure on the way out of the worker
 *   (c) a zod-validation failure on the way into the frontend
 *
 * This endpoint answers (a) directly. The frontend admin debug panel pairs
 * this with what `useEmployees()` actually receives (which exercises both
 * the network path AND the zod schema) so the three counts — DB / API /
 * UI — can be eyeballed side by side.
 *
 * Returns counts ONLY. No row data, no identity numbers, no names — safe
 * to display in a tooltip / debug overlay without PII concerns.
 */
import { Hono } from 'hono';
import type { AppContext } from '../env';
import { requireAdmin } from '../lib/auth';

export const debugRoutes = new Hono<AppContext>();

debugRoutes.get('/api/debug/counts', requireAdmin, async (c) => {
  const env = c.env;

  async function scalar(sql: string): Promise<number> {
    const r = await env.DB.prepare(sql).first<{ n: number }>();
    return r?.n ?? 0;
  }

  // Count every operational table the dashboard reads. Each query is a
  // pure COUNT — no row data leaves D1.
  const [
    employees,
    employeesActive,
    employeeNumberHistory,
    contracts,
    contractsActive,
    contractsExpired,
    insurance,
    insuranceActive,
    insuranceExpired,
    insuranceMissing,
    insuranceLinked,
    reviewOpen,
    reviewResolved,
    reviewDismissed,
    importJobs,
    auditEvents,
    sourceFiles,
    appUsers,
  ] = await Promise.all([
    scalar('SELECT COUNT(*) AS n FROM employees'),
    scalar("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'"),
    scalar('SELECT COUNT(*) AS n FROM employee_number_history'),
    scalar('SELECT COUNT(*) AS n FROM contracts'),
    scalar("SELECT COUNT(*) AS n FROM contracts WHERE status = 'active'"),
    scalar("SELECT COUNT(*) AS n FROM contracts WHERE status = 'expired'"),
    scalar('SELECT COUNT(*) AS n FROM insurance_policies'),
    scalar("SELECT COUNT(*) AS n FROM insurance_policies WHERE status = 'active'"),
    scalar("SELECT COUNT(*) AS n FROM insurance_policies WHERE status = 'expired'"),
    scalar("SELECT COUNT(*) AS n FROM insurance_policies WHERE status = 'missing'"),
    scalar('SELECT COUNT(*) AS n FROM insurance_policies WHERE employee_id IS NOT NULL'),
    scalar("SELECT COUNT(*) AS n FROM review_queue WHERE status = 'open'"),
    scalar("SELECT COUNT(*) AS n FROM review_queue WHERE status = 'resolved'"),
    scalar("SELECT COUNT(*) AS n FROM review_queue WHERE status = 'dismissed'"),
    scalar('SELECT COUNT(*) AS n FROM import_jobs'),
    scalar('SELECT COUNT(*) AS n FROM audit_events'),
    scalar('SELECT COUNT(*) AS n FROM source_files'),
    scalar('SELECT COUNT(*) AS n FROM app_users'),
  ]);

  // Schema-health probes — answer the "is anything in the DB violating
  // what zod expects to see?" question without leaking row data.
  const schemaHealth = {
    employeesMissingIdentity:    await scalar("SELECT COUNT(*) AS n FROM employees WHERE identity_number IS NULL OR identity_number = ''"),
    employeesMissingName:        await scalar("SELECT COUNT(*) AS n FROM employees WHERE full_name IS NULL OR full_name = ''"),
    contractsMissingHash:        await scalar("SELECT COUNT(*) AS n FROM contracts WHERE file_hash IS NULL OR file_hash = ''"),
    contractsMissingFilename:    await scalar("SELECT COUNT(*) AS n FROM contracts WHERE filename IS NULL OR filename = ''"),
    contractsConfidenceOutOfRange: await scalar('SELECT COUNT(*) AS n FROM contracts WHERE extraction_confidence IS NOT NULL AND (extraction_confidence < 0 OR extraction_confidence > 1)'),
    insuranceMissingPolicyNumber:  await scalar("SELECT COUNT(*) AS n FROM insurance_policies WHERE policy_number IS NULL OR policy_number = ''"),
    insuranceMissingStart:         await scalar('SELECT COUNT(*) AS n FROM insurance_policies WHERE start_date IS NULL'),
  };

  return c.json({
    ok: true as const,
    at: new Date().toISOString(),
    db: {
      employees,
      employeesActive,
      employeeNumberHistory,
      contracts,
      contractsActive,
      contractsExpired,
      insurance,
      insuranceActive,
      insuranceExpired,
      insuranceMissing,
      insuranceLinked,
      reviewOpen,
      reviewResolved,
      reviewDismissed,
      importJobs,
      auditEvents,
      sourceFiles,
      appUsers,
    },
    schemaHealth,
  });
});
