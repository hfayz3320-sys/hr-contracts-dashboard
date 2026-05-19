/**
 * Maps a parsed contract extraction to the import dry-run / commit row shape.
 * Single source so ImportWizard and tests cannot drift.
 */
import type { ContractExtraction } from './adapter-types';

export function contractImportRowFromExtraction(c: ContractExtraction): Record<string, unknown> {
  const otherAllowances =
    c.otherCashAllowances != null && c.otherCashAllowances > 0
      ? [{ code: 'PAY_OTHER', name: 'Other cash allowances', amount: c.otherCashAllowances }]
      : undefined;

  return {
    identityNumber: c.identityNumber,
    fullName: c.fullName,
    nationality: c.nationality,
    passportNumber: c.passportNumber,
    gender: c.gender,
    maritalStatus: c.maritalStatus,
    birthDate: c.birthDate,
    educationLevel: c.educationLevel,
    speciality: c.speciality,
    mobile: c.mobile,
    email: c.email,
    occupation: c.occupation,
    jobTitle: c.jobTitle,
    workLocation: c.workLocation,
    contractNumber: c.contractNumber,
    contractType: c.contractType ?? 'Fixed-term',
    executionDate: c.executionDate,
    startDate: c.startDate,
    endDate: c.endDate,
    basicSalary: c.basicSalary,
    housingAllowance: c.housingAllowance,
    transportAllowance: c.transportAllowance,
    otherCashAllowances: c.otherCashAllowances,
    otherAllowances,
    totalSalary: c.totalSalary,
    bankName: c.bankName,
    iban: c.iban,
    fileHash: c.fileHash,
    filename: c.filename,
    sourceFile: c.sourceFile ?? c.filename,
    templateType: c.templateType,
    extractionConfidence: c.extractionConfidence,
    warnings: c.warnings,
    rawTextSnippet: c.rawTextSnippet,
    missingFields: c.missingFields,
  };
}
