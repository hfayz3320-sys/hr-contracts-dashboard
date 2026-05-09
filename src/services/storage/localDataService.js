import { cleanDataset } from '../../utils/cleaning';
import { APP_META_KEYS, STORE_NAMES } from '../../storage/indexedDb/dbSchema';
import { blobToDataUrl, dataUrlToBlob } from '../../storage/indexedDb/blobUtils';
import { bulkPutRecords, clearStore, getAllFromStore } from '../../storage/indexedDb/coreDb';
import { migrateLegacyLocalData } from '../../storage/migrations/legacyLocalMigration';
import { appMetaRepository } from '../../storage/repositories/appMetaRepository';
import { contractRepository, createContractRecord } from '../../storage/repositories/contractRepository';
import { employeeRepository, createEmployeeRecord } from '../../storage/repositories/employeeRepository';
import { importJobRepository } from '../../storage/repositories/importJobRepository';
import { insuranceRepository, createInsuranceRecord } from '../../storage/repositories/insuranceRepository';
import { pdfRepository } from '../../storage/repositories/pdfRepository';
import { reviewQueueRepository } from '../../storage/repositories/reviewQueueRepository';
import { applyInsuranceMatching } from '../insurance/insuranceMatchingService';
import { normalizeInsuranceRows } from '../insurance/insuranceNormalizer';
import { hashBlob } from '../../utils/hash';
import { readSpreadsheetFromUrl, SpreadsheetMissingError } from '../../utils/fileImport';
import {
  deduplicateEmployeeContractData,
  findEmployeeMasterMatch,
  mergeContractSnapshot,
  mergeEmployeeMasterRecord,
  resolveContractForEmployee,
} from '../employees/employeeMergeService';

const DEFAULT_SEED_VERSION = 'public-default-seed-v3';
// The real HR export is named "بيانات الموظفين.xlsx". The legacy naming
// (sample.xlsx) is kept as a fallback so older installs still work.
const DEFAULT_SAMPLE_URL_CANDIDATES = [
  '/data/' + encodeURIComponent('بيانات الموظفين.xlsx'),
  '/data/sample.xlsx',
];
const DEFAULT_INSURANCE_URL = '/data/popa.xlsx';
const DEFAULT_CONTRACTS_MANIFEST_URL = '/data/contracts-manifest.json';

let initializePromise = null;
let isInitialized = false;

function normalizeFileName(value) {
  return String(value || '')
    .split(/[\\/]/)
    .pop()
    .trim();
}

function createPdfAliasMap(pdfRecords) {
  const map = {};

  (pdfRecords || []).forEach((record) => {
    if (!(record.blob instanceof Blob)) {
      return;
    }

    const url = URL.createObjectURL(record.blob);
    const aliases = Array.from(
      new Set([
        record.id,
        record.fileName,
        ...(record.aliases || []),
        record.contractNumber,
        record.employeeNumber,
      ])
    )
      .map((alias) => String(alias || '').trim())
      .filter(Boolean);

    aliases.forEach((alias) => {
      map[alias] = url;
      map[alias.toLowerCase()] = url;
    });
  });

  return map;
}

function createPdfRecordLookup(pdfRecords) {
  const map = new Map();

  (pdfRecords || []).forEach((record) => {
    const aliases = Array.from(
      new Set([record.id, record.fileName, ...(record.aliases || []), record.contractNumber, record.employeeNumber])
    );
    aliases.forEach((alias) => {
      const key = String(alias || '').trim().toLowerCase();
      if (key) {
        map.set(key, record);
      }
    });
  });

  return map;
}

function createDatasetSummary(rows) {
  const { issues, summary } = cleanDataset(rows || []);
  return {
    issues,
    importSummary: summary,
  };
}

function normalizeManifestEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      fileName: String(entry?.fileName || '').trim(),
      path: String(entry?.path || '').trim(),
      label: String(entry?.label || '').trim(),
    }))
    .filter((entry) => entry.fileName && entry.path && entry.path.toLowerCase().endsWith('.pdf'));
}

function replaceRecordById(records, record) {
  const index = (records || []).findIndex((item) => item.id === record.id);
  if (index >= 0) {
    records[index] = record;
    return;
  }
  records.push(record);
}

async function persistEmployeeContractState(employees, contracts) {
  await clearStore(STORE_NAMES.EMPLOYEES);
  await clearStore(STORE_NAMES.CONTRACTS);
  await employeeRepository.bulkUpsert(employees);
  await contractRepository.bulkUpsert(contracts);
}

