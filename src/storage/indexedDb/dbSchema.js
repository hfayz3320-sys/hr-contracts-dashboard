export const LOCAL_DB_NAME = 'hr-contracts-dashboard-local-db';
export const LOCAL_DB_VERSION = 3;

export const STORE_NAMES = {
  // Legacy v1/v2 stores (kept untouched for the current dashboard)
  EMPLOYEES: 'employees',
  CONTRACTS: 'contracts',
  INSURANCE: 'insuranceRecords',
  IMPORT_JOBS: 'importJobs',
  REVIEW_QUEUE: 'reviewQueue',
  PDF_FILES: 'pdfFiles',
  APP_META: 'appMeta',
  IMPORT_AUDIT_LOG: 'importAuditLog',
  // v3: identity-centric model (Phase 1 — additive only)
  PERSONS: 'persons',
  EMPLOYEE_MASTER_SNAPSHOTS: 'employeeMasterSnapshots',
  CONTRACT_RECORDS: 'contractRecords',
  EMPLOYEE_NUMBER_HISTORY: 'employeeNumberHistory',
};

export const APP_META_KEYS = {
  DASHBOARD_SOURCE: 'dashboardSource',
  LEGACY_MIGRATION_V1: 'legacyMigrationV1',
  LAST_BACKUP_AT: 'lastBackupAt',
  DEFAULT_SEED_VERSION: 'defaultSeedVersion',
  DEFAULT_SEED_AT: 'defaultSeedAt',
};

export const IMPORT_STATUSES = {
  DRAFT_EXTRACTED: 'Draft Extracted',
  NEEDS_REVIEW: 'Needs Review',
  READY: 'Ready',
  CONFIRMED_IMPORTED: 'Confirmed Imported',
  UNSUPPORTED_SCAN_PDF: 'Unsupported Scan PDF',
  SKIPPED: 'Skipped',
};

export const MATCH_STATUSES = {
  MATCHED: 'Matched',
  UNMATCHED: 'Unmatched',
  NEEDS_REVIEW: 'Needs Review',
  DUPLICATE_MATCH_RISK: 'Duplicate Match Risk',
};

export const REVIEW_STATUSES = {
  OPEN: 'Open',
  REVIEWED: 'Reviewed',
  CONFIRMED: 'Confirmed',
  SKIPPED: 'Skipped',
};

export const EMPLOYMENT_STATUSES = ['Active', 'Inactive', 'Terminated'];

