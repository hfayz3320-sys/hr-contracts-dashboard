import { readSpreadsheetArrayBuffer, readSpreadsheetFile } from '../../utils/fileImport';
import { localDataService } from '../storage/localDataService';
import { normalizeInsuranceRows } from './insuranceNormalizer';
import { applyInsuranceMatching } from './insuranceMatchingService';

async function readFile(file) {
  return readSpreadsheetFile(file);
}

async function readUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const buffer = await response.arrayBuffer();
  return readSpreadsheetArrayBuffer(buffer);
}

export const insuranceImportService = {
  async importFiles(files, employees) {
    const list = Array.from(files || []);
    const importedRecords = [];

    for (const file of list) {
      const { rows } = await readFile(file);
      importedRecords.push(...normalizeInsuranceRows(rows));
    }

    const matchedRecords = applyInsuranceMatching(importedRecords, employees);
    await localDataService.saveInsuranceRecords(matchedRecords);
    return matchedRecords;
  },

  async importPublicSample(url, employees) {
    const { rows } = await readUrl(url);
    const matchedRecords = applyInsuranceMatching(normalizeInsuranceRows(rows), employees);
    await localDataService.saveInsuranceRecords(matchedRecords);
    return matchedRecords;
  },
};