async function reconcileStoredEmployeeContracts() {
  const [employees, contracts] = await Promise.all([
    employeeRepository.listAll(),
    contractRepository.listAll(),
  ]);
  const reconciled = deduplicateEmployeeContractData(employees, contracts);

  if (reconciled.changed) {
    await persistEmployeeContractState(reconciled.employees, reconciled.contracts);
  }

  return reconciled;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  // SPA fallback guard: a missing /data/*.json gets index.html instead of JSON.
  const contentType = response.headers.get('content-type') || '';
  if (/text\/html|application\/xhtml/i.test(contentType)) {
    throw new Error(`${url} is missing (server returned HTML instead of JSON).`);
  }
  const text = await response.text();
  // Final guard: SheetJS-style HTML body without proper Content-Type.
  if (/^\s*<!doctype|^\s*<html/i.test(text)) {
    throw new Error(`${url} is missing (HTML body received).`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${url} is not valid JSON: ${err.message}`);
  }
}

async function fetchManifestPdfPayloads(entries, existingRecords) {
  const existingAliases = new Set();

  (existingRecords || []).forEach((record) => {
    [record.fileName, ...(record.aliases || [])].forEach((alias) => {
      const key = String(alias || '').trim().toLowerCase();
      if (key) {
        existingAliases.add(key);
      }
    });
  });

  const pendingEntries = (entries || []).filter((entry) => {
    const fileKey = entry.fileName.toLowerCase();
    const pathKey = entry.path.toLowerCase();
    return !existingAliases.has(fileKey) && !existingAliases.has(pathKey);
  });

  const payloads = [];

  for (let index = 0; index < pendingEntries.length; index += 8) {
    const batch = pendingEntries.slice(index, index + 8);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const response = await fetch(entry.path, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${entry.path}`);
        }

        const blob = await response.blob();
        return {
          fileName: entry.fileName,
          blob,
          aliases: [entry.fileName, entry.path, entry.label].filter(Boolean),
          sourceFileHash: await hashBlob(blob),
        };
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        payloads.push(result.value);
        return;
      }
      console.warn(result.reason);
    });
  }

  return payloads;
}

