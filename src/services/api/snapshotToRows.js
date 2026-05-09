// -*- coding: utf-8 -*-
/**
 * src/services/api/snapshotToRows.js
 *
 * Converts a `/api/hr/current-snapshot` payload into the shape the existing
 * HRDashboardLayout memos consume:
 *
 *   - rows[]     — flat employee rows in the cleanedRows / expectedSchema shape
 *   - issues[]   — empty for D1-imported data (data-quality is recomputed
 *                  client-side by cleanDataset; we don't re-run that here)
 *   - summary    — minimal {rowCount, columnCount}
 *   - pdfMap     — { contractNumber → sourceFileName }
 *   - insurance  — pass-through with shape camel→Pascal for the insurance page
 *   - reviewItems — review_queue rows in the dashboard's REVIEW_STATUSES shape
 *
 * Joins each person with:
 *   * the most-recent employee_snapshot (job_title, department, status)
 *   * the most-recent contract           (start/end/salary/IBAN/contract no)
 *
 * Identity-centric: every join key is `identity_number`.
 */

function pickLatest(items, key = 'created_at') {
  if (!items || items.length === 0) return null;
  return [...items].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')))[0];
}

/**
 * @param {object} snapshot — output of GET /api/hr/current-snapshot
 * @returns {{ rows, issues, summary, pdfMap, insurance, reviewItems, source }}
 */
export function snapshotToRows(snapshot) {
  if (!snapshot || snapshot.source !== 'real-imported') {
    return { rows: [], issues: [], summary: { rowCount: 0, columnCount: 0 }, pdfMap: {}, insurance: [], reviewItems: [], source: '' };
  }

  const persons    = snapshot.persons    || [];
  const contracts  = snapshot.contracts  || [];
  const insurance  = snapshot.insurance  || [];
  const review     = snapshot.review     || [];

  // Group contracts by identity for fast latest-contract lookup
  const contractsByIdentity = new Map();
  for (const c of contracts) {
    const key = c.identity_number;
    if (!key) continue;
    if (!contractsByIdentity.has(key)) contractsByIdentity.set(key, []);
    contractsByIdentity.get(key).push(c);
  }

  const pdfMap = {};
  const rows = persons.map((p) => {
    const personContracts = contractsByIdentity.get(p.identity_number) || [];
    const latestContract  = pickLatest(personContracts, 'updated_at');

    if (latestContract && latestContract.contract_number && latestContract.source_file_name) {
      pdfMap[latestContract.contract_number] = latestContract.source_file_name;
    }

    return {
      // Top-level identifiers — match expectedSchema casing
      SourceFile:       latestContract?.source_file_name || '',
      ContractNumber:   latestContract?.contract_number  || '',
      Name:             p.name_en || p.name_ar || '',
      Profession:       latestContract?.contract_type    || '',  // best-effort
      EmployeeNumber:   p.latest_employee_number || latestContract?.employee_number || '',
      Nationality:      p.nationality || '',
      DateOfBirth:      p.date_of_birth || '',
      IdentityNumber:   p.identity_number,
      IDType:           '',
      IDExpiryDate:     '',
      Gender:           '',
      Religion:         '',
      MaritalStatus:    '',
      Education:        '',
      Speciality:       '',
      IBAN:             p.iban || latestContract?.iban || '',
      BankName:         '',
      Email:            p.email || latestContract?.email || '',
      MobileNumber:     p.mobile || latestContract?.mobile || '',
      ContractDurationYears: latestContract?.duration_years || '',
      StartDate:        latestContract?.start_date || '',
      EndDate:          latestContract?.contract_end_type === 'OPEN_ENDED' ? '' : (latestContract?.end_date || ''),
      JoiningDate:      latestContract?.joining_date || '',
      BasicSalary:      Number(latestContract?.salary_basic || 0),
      HousingProvided:  false,
      TransportProvided: false,
      HousingAllowance: 0,
      TransportationAllowance: 0,
      FoodAllowance: 0,
      OTAllowance: 0,
      MastersDegreeAllowance: 0,
      TotalCashAllowances: 0,
      GrossCashMonthly: Number(latestContract?.salary_total || 0),

      // Extra non-schema fields the dashboard happens to look at
      ContractEndType: latestContract?.contract_end_type || '',
      personId:        p.id,
      contractId:      latestContract?.id || null,
      hasPrivateFile:  Boolean(latestContract?.has_private_file),
      sourceFileName:  latestContract?.source_file_name || '',
    };
  });

  // Insurance shape: dashboard's MedicalInsurancePage expects PascalCase fields
  const insuranceRows = insurance.map((i) => ({
    StaffNumber:       i.staff_number || '',
    MainMemberID:      i.main_member_id || '',
    IDNo:              i.identity_number || '',
    MemberName:        i.member_name || '',
    PolicyNo:          i.policy_no || '',
    ClassDescription:  i.class_name || '',
    EffectiveDate:     i.effective_date || '',
    ExpiryDate:        i.expiry_date || '',
    matchStatus:       i.person_id ? 'MATCHED' : 'UNMATCHED',
    importJobId:       i.import_job_id || '',
  }));

  // Review queue → dashboard's REVIEW_STATUSES shape
  const reviewItems = review.map((r) => ({
    id:               r.id,
    status:           r.status === 'open' ? 'PENDING' : (r.status || 'PENDING').toUpperCase(),
    severity:         (r.severity || '').toUpperCase(),
    reason:           r.reason || '',
    identityNumber:   r.identity_number || '',
    employeeNumber:   r.employee_number || '',
    sourceFileName:   r.source_file_name || '',
    payload:          (() => { try { return JSON.parse(r.payload_json || 'null'); } catch { return null; } })(),
    importJobId:      r.import_job_id || '',
    createdAt:        r.created_at || '',
  }));

  return {
    rows,
    issues:   [],
    summary:  {
      rowCount:    rows.length,
      columnCount: 33,
      totalMissingValues: 0,
      criticalCount: 0,
      warningCount: 0,
      topIssues: [],
    },
    pdfMap,
    insurance: insuranceRows,
    reviewItems,
    source:   snapshot.job?.committed_at
      ? `Real Imported Data (${new Date(snapshot.job.committed_at).toLocaleDateString()})`
      : 'Real Imported Data',
  };
}
