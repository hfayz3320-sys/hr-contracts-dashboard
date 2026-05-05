import { cleanDataset } from '../../utils/cleaning';
import { expectedSchema } from '../../utils/schema';

export const employeeFieldOrder = [...expectedSchema, 'EmploymentStatus'];

export const employeeFieldConfig = {
  SourceFile: { label: 'Source File', type: 'text', placeholder: 'Original source file name' },
  ContractNumber: { label: 'Contract Number', type: 'text', required: true },
  Name: { label: 'Employee Name', type: 'text', required: true },
  Profession: { label: 'Job Title / Position', type: 'text', required: true },
  EmployeeNumber: { label: 'Employee Number', type: 'text', required: true },
  Nationality: { label: 'Nationality', type: 'text', required: true },
  DateOfBirth: { label: 'Birth Date', type: 'date' },
  IdentityNumber: { label: 'Identity / Iqama / Passport No', type: 'text' },
  IDType: { label: 'ID Type', type: 'text' },
  IDExpiryDate: { label: 'ID Expiry Date', type: 'date' },
  Gender: { label: 'Gender', type: 'select', options: ['', 'M', 'F'] },
  Religion: { label: 'Religion', type: 'text' },
  MaritalStatus: { label: 'Marital Status', type: 'text' },
  Education: { label: 'Education', type: 'text' },
  Speciality: { label: 'Speciality', type: 'text' },
  IBAN: { label: 'IBAN', type: 'text' },
  BankName: { label: 'Bank Name', type: 'text' },
  Email: { label: 'Email', type: 'email' },
  MobileNumber: { label: 'Mobile Number', type: 'text' },
  ContractDurationYears: { label: 'Contract Duration (Years)', type: 'number', step: '0.1' },
  StartDate: { label: 'Contract Start Date', type: 'date', required: true },
  EndDate: { label: 'Contract End Date', type: 'date', required: true },
  JoiningDate: { label: 'Joining Date', type: 'date' },
  BasicSalary: { label: 'Basic Salary', type: 'number', step: '0.01' },
  HousingProvided: { label: 'Housing Provided', type: 'select', options: ['', 'true', 'false'] },
  TransportProvided: { label: 'Transport Provided', type: 'select', options: ['', 'true', 'false'] },
  HousingAllowance: { label: 'Housing Allowance', type: 'number', step: '0.01' },
  TransportationAllowance: {
    label: 'Transportation Allowance',
    type: 'number',
    step: '0.01',
  },
  FoodAllowance: { label: 'Food Allowance', type: 'number', step: '0.01' },
  OTAllowance: { label: 'OT Allowance', type: 'number', step: '0.01' },
  MastersDegreeAllowance: {
    label: 'Masters Degree Allowance',
    type: 'number',
    step: '0.01',
  },
  TotalCashAllowances: { label: 'Total Cash Allowances', type: 'number', step: '0.01' },
  GrossCashMonthly: { label: 'Gross Cash Monthly', type: 'number', step: '0.01' },
  EmploymentStatus: {
    label: 'Employment Status',
    type: 'select',
    required: true,
    options: ['Active', 'Inactive', 'Terminated'],
  },
};

export function createEmptyEmployeeForm() {
  return employeeFieldOrder.reduce((accumulator, field) => {
    accumulator[field] = field === 'EmploymentStatus' ? 'Active' : '';
    return accumulator;
  }, {});
}

export function createEmployeeFormState(employee) {
  const base = createEmptyEmployeeForm();
  return {
    ...base,
    ...(employee || {}),
    HousingProvided:
      employee?.HousingProvided === null || employee?.HousingProvided === undefined
        ? ''
        : String(employee.HousingProvided),
    TransportProvided:
      employee?.TransportProvided === null || employee?.TransportProvided === undefined
        ? ''
        : String(employee.TransportProvided),
  };
}

export function validateEmployeeForm(formState) {
  const errors = {};

  employeeFieldOrder.forEach((field) => {
    const config = employeeFieldConfig[field];
    if (config?.required && !String(formState[field] || '').trim()) {
      errors[field] = `${config.label} is required.`;
    }
  });

  if (formState.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(formState.Email).trim())) {
    errors.Email = 'A valid email address is required.';
  }

  return errors;
}

export function normalizeEmployeeForm(formState) {
  const rawRow = expectedSchema.reduce((accumulator, field) => {
    accumulator[field] = formState[field] ?? '';
    return accumulator;
  }, {});

  const { cleanedRows } = cleanDataset([rawRow]);
  const cleaned = cleanedRows[0] || rawRow;

  return {
    ...cleaned,
    EmploymentStatus: formState.EmploymentStatus || 'Active',
    SourceFile: String(formState.SourceFile || cleaned.SourceFile || 'Manual Entry').trim(),
  };
}