async function performDefaultSeed({ clearExisting = false } = {}) {
  if (clearExisting) {
    for (const storeName of Object.values(STORE_NAMES)) {
      await clearStore(storeName);
    }
  }

  // Defensive seed: each fetch is independent. A missing static file (e.g.
  // because we removed real-PII /data/sample.xlsx for security) must NOT
  // crash the dashboard — the legacy reseed degrades to empty stores and
  // returns warnings the UI can surface.
  const warnings = [];

  const safeFetchSpreadsheet = async (url, label) => {
    try {
      const { rows } = await readSpreadsheetFromUrl(url);
      return rows;
    } catch (err) {
      if (err instanceof SpreadsheetMissingError) {
        console.warn(`[reseed] ${label} not available:`, err.message);
        warnings.push({ file: url, label, reason: err.message, hint: err.hint });
      } else {
        console.warn(`[reseed] ${label} failed:`, err);
        warnings.push({ file: url, label, reason: err.message });
      }
      return [];
    }
  };

  // Try each candidate URL in order. First success wins. Each individual
  // miss is logged but the overall fetch only registers a warning when
  // every candidate failed.
  const safeFetchSpreadsheetCandidates = async (urls, label) => {
    let lastErr = null;
    for (const url of urls) {
      try {
        const { rows } = await readSpreadsheetFromUrl(url);
        if (rows && rows.length) return { rows, url };
        lastErr = new Error(`${url} returned 0 rows`);
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr instanceof SpreadsheetMissingError) {
      warnings.push({ file: urls.join(' | '), label, reason: lastErr.message, hint: lastErr.hint });
    } else if (lastErr) {
      warnings.push({ file: urls.join(' | '), label, reason: lastErr.message });
    }
    return { rows: [], url: null };
  };

  const safeFetchJson = async (url, label) => {
    try {
      return await fetchJson(url);
    } catch (err) {
      console.warn(`[reseed] ${label} not available:`, err.message);
      warnings.push({ file: url, label, reason: err.message });
      return null;
    }
  };

  const emResult         = await safeFetchSpreadsheetCandidates(
    DEFAULT_SAMPLE_URL_CANDIDATES,
    'Employee dataset (بيانات الموظفين.xlsx / sample.xlsx)'
  );
  const rawRows          = emResult.rows;
  const rawInsuranceRows = await safeFetchSpreadsheet(DEFAULT_INSURANCE_URL, 'Medical insurance dataset (popa.xlsx)');
  const manifest         = await safeFetchJson(DEFAULT_CONTRACTS_MANIFEST_URL, 'Contracts manifest');

  const { cleanedRows } = cleanDataset(rawRows);
  const manifestEntries = normalizeManifestEntries(manifest || []);

  let pdfPayloads = [];
  if (manifestEntries.length) {
    try {
      const existingPdfRecords = await pdfRepository.listAll();
      pdfPayloads = await fetchManifestPdfPayloads(manifestEntries, existingPdfRecords);
    } catch (err) {
      console.warn('[reseed] Contract PDF fetch failed:', err);
      warnings.push({
        file: 'contracts',
        label: 'Contract PDFs',
        reason: err.message || String(err),
      });
    }
  }

  if (pdfPayloads.length) {
    await pdfRepository.bulkSave(pdfPayloads);
  }

  const pdfLookup = createPdfRecordLookup(await pdfRepository.listAll());
  const { employees, contracts } = createEmployeeAndContractRecords(cleanedRows, {
    pdfLookup,
    replaceExisting: true,
  });
  const insuranceRecords = applyInsuranceMatching(
    normalizeInsuranceRows(rawInsuranceRows),
    employees
  );

  await persistEmployeeContractState(employees, contracts);
  await insuranceRepository.bulkSave(insuranceRecords);
  await appMetaRepository.setValue(APP_META_KEYS.DASHBOARD_SOURCE, 'sample.xlsx');
  await appMetaRepository.setValue(APP_META_KEYS.DEFAULT_SEED_VERSION, DEFAULT_SEED_VERSION);
  await appMetaRepository.setValue(APP_META_KEYS.DEFAULT_SEED_AT, new Date().toISOString());

  return {
    rows:           cleanedRows.length,
    insuranceRows:  insuranceRecords.length,
    pdfs:           manifestEntries.length,
    matchedPdfs:    pdfPayloads.length,
    warnings,
  };
}

async function ensureDefaultSeedIfNeeded() {
  const [employees, contracts] = await Promise.all([
    employeeRepository.listAll(),
    contractRepository.listAll(),
  ]);

  if (employees.length || contracts.length) {
    return {
      seeded: false,
    };
  }

  await performDefaultSeed();
  return {
    seeded: true,
  };
}

function createEmployeeAndContractRecords(rows, options = {}) {
  const pdfLookup = options.pdfLookup || new Map();
  const workingEmployees = options.replaceExisting ? [] : [...(options.existingEmployees || [])];
  const workingContracts = options.replaceExisting ? [] : [...(options.existingContracts || [])];

  (rows || []).forEach((row) => {
    const sourceFileKey = normalizeFileName(row.SourceFile).toLowerCase();
    const contractKey = String(row.ContractNumber || '').trim().toLowerCase();
    const employeeKey = String(row.EmployeeNumber || '').trim().toLowerCase();
    const directPdfId =
      row.contractPdfId ||
      pdfLookup.get(sourceFileKey)?.id ||
      pdfLookup.get(contractKey)?.id ||
      pdfLookup.get(employeeKey)?.id ||
      null;

    const employeeMatch = findEmployeeMasterMatch(row, workingEmployees);
    const matchedEmployee = employeeMatch.employee;
    const employeeId = matchedEmployee?.id || row.id || crypto.randomUUID();
    const existingContract = resolveContractForEmployee(row, matchedEmployee, workingContracts);
    const contractId = row.contractId || existingContract?.id || crypto.randomUUID();
    const importJobId = options.importJobId || row.importJobId || matchedEmployee?.importJobId || null;
    const mergedEmployeeData = mergeEmployeeMasterRecord(matchedEmployee || {}, row, {
      id: employeeId,
      contractId,
      contractPdfId: directPdfId || matchedEmployee?.contractPdfId || null,
      importJobId,
      ContractVersion:
        row.ContractVersion || existingContract?.ContractVersion || matchedEmployee?.ContractVersion,
      IsCurrentVersion:
        row.IsCurrentVersion ??
        existingContract?.IsCurrentVersion ??
        matchedEmployee?.IsCurrentVersion ??
        true,
      ContractGroupKey:
        row.ContractGroupKey || existingContract?.ContractGroupKey || matchedEmployee?.ContractGroupKey || '',
      ParentContractKey:
        row.ParentContractKey || existingContract?.ParentContractKey || matchedEmployee?.ParentContractKey || '',
      SourceFileHash:
        row.SourceFileHash || existingContract?.SourceFileHash || matchedEmployee?.SourceFileHash || '',
    });

    const employeeRecord = createEmployeeRecord(mergedEmployeeData, {
      id: employeeId,
      contractId,
      contractPdfId: directPdfId || mergedEmployeeData.contractPdfId || null,
      importJobId,
      ContractVersion: mergedEmployeeData.ContractVersion,
      IsCurrentVersion: mergedEmployeeData.IsCurrentVersion,
      ContractGroupKey: mergedEmployeeData.ContractGroupKey,
      ParentContractKey: mergedEmployeeData.ParentContractKey,
      SourceFileHash: mergedEmployeeData.SourceFileHash,
    });

    const contractSource = mergeContractSnapshot(
      existingContract || {},
      mergeEmployeeMasterRecord(matchedEmployee || {}, row),
      {
        id: contractId,
        employeeId,
        pdfFileId: directPdfId || existingContract?.pdfFileId || null,
        importStatus:
          options.importStatus ||
          row.importStatus ||
          existingContract?.importStatus,
        sourceFileName:
          row.SourceFile ||
          existingContract?.sourceFileName ||
          matchedEmployee?.SourceFile ||
          '',
        ContractVersion:
          row.ContractVersion || existingContract?.ContractVersion || employeeRecord.ContractVersion,
        IsCurrentVersion:
          row.IsCurrentVersion ??
          existingContract?.IsCurrentVersion ??
          employeeRecord.IsCurrentVersion,
        ContractGroupKey:
          row.ContractGroupKey || existingContract?.ContractGroupKey || employeeRecord.ContractGroupKey,
        ParentContractKey:
          row.ParentContractKey || existingContract?.ParentContractKey || employeeRecord.ParentContractKey,
        SourceFileHash:
          row.SourceFileHash || existingContract?.SourceFileHash || employeeRecord.SourceFileHash || '',
      }
    );

    const contractRecord = createContractRecord(contractSource, {
      id: contractId,
      employeeId,
      pdfFileId: contractSource.pdfFileId,
      importStatus: contractSource.importStatus,
      sourceFileName: contractSource.sourceFileName,
      ContractVersion: contractSource.ContractVersion,
      IsCurrentVersion: contractSource.IsCurrentVersion,
      ContractGroupKey: contractSource.ContractGroupKey,
      ParentContractKey: contractSource.ParentContractKey,
      SourceFileHash: contractSource.SourceFileHash,
    });

    replaceRecordById(workingEmployees, employeeRecord);
    replaceRecordById(workingContracts, contractRecord);
  });

  return deduplicateEmployeeContractData(workingEmployees, workingContracts);
}

async function exportStoreWithBlobEncoding(storeName) {
  const records = await getAllFromStore(storeName);
  if (storeName !== STORE_NAMES.PDF_FILES) {
    return records;
  }

  return Promise.all(
    (records || []).map(async (record) => ({
      ...record,
      blob: record.blob instanceof Blob ? await blobToDataUrl(record.blob) : null,
    }))
  );
}

export const localDataService = {
  async initialize() {
    if (isInitialized) {
      return;
    }

    if (!initializePromise) {
      initializePromise = (async () => {
        await migrateLegacyLocalData();
        await ensureDefaultSeedIfNeeded();
        await reconcileStoredEmployeeContracts();
        isInitialized = true;
      })().finally(() => {
        initializePromise = null;
      });
    }

    return initializePromise;
  },

  async loadDashboardData() {
    await this.initialize();

    const [rows, pdfRecords, sourceName] = await Promise.all([
      employeeRepository.listAll(),
      pdfRepository.listAll(),
      appMetaRepository.getValue(APP_META_KEYS.DASHBOARD_SOURCE),
    ]);

    const { issues, importSummary } = createDatasetSummary(rows);

    return {
      rows,
      issues,
      importSummary,
      sourceName: sourceName || 'Local IndexedDB',
      pdfMap: createPdfAliasMap(pdfRecords),
    };
  },

  async listEmployees() {
    await this.initialize();
    return employeeRepository.listAll();
  },

  async listContracts() {
    await this.initialize();
    return contractRepository.listAll();
  },

  async saveEmployees(employees) {
    await this.initialize();
    return employeeRepository.bulkUpsert(employees);
  },

  async saveContracts(contracts) {
    await this.initialize();
    return contractRepository.bulkUpsert(contracts);
  },

  async saveEmployee(employee) {
    await this.initialize();
    const [existingEmployees, existingContracts] = await Promise.all([
      employeeRepository.listAll(),
      contractRepository.listAll(),
    ]);
    const { employees, contracts } = createEmployeeAndContractRecords([employee], {
      existingEmployees,
      existingContracts,
      importStatus: employee.importStatus,
    });

    await persistEmployeeContractState(employees, contracts);
    return (
      employees.find((record) => record.id === employee.id) ||
      findEmployeeMasterMatch(employee, employees).employee ||
      employees[employees.length - 1]
    );
  },

  async deleteEmployee(employeeId, contractId) {
    await employeeRepository.deleteById(employeeId);
    if (contractId) {
      await contractRepository.deleteById(contractId);
    }
  },

  async storeImportedRows(rows, options = {}) {
    await this.initialize();
    const [pdfRecords, existingEmployees, existingContracts] = await Promise.all([
      pdfRepository.listAll(),
      options.replaceExisting ? Promise.resolve([]) : employeeRepository.listAll(),
      options.replaceExisting ? Promise.resolve([]) : contractRepository.listAll(),
    ]);
    const pdfLookup = createPdfRecordLookup(pdfRecords);
    const { employees, contracts } = createEmployeeAndContractRecords(rows, {
      importJobId: options.importJobId,
      importStatus: options.importStatus,
      pdfLookup,
      existingEmployees,
      existingContracts,
      replaceExisting: options.replaceExisting,
    });

    await persistEmployeeContractState(employees, contracts);

    if (options.sourceName) {
      await appMetaRepository.setValue(APP_META_KEYS.DASHBOARD_SOURCE, options.sourceName);
    }

    return {
      employees,
      contracts,
    };
  },

  async storePdfFiles(files, options = {}) {
    await this.initialize();
    const payloads = await Promise.all(
      (files || []).map(async (file) => ({
        fileName: file.fileName || file.name,
        blob: file.blob,
        aliases: file.aliases,
        employeeNumber: file.employeeNumber,
        contractNumber: file.contractNumber,
        sourceFileHash: file.sourceFileHash || (await hashBlob(file.blob)),
        importJobId: options.importJobId || file.importJobId || null,
      }))
    );

    return pdfRepository.bulkSave(payloads);
  },

  async listPdfRecords() {
    await this.initialize();
    return pdfRepository.listAll();
  },

  async getPdfUrlMap() {
    await this.initialize();
    const records = await pdfRepository.listAll();
    return createPdfAliasMap(records);
  },

  async saveImportJob(job) {
    await this.initialize();
    return importJobRepository.save(job);
  },

  async saveReviewItems(items) {
    await this.initialize();
    return reviewQueueRepository.bulkSave(items);
  },

  async listReviewItems() {
    await this.initialize();
    return reviewQueueRepository.listAll();
  },

  async saveInsuranceRecords(records) {
    await this.initialize();
    const normalized = (records || []).map((record) => createInsuranceRecord(record));
    return insuranceRepository.bulkSave(normalized);
  },

  async listInsuranceRecords() {
    await this.initialize();
    return insuranceRepository.listAll();
  },

  async exportFullLocalData() {
    await this.initialize();
    const stores = await Promise.all(
      Object.values(STORE_NAMES).map(async (storeName) => [storeName, await exportStoreWithBlobEncoding(storeName)])
    );

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      stores: Object.fromEntries(stores),
    };
    await appMetaRepository.setValue(APP_META_KEYS.LAST_BACKUP_AT, backup.exportedAt);
    return backup;
  },

  async importFullLocalData(backup) {
    if (!backup?.stores || typeof backup.stores !== 'object') {
      throw new Error('Invalid backup file.');
    }

    await this.clearAllLocalData();

    for (const storeName of Object.values(STORE_NAMES)) {
      const records = Array.isArray(backup.stores[storeName]) ? backup.stores[storeName] : [];
      if (storeName === STORE_NAMES.PDF_FILES) {
        const hydrated = records.map((record) => ({
          ...record,
          blob: record.blob ? dataUrlToBlob(record.blob) : null,
        }));
        await bulkPutRecords(storeName, hydrated);
      } else {
        await bulkPutRecords(storeName, records);
      }
    }
    isInitialized = true;
  },

  async clearAllLocalData() {
    for (const storeName of Object.values(STORE_NAMES)) {
      await clearStore(storeName);
    }
    isInitialized = false;
  },

  async reseedDefaultData() {
    await performDefaultSeed({ clearExisting: true });
    isInitialized = true;
  },
};
