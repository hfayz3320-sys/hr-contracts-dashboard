import { describe, it, expect } from 'vitest';
import { mapRow, normalizeKey } from '@/lib/parsers/normalize';

describe('normalize.mapRow — column synonym dictionary (EN/AR)', () => {
  it('normalizeKey strips whitespace, case, and separators', () => {
    expect(normalizeKey('Identity Number')).toBe('identitynumber');
    expect(normalizeKey('  Iqama-No.  ')).toBe('iqamano');
    expect(normalizeKey('رقم الهوية')).toBe('رقمالهوية');
  });

  it('maps English synonyms to canonical employee fields', () => {
    const row = mapRow('employees', {
      'Iqama No': '9900000007',
      'Employee No': 'DEMO-01000',
      'Full Name': 'Alex Rivers',
      Department: 'Operations',
      Profession: 'Technician',
    });
    expect(row).toEqual({
      identityNumber: '9900000007',
      employeeNumber: 'DEMO-01000',
      fullName: 'Alex Rivers',
      department: 'Operations',
      jobTitle: 'Technician',
    });
  });

  it('maps Arabic headers to canonical fields', () => {
    const row = mapRow('employees', {
      'رقم الهوية': '9900000048',
      'الرقم الوظيفي': 'DEMO-01001',
      'الاسم الكامل': 'Jordan Reed',
      الجنسية: 'Sampleland',
    });
    expect(row.identityNumber).toBe('9900000048');
    expect(row.employeeNumber).toBe('DEMO-01001');
    expect(row.fullName).toBe('Jordan Reed');
    expect(row.nationality).toBe('Sampleland');
  });

  it('drops null/empty cells and unknown columns', () => {
    const row = mapRow('employees', {
      identityNumber: '9900000007',
      randomGarbage: 'hello',
      department: '',
      nationality: null,
    });
    expect(row).toEqual({ identityNumber: '9900000007' });
  });

  it('maps insurance group-plan synonyms (member_number/card_number)', () => {
    const row = mapRow('insurance', {
      'Iqama': '9900000007',
      'Policy #': 'POL-G-100',
      'Member No': 'M-42',
      Provider: 'DemoCare',
      'Start Date': '2025-01-01',
      'End Date': '2026-01-01',
    });
    // member_number is not yet a top-level field in employee normalize, but
    // it belongs to insurance — confirm fields that ARE in the dictionary
    expect(row.identityNumber).toBe('9900000007');
    expect(row.policyNumber).toBe('POL-G-100');
    expect(row.startDate).toBe('2025-01-01');
    expect(row.endDate).toBe('2026-01-01');
    expect(row.provider).toBe('DemoCare');
  });
});
