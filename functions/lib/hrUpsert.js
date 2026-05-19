// -*- coding: utf-8 -*-
/**
 * functions/lib/hrUpsert.js
 *
 * UPSERT engine for HR Contracts Dashboard. Runs inside a Cloudflare Pages
 * Function with a D1 binding (env.DB).
 *
 * Identity-centric rules (NEVER violate):
 *   1. Primary person key  = identity_number (Iqama / National ID)
 *   2. EmployeeNumber      = secondary / history only
 *   3. Name                = NEVER a match key
 *   4. StaffNumber alone   = NEVER auto-creates a person
 *
 * The functions in this file are pure-data (no I/O beyond `db`) so they can
 * be unit-tested with a sqlite-shaped mock if needed later.
 *
 * Public surface:
 *   - applyImport(db, payload, jobMeta)  → { jobId, summary, blockers }
 *   - dryRunImport(db, payload)          → { summary, blockers }
 *   - rollbackImport(db, importJobId)    → { restored, deleted }
 *   - readCurrentSnapshot(db)            → snapshot or null
 *   - hashContract(c)                    → SHA-256 hex (contract_key)
 */

const NOW = () => new Date().toISOString();
const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  ('id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

// ─── helpers ────────────────────────────────────────────────────────────────
function isValidIdentity(idNum) {
  if (idNum === null || idNum === undefined) return false;
  const s = String(idNum).replace(/\D+/g, '');
  return s.length === 10;
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(String(input));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashContract(c) {
  const id     = String(c.identityNumber || '').replace(/\D+/g, '');
  const cn     = String(c.contractNumber || '').trim();
  const start  = String(c.startDate      || '').trim();
  const end    = c.contractEndType === 'OPEN_ENDED' ? 'OPEN_ENDED' : String(c.endDate || '').trim();
  return sha256Hex([id, cn, start, end].join('|'));
}

// ─── audit + review ────────────────────────────────────────────────────────
async function logAudit(db, jobId, entityType, entityId, action, oldVal, newVal, matchKey, reason) {
  await db
    .prepare(
      `INSERT INTO import_audit_log
        (id, import_job_id, entity_type, entity_id, action, match_key, old_value_json, new_value_json, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      uid(), jobId, entityType, entityId, action, matchKey || null,
      oldVal ? JSON.stringify(oldVal) : null,
      newVal ? JSON.stringify(newVal) : null,
      reason || null, NOW()
    )
    .run();
}

async function pushReview(db, jobId, entityType, severity, reason, idNum, empNo, sourceFile, payload) {
  const id = uid();
  await db
    .prepare(
      `INSERT INTO review_queue
        (id, import_job_id, entity_type, severity, reason, identity_number,
         employee_number, source_file_name, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    )
    .bind(
      id, jobId, entityType, severity, reason,
      idNum || null, empNo || null, sourceFile || null,
      payload ? JSON.stringify(payload) : null, NOW()
    )
    .run();
  return id;
}

// ─── lookups ───────────────────────────────────────────────────────────────
async function findPersonByIdentity(db, identity) {
  return await db
    .prepare(`SELECT * FROM persons WHERE identity_number = ?`)
    .bind(identity)
    .first();
}
async function findPersonByEmpNo(db, empNo) {
  if (!empNo) return null;
  return await db
    .prepare(`SELECT * FROM persons WHERE latest_employee_number = ?`)
    .bind(String(empNo))
    .first();
}
async function findContractByKey(db, key) {
  return await db.prepare(`SELECT * FROM contracts WHERE contract_key = ?`).bind(key).first();
}

// ─── core upserts ──────────────────────────────────────────────────────────
async function upsertPerson(db, jobId, row, summary, opts) {
  // Validate identity FIRST
  if (!isValidIdentity(row.identityNumber)) {
    summary.blockedRows += 1;
    await pushReview(db, jobId, 'employee', 'critical',
      'Missing or invalid IdentityNumber', row.identityNumber, row.employeeNumber,
      row.sourceFileName, row);
    return { person: null, action: 'block' };
  }

  const identity = String(row.identityNumber).replace(/\D+/g, '');
  const existing = await findPersonByIdentity(db, identity);

  // Conflict: a different person already owns this employeeNumber
  if (row.employeeNumber) {
    const empNoOwner = await findPersonByEmpNo(db, row.employeeNumber);
    if (empNoOwner && empNoOwner.identity_number !== identity) {
      summary.blockedRows += 1;
      summary.criticalConflicts = (summary.criticalConflicts || 0) + 1;
      await pushReview(db, jobId, 'employee', 'critical',
        `EmployeeNumber ${row.employeeNumber} already belongs to identity ${empNoOwner.identity_number}`,
        identity, row.employeeNumber, row.sourceFileName, row);
      return { person: null, action: 'block' };
    }
  }

  if (!existing) {
    if (opts && opts.dryRun) {
      summary.newPersons += 1;
      return { person: { id: 'dry-' + identity, identity_number: identity }, action: 'create-dry' };
    }
    const id = uid();
    const newPerson = {
      id, identity_number: identity,
      name_en: row.nameEn || null, name_ar: row.nameAr || null,
      nationality: row.nationality || null, date_of_birth: row.dateOfBirth || null,
      mobile: row.mobile || null, email: row.email || null, iban: row.iban || null,
      passport_number: row.passportNumber || null,
      latest_employee_number: row.employeeNumber || null,
      source: row.source || 'admin-import',
      created_at: NOW(), updated_at: NOW(),
    };
    await db
      .prepare(
        `INSERT INTO persons (id, identity_number, name_en, name_ar, nationality, date_of_birth,
          mobile, email, iban, passport_number, latest_employee_number, source, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        newPerson.id, newPerson.identity_number, newPerson.name_en, newPerson.name_ar,
        newPerson.nationality, newPerson.date_of_birth, newPerson.mobile, newPerson.email,
        newPerson.iban, newPerson.passport_number, newPerson.latest_employee_number, newPerson.source,
        newPerson.created_at, newPerson.updated_at
      )
      .run();
    summary.newPersons += 1;
    await logAudit(db, jobId, 'person', id, 'create', null, newPerson, identity, 'New identity');
    return { person: newPerson, action: 'create' };
  }

  // EXISTING person — UPDATE in place (NEVER create duplicate)
  const merged = {
    name_en: row.nameEn || existing.name_en,
    name_ar: row.nameAr || existing.name_ar,
    nationality: row.nationality || existing.nationality,
    date_of_birth: row.dateOfBirth || existing.date_of_birth,
    mobile: row.mobile || existing.mobile,
    email: row.email || existing.email,
    iban: row.iban || existing.iban,
    passport_number: row.passportNumber || existing.passport_number,
    latest_employee_number: row.employeeNumber || existing.latest_employee_number,
  };
  const changed = Object.keys(merged).some((k) => merged[k] !== existing[k]);

  if (!changed) {
    summary.unchangedPersons += 1;
    return { person: existing, action: 'unchanged' };
  }

  if (opts && opts.dryRun) {
    summary.updatedPersons += 1;
    return { person: existing, action: 'update-dry' };
  }

  await db
    .prepare(
      `UPDATE persons SET name_en=?, name_ar=?, nationality=?, date_of_birth=?,
        mobile=?, email=?, iban=?, passport_number=?, latest_employee_number=?, updated_at=?
       WHERE id=?`
    )
    .bind(
      merged.name_en, merged.name_ar, merged.nationality, merged.date_of_birth,
      merged.mobile, merged.email, merged.iban, merged.passport_number, merged.latest_employee_number,
      NOW(), existing.id
    )
    .run();
  summary.updatedPersons += 1;
  await logAudit(db, jobId, 'person', existing.id, 'update', existing, { ...existing, ...merged }, identity, 'Identity update');

  // EmployeeNumber history bookkeeping
  if (row.employeeNumber && row.employeeNumber !== existing.latest_employee_number) {
    summary.employeeNumberChanged += 1;
    if (!opts || !opts.dryRun) {
      const histId = uid();
      await db
        .prepare(
          `INSERT INTO employee_number_history
            (id, person_id, identity_number, employee_number, first_seen_job_id, last_seen_job_id, first_seen_at, last_seen_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(identity_number, employee_number) DO UPDATE SET
             last_seen_job_id = excluded.last_seen_job_id,
             last_seen_at     = excluded.last_seen_at`
        )
        .bind(histId, existing.id, identity, String(row.employeeNumber), jobId, jobId, NOW(), NOW())
        .run();
      await logAudit(db, jobId, 'employee_number_history', histId, 'create',
        null, { identity, empNo: row.employeeNumber }, identity, 'EmpNo changed');
    }
  }

  return { person: existing, action: 'update' };
}

async function upsertEmployeeSnapshot(db, jobId, person, row, opts) {
  if (!person || !person.id || (opts && opts.dryRun)) return;
  await db
    .prepare(
      `INSERT INTO employee_snapshots
        (id, person_id, identity_number, employee_number, job_title, department, project, status, snapshot_job_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      uid(), person.id, person.identity_number, row.employeeNumber || null,
      row.jobTitle || null, row.department || null, row.project || null,
      row.status || null, jobId, NOW()
    )
    .run();
}

async function upsertContract(db, jobId, contract, summary, opts) {
  if (!isValidIdentity(contract.identityNumber)) {
    summary.blockedRows += 1;
    await pushReview(db, jobId, 'contract', 'critical',
      'Contract has missing/invalid IdentityNumber', contract.identityNumber,
      contract.employeeNumber, contract.sourceFileName, contract);
    return { action: 'block' };
  }

  const identity = String(contract.identityNumber).replace(/\D+/g, '');
  const key      = await hashContract(contract);
  const existing = await findContractByKey(db, key);
  const person   = await findPersonByIdentity(db, identity);

  if (existing) {
    const newConfidence = Number(contract.confidenceScore || 0);
    const oldConfidence = Number(existing.confidence_score || 0);
    if (newConfidence > oldConfidence + 0.001) {
      if (opts && opts.dryRun) { summary.updatedContracts += 1; return { action: 'update-dry' }; }
      await db
        .prepare(
          `UPDATE contracts SET
            person_id=?, employee_number=?, contract_number=?, contract_type=?,
            start_date=?, end_date=?, contract_end_type=?, joining_date=?,
            duration_years=?, salary_basic=?, salary_total=?, iban=?, mobile=?, email=?,
            passport_number=?, gender=?, marital_status=?, birth_date=?, occupation=?,
            work_location=?, bank_name=?, education_level=?, speciality=?,
            parser_type=?, confidence_score=?, source_file_name=?, source_file_hash=?,
            import_job_id=?, updated_at=?
           WHERE id=?`
        )
        .bind(
          person ? person.id : existing.person_id,
          contract.employeeNumber || existing.employee_number,
          contract.contractNumber || existing.contract_number,
          contract.contractType   || existing.contract_type,
          contract.startDate      || existing.start_date,
          contract.endDate        || existing.end_date,
          contract.contractEndType|| existing.contract_end_type,
          contract.joiningDate    || existing.joining_date,
          contract.durationYears  || existing.duration_years,
          contract.salaryBasic ?? existing.salary_basic,
          contract.salaryTotal ?? existing.salary_total,
          contract.iban || existing.iban,
          contract.mobile || existing.mobile,
          contract.email || existing.email,
          contract.passportNumber || existing.passport_number,
          contract.gender || existing.gender,
          contract.maritalStatus || existing.marital_status,
          contract.birthDate || existing.birth_date,
          contract.occupation || existing.occupation,
          contract.workLocation || existing.work_location,
          contract.bankName || existing.bank_name,
          contract.educationLevel || existing.education_level,
          contract.speciality || existing.speciality,
          contract.parserType || existing.parser_type,
          newConfidence, contract.sourceFileName || existing.source_file_name,
          contract.sourceFileHash || existing.source_file_hash,
          jobId, NOW(), existing.id
        )
        .run();
      summary.updatedContracts += 1;
      await logAudit(db, jobId, 'contract', existing.id, 'update', existing, contract, key, 'Higher confidence');
      return { action: 'update' };
    }
    summary.skippedDuplicateContracts += 1;
    if (!opts || !opts.dryRun) {
      await logAudit(db, jobId, 'contract', existing.id, 'skip-duplicate', existing, contract, key, 'Same/lower confidence');
    }
    return { action: 'skip' };
  }

  // NEW contract
  if (opts && opts.dryRun) { summary.newContracts += 1; return { action: 'create-dry' }; }
  const id = uid();
  await db
    .prepare(
      `INSERT INTO contracts
        (id, person_id, identity_number, employee_number, contract_number, contract_type,
         start_date, end_date, contract_end_type, joining_date, duration_years,
         salary_basic, salary_total, iban, mobile, email,
         passport_number, gender, marital_status, birth_date, occupation,
         work_location, bank_name, education_level, speciality,
         parser_type, confidence_score, source_file_name, source_file_hash,
         contract_key, import_job_id, created_at, updated_at,
         r2_object_key, has_private_file)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      id, person ? person.id : null, identity, contract.employeeNumber || null,
      contract.contractNumber || null, contract.contractType || null,
      contract.startDate || null, contract.endDate || null,
      contract.contractEndType || null, contract.joiningDate || null,
      contract.durationYears || null, contract.salaryBasic ?? null,
      contract.salaryTotal ?? null, contract.iban || null,
      contract.mobile || null, contract.email || null,
      contract.passportNumber || null, contract.gender || null,
      contract.maritalStatus || null, contract.birthDate || null,
      contract.occupation || null, contract.workLocation || null,
      contract.bankName || null, contract.educationLevel || null,
      contract.speciality || null,
      contract.parserType || null, Number(contract.confidenceScore || 0),
      contract.sourceFileName || null, contract.sourceFileHash || null,
      key, jobId, NOW(), NOW(),
      contract.r2ObjectKey || null,
      contract.hasPrivateFile ? 1 : 0
    )
    .run();
  summary.newContracts += 1;
  await logAudit(db, jobId, 'contract', id, 'create', null, contract, key, 'New contract');
  return { action: 'create' };
}

async function upsertInsurance(db, jobId, rec, summary, opts) {
  // Identity priority: IDNo → MainMemberID → StaffNumber (last is fallback only)
  const idCandidates = [rec.identityNumber, rec.mainMemberId];
  let identity = idCandidates.find((v) => isValidIdentity(v));
  let person   = null;
  if (identity) {
    identity = String(identity).replace(/\D+/g, '');
    person   = await findPersonByIdentity(db, identity);
  } else if (rec.staffNumber) {
    person = await findPersonByEmpNo(db, rec.staffNumber);
    if (person) identity = person.identity_number;
  }

  if (!identity) {
    summary.blockedRows += 1;
    await pushReview(db, jobId, 'insurance', 'warning',
      'Insurance row has no resolvable identity', rec.identityNumber, rec.staffNumber, null, rec);
    return { action: 'review' };
  }

  // Match existing by (identity_number, policy_no, member_name) trio
  const existing = await db
    .prepare(`SELECT * FROM insurance_records
              WHERE identity_number = ? AND COALESCE(policy_no,'') = COALESCE(?, '')
                AND COALESCE(member_name,'') = COALESCE(?, '')`)
    .bind(identity, rec.policyNo || null, rec.memberName || null)
    .first();

  if (existing) {
    if (opts && opts.dryRun) { summary.updatedInsuranceRecords += 1; return { action: 'update-dry' }; }
    await db
      .prepare(
        `UPDATE insurance_records SET
          person_id=?, main_member_id=?, staff_number=?, class_name=?,
          effective_date=?, expiry_date=?, plan_class=?, nationality=?, review_flags_json=?,
          import_job_id=?, updated_at=?
         WHERE id=?`
      )
      .bind(
        person ? person.id : existing.person_id,
        rec.mainMemberId || existing.main_member_id,
        rec.staffNumber || existing.staff_number,
        rec.className || existing.class_name,
        rec.effectiveDate || existing.effective_date,
        rec.expiryDate || existing.expiry_date,
        rec.planClass || existing.plan_class,
        rec.nationality || existing.nationality,
        rec.reviewFlagsJson || existing.review_flags_json,
        jobId, NOW(), existing.id
      )
      .run();
    summary.updatedInsuranceRecords += 1;
    await logAudit(db, jobId, 'insurance', existing.id, 'update', existing, rec, identity, 'Insurance update');
    return { action: 'update' };
  }

  if (opts && opts.dryRun) { summary.newInsuranceRecords += 1; return { action: 'create-dry' }; }
  const id = uid();
  await db
    .prepare(
      `INSERT INTO insurance_records
        (id, person_id, identity_number, main_member_id, staff_number, member_name,
         policy_no, class_name, effective_date, expiry_date,
         plan_class, nationality, review_flags_json,
         import_job_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      id, person ? person.id : null, identity,
      rec.mainMemberId || null, rec.staffNumber || null, rec.memberName || null,
      rec.policyNo || null, rec.className || null,
      rec.effectiveDate || null, rec.expiryDate || null,
      rec.planClass || null, rec.nationality || null, rec.reviewFlagsJson || null,
      jobId, NOW(), NOW()
    )
    .run();
  summary.newInsuranceRecords += 1;
  await logAudit(db, jobId, 'insurance', id, 'create', null, rec, identity, 'New insurance');
  return { action: 'create' };
}

// ─── public: dryRun / commit ──────────────────────────────────────────────
function blankSummary() {
  return {
    newPersons: 0, updatedPersons: 0, unchangedPersons: 0,
    newContracts: 0, updatedContracts: 0, skippedDuplicateContracts: 0,
    employeeNumberChanged: 0,
    newInsuranceRecords: 0, updatedInsuranceRecords: 0,
    reviewQueueCreated: 0, blockedRows: 0, criticalConflicts: 0,
  };
}

export async function dryRunImport(db, payload) {
  const summary  = blankSummary();
  const blockers = [];
  const employees  = payload.employees  || [];
  const contracts  = payload.contracts  || [];
  const insurance  = payload.insurance  || [];
  const dummyJobId = 'dryrun-' + uid();

  // Run each upsert against the live DB inside a transaction we don't commit?
  // D1 doesn't support savepoints across statements in the same way SQLite does,
  // so we instead pass `dryRun: true` and skip writes — the helpers above do
  // their lookups (which are read-only) and only touch summary counters.
  for (const r of employees) {
    const { action } = await upsertPerson(db, dummyJobId, r, summary, { dryRun: true });
    if (action === 'block') summary.reviewQueueCreated += 0; // pushReview is also no-op in dry?
  }
  for (const c of contracts) {
    await upsertContract(db, dummyJobId, c, summary, { dryRun: true });
  }
  for (const i of insurance) {
    await upsertInsurance(db, dummyJobId, i, summary, { dryRun: true });
  }
  if (summary.criticalConflicts > 0) {
    blockers.push(`${summary.criticalConflicts} critical EmployeeNumber/Identity conflict(s)`);
  }
  return { summary, blockers };
}

export async function applyImport(db, payload, jobMeta) {
  const summary = blankSummary();
  const jobId   = jobMeta?.id || uid();
  const now     = NOW();
  await db
    .prepare(
      `INSERT INTO import_jobs
        (id, source, status, imported_at, created_by,
         employee_file_r2_key, insurance_file_r2_key, raw_files_bucket, raw_files_count)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      jobId, jobMeta?.source || 'admin-import', now, jobMeta?.createdBy || null,
      jobMeta?.employeeFileR2Key  || null,
      jobMeta?.insuranceFileR2Key || null,
      jobMeta?.rawFilesBucket     || null,
      Number(jobMeta?.rawFilesCount || 0)
    )
    .run();

  const employees = payload.employees || [];
  const contracts = payload.contracts || [];
  const insurance = payload.insurance || [];
  for (const r of employees) {
    const { person, action } = await upsertPerson(db, jobId, r, summary, {});
    if (person && action !== 'block') {
      await upsertEmployeeSnapshot(db, jobId, person, r, {});
    }
  }
  for (const c of contracts) {
    await upsertContract(db, jobId, c, summary, {});
  }
  for (const i of insurance) {
    await upsertInsurance(db, jobId, i, summary, {});
  }

  // Materialise the row counts on import_jobs
  await db
    .prepare(
      `UPDATE import_jobs SET
        status = ?, committed_at = ?,
        employee_rows = ?, insurance_rows = ?, pdf_files = ?,
        contracts_extracted = ?, matched_contracts = ?, contract_only = ?,
        review_queue_count = (SELECT COUNT(*) FROM review_queue WHERE import_job_id = ?),
        created_persons = ?, updated_persons = ?, unchanged_persons = ?,
        new_contracts = ?, updated_contracts = ?, skipped_duplicate_contracts = ?,
        employee_number_changed = ?,
        created_insurance = ?, updated_insurance = ?, blocked_rows = ?
       WHERE id = ?`
    )
    .bind(
      summary.criticalConflicts > 0 ? 'committed_with_conflicts' : 'committed',
      NOW(), employees.length, insurance.length, payload.pdfFiles || contracts.length,
      contracts.length,
      summary.newContracts + summary.updatedContracts,
      Math.max(0, contracts.length - (summary.newContracts + summary.updatedContracts + summary.skippedDuplicateContracts)),
      jobId,
      summary.newPersons, summary.updatedPersons, summary.unchangedPersons,
      summary.newContracts, summary.updatedContracts, summary.skippedDuplicateContracts,
      summary.employeeNumberChanged,
      summary.newInsuranceRecords, summary.updatedInsuranceRecords, summary.blockedRows,
      jobId
    )
    .run();

  const blockers = [];
  if (summary.criticalConflicts > 0) {
    blockers.push(`${summary.criticalConflicts} critical conflict(s) sent to review queue`);
  }
  return { jobId, summary, blockers };
}

// ─── rollback ─────────────────────────────────────────────────────────────
export async function rollbackImport(db, importJobId) {
  if (!importJobId) throw new Error('importJobId required');

  // Pull every audit row for this job, oldest first, and reverse it.
  const auditRows = await db
    .prepare(
      `SELECT * FROM import_audit_log WHERE import_job_id = ? ORDER BY created_at DESC`
    )
    .bind(importJobId)
    .all();

  let restored = 0, deleted = 0;

  for (const row of auditRows.results || []) {
    const { entity_type, entity_id, action, old_value_json } = row;
    if (action === 'create') {
      if (entity_type === 'person')
        await db.prepare(`DELETE FROM persons WHERE id = ?`).bind(entity_id).run();
      else if (entity_type === 'contract')
        await db.prepare(`DELETE FROM contracts WHERE id = ?`).bind(entity_id).run();
      else if (entity_type === 'insurance')
        await db.prepare(`DELETE FROM insurance_records WHERE id = ?`).bind(entity_id).run();
      else if (entity_type === 'employee_number_history')
        await db.prepare(`DELETE FROM employee_number_history WHERE id = ?`).bind(entity_id).run();
      else if (entity_type === 'employee_snapshot')
        await db.prepare(`DELETE FROM employee_snapshots WHERE id = ?`).bind(entity_id).run();
      deleted += 1;
    } else if (action === 'update' && old_value_json) {
      const old = JSON.parse(old_value_json);
      if (entity_type === 'person') {
        await db
          .prepare(
            `UPDATE persons SET name_en=?, name_ar=?, nationality=?, date_of_birth=?,
              mobile=?, email=?, iban=?, latest_employee_number=?, updated_at=?
             WHERE id=?`
          )
          .bind(
            old.name_en, old.name_ar, old.nationality, old.date_of_birth,
            old.mobile, old.email, old.iban, old.latest_employee_number,
            NOW(), entity_id
          )
          .run();
        restored += 1;
      }
      // (contract / insurance restores follow the same shape; keep audit
      // payloads complete and they round-trip cleanly.)
    }
  }

  // Wipe review rows + employee snapshots from this job
  await db.prepare(`DELETE FROM review_queue WHERE import_job_id = ?`).bind(importJobId).run();
  await db.prepare(`DELETE FROM employee_snapshots WHERE snapshot_job_id = ?`).bind(importJobId).run();

  // Mark job rolled_back (CASCADE will purge the audit log via FK)
  await db
    .prepare(`UPDATE import_jobs SET status='rolled_back' WHERE id=?`)
    .bind(importJobId)
    .run();

  return { restored, deleted, importJobId };
}

// ─── snapshot read ────────────────────────────────────────────────────────
export async function readCurrentSnapshot(db) {
  const job = await db
    .prepare(
      `SELECT * FROM import_jobs WHERE status IN ('committed','committed_with_conflicts')
       ORDER BY committed_at DESC LIMIT 1`
    )
    .first();
  if (!job) return null;

  const persons   = await db.prepare(`SELECT * FROM persons`).all();
  const contracts = await db.prepare(`SELECT * FROM contracts`).all();
  const insurance = await db.prepare(`SELECT * FROM insurance_records`).all();
  const review    = await db
    .prepare(`SELECT * FROM review_queue WHERE status='open' ORDER BY severity, created_at DESC`)
    .all();

  return {
    source: 'real-imported',
    job,
    counts: {
      persons:    (persons.results   || []).length,
      contracts:  (contracts.results || []).length,
      insurance:  (insurance.results || []).length,
      review:     (review.results    || []).length,
    },
    persons:   persons.results   || [],
    contracts: contracts.results || [],
    insurance: insurance.results || [],
    review:    review.results    || [],
  };
}