export function upgradeLocalDb(db) {
  if (!db.objectStoreNames.contains(STORE_NAMES.EMPLOYEES)) {
    const store = db.createObjectStore(STORE_NAMES.EMPLOYEES, { keyPath: 'id' });
    store.createIndex('byEmployeeNumber', 'EmployeeNumber', { unique: false });
    store.createIndex('byContractNumber', 'ContractNumber', { unique: false });
    store.createIndex('byIdentityNumber', 'IdentityNumber', { unique: false });
    store.createIndex('byName', 'Name', { unique: false });
    store.createIndex('byProfession', 'Profession', { unique: false });
    store.createIndex('byNationality', 'Nationality', { unique: false });
    store.createIndex('byEmploymentStatus', 'EmploymentStatus', { unique: false });
    store.createIndex('byEndDate', 'EndDate', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.CONTRACTS)) {
    const store = db.createObjectStore(STORE_NAMES.CONTRACTS, { keyPath: 'id' });
    store.createIndex('byContractNumber', 'ContractNumber', { unique: false });
    store.createIndex('byEmployeeNumber', 'EmployeeNumber', { unique: false });
    store.createIndex('byEmployeeId', 'employeeId', { unique: false });
    store.createIndex('byImportStatus', 'importStatus', { unique: false });
    store.createIndex('byEndDate', 'EndDate', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.INSURANCE)) {
    const store = db.createObjectStore(STORE_NAMES.INSURANCE, { keyPath: 'id' });
    store.createIndex('byStaffNumber', 'StaffNumber', { unique: false });
    store.createIndex('byIdNo', 'IDNo', { unique: false });
    store.createIndex('byMemberName', 'MemberName', { unique: false });
    store.createIndex('byRelationship', 'Relationship', { unique: false });
    store.createIndex('byMainMemberID', 'MainMemberID', { unique: false });
    store.createIndex('byMainMembershipNo', 'MainMembershipNo', { unique: false });
    store.createIndex('byClassDescription', 'ClassDescription', { unique: false });
    store.createIndex('byMatchStatus', 'matchStatus', { unique: false });
    store.createIndex('byMemberEffectiveDate', 'MemberEffectiveDate', { unique: false });
    store.createIndex('byPolicyStatus', 'CCHIPolicyStatus', { unique: false });
    store.createIndex('byMemberStatus', 'MemberCCHIStatus', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.IMPORT_JOBS)) {
    const store = db.createObjectStore(STORE_NAMES.IMPORT_JOBS, { keyPath: 'id' });
    store.createIndex('byType', 'type', { unique: false });
    store.createIndex('byStatus', 'status', { unique: false });
    store.createIndex('byCreatedAt', 'createdAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.REVIEW_QUEUE)) {
    const store = db.createObjectStore(STORE_NAMES.REVIEW_QUEUE, { keyPath: 'id' });
    store.createIndex('byType', 'type', { unique: false });
    store.createIndex('byStatus', 'status', { unique: false });
    store.createIndex('byImportJobId', 'importJobId', { unique: false });
    store.createIndex('byEntityId', 'entityId', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.PDF_FILES)) {
    const store = db.createObjectStore(STORE_NAMES.PDF_FILES, { keyPath: 'id' });
    store.createIndex('byFileName', 'fileName', { unique: false });
    store.createIndex('byEmployeeNumber', 'employeeNumber', { unique: false });
    store.createIndex('byContractNumber', 'contractNumber', { unique: false });
    store.createIndex('byImportJobId', 'importJobId', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.APP_META)) {
    db.createObjectStore(STORE_NAMES.APP_META, { keyPath: 'key' });
  }

  // v2: field-level change audit log for Employee Master imports.
  // Each entry records one field change: who changed what, from what, to what, when.
  if (!db.objectStoreNames.contains(STORE_NAMES.IMPORT_AUDIT_LOG)) {
    const store = db.createObjectStore(STORE_NAMES.IMPORT_AUDIT_LOG, { keyPath: 'id' });
    store.createIndex('byImportJobId', 'importJobId', { unique: false });
    store.createIndex('byEmployeeId', 'employeeId', { unique: false });
    store.createIndex('byIdentityNumber', 'identityNumber', { unique: false });
    store.createIndex('byImportTimestamp', 'importTimestamp', { unique: false });
    store.createIndex('byField', 'field', { unique: false });
  }

  // v3: identity-centric model — Person registry, EM snapshots, contract records,
  // EmpNo history. Phase 1 stores; UI is gated behind a feature flag until Phase 2.

  // Person — keyed by IdentityNumber (natural key). 1:1 with EmployeeMasterSnapshot.
  if (!db.objectStoreNames.contains(STORE_NAMES.PERSONS)) {
    const store = db.createObjectStore(STORE_NAMES.PERSONS, { keyPath: 'identityNumber' });
    store.createIndex('byIdType', 'idType', { unique: false });
    store.createIndex('byNationality', 'nationality', { unique: false });
    store.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
  }

  // EmployeeMasterSnapshot — also keyed by IdentityNumber (1:1 with Person).
  // Replaced (not appended) on every Excel re-import.
  if (!db.objectStoreNames.contains(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS)) {
    const store = db.createObjectStore(STORE_NAMES.EMPLOYEE_MASTER_SNAPSHOTS, {
      keyPath: 'identityNumber',
    });
    store.createIndex('byEmployeeNumber', 'employeeNumber', { unique: false });
    store.createIndex('byImportJobId', 'importJobId', { unique: false });
    store.createIndex('byImportDate', 'importDate', { unique: false });
    store.createIndex('byLocation', 'location', { unique: false });
  }

  // ContractRecord — 1:N with Person (a person can have many contracts over time).
  if (!db.objectStoreNames.contains(STORE_NAMES.CONTRACT_RECORDS)) {
    const store = db.createObjectStore(STORE_NAMES.CONTRACT_RECORDS, { keyPath: 'id' });
    store.createIndex('byIdentityNumber', 'identityNumber', { unique: false });
    store.createIndex('byContractNumber', 'contractNumber', { unique: false });
    store.createIndex('byEmployeeNumber', 'employeeNumber', { unique: false });
    store.createIndex('byImportJobId', 'importJobId', { unique: false });
    store.createIndex('bySourcePdf', 'sourcePdf', { unique: false });
    store.createIndex('byContractEndType', 'contractEndType', { unique: false });
    store.createIndex('byStartDate', 'startDate', { unique: false });
    store.createIndex('byEndDate', 'endDate', { unique: false });
  }

  // EmployeeNumberHistory — append-only log of every EmpNo ever observed for a person.
  if (!db.objectStoreNames.contains(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY)) {
    const store = db.createObjectStore(STORE_NAMES.EMPLOYEE_NUMBER_HISTORY, { keyPath: 'id' });
    store.createIndex('byIdentityNumber', 'identityNumber', { unique: false });
    store.createIndex('byEmployeeNumber', 'employeeNumber', { unique: false });
    store.createIndex('bySourceType', 'sourceType', { unique: false });
    store.createIndex('byContractNumber', 'contractNumber', { unique: false });
    store.createIndex('byStatus', 'status', { unique: false });
    store.createIndex('byFirstSeenDate', 'firstSeenDate', { unique: false });
  }
}

// v3: review item types and priorities used by the new identity-centric import flow.
// Kept in dbSchema.js so they can be imported without circular deps.
export const V3_REVIEW_TYPES = {
  MISSING_IDENTITY:    'MissingIdentity',
  INVALID_IDENTITY:    'InvalidIdentity',
  AMBIGUOUS_MATCH:     'AmbiguousMatch',
  SALARY_CONFLICT:     'SalaryConflict',
  DATE_CONFLICT:       'DateConflict',
  OPEN_ENDED_CONFLICT: 'OpenEndedConflict',
  CONTRACT_NO_PERSON:  'ContractNoPerson',
  EM_NO_CONTRACT:      'EmployeeNoContract',
};

export const V3_PRIORITIES = {
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  LOW:      'LOW',
};

export const V3_IMPORT_SOURCE_TYPES = {
  EMPLOYEE_MASTER_EXCEL: 'EmployeeMasterExcel',
  CONTRACT_PDF:          'ContractPDF',
};

export const V3_IMPORT_JOB_STATUS = {
  IN_PROGRESS: 'in-progress',
  COMPLETED:   'completed',
  FAILED:      'failed',
};

export const V3_HISTORY_STATUS = {
  ACTIVE:     'Active',
  HISTORICAL: 'Historical',
  UNKNOWN:    'Unknown',
};

export const V3_HISTORY_NOTES = {
  RENEWAL:             'Possible Renewal',
  REHIRE:              'Possible Rehire',
  CYCLE:               'New Contract Cycle',
  SECONDARY_CHANGED:   'Secondary identifier changed',
};
