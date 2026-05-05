import { MODULES } from './modules';

export const PAGE_KEYS = {
  ADMIN: 'ADMIN_PAGE',
  EXECUTIVE: 'EXECUTIVE_PAGE',
  TALENT: 'TALENT_PAGE',
  RISK: 'RISK_PAGE',
  COMPENSATION: 'COMPENSATION_PAGE',
  DATA_QUALITY: 'DATA_QUALITY_PAGE',
  EMPLOYEES: 'EMPLOYEES_PAGE',
  INSURANCE: 'INSURANCE_PAGE',
};

export const pageRegistry = {
  [PAGE_KEYS.ADMIN]: {
    key: PAGE_KEYS.ADMIN,
    route: '/admin',
    slug: 'admin',
    moduleKey: MODULES.SYSTEM_MODULE,
    navKey: 'admin',
    title: 'System Administration',
    componentName: 'AdminPage',
    order: 0,
  },
  [PAGE_KEYS.EXECUTIVE]: {
    key: PAGE_KEYS.EXECUTIVE,
    route: '/hr/executive',
    slug: 'executive',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'executive',
    title: 'Executive Summary',
    componentName: 'ExecutivePage',
    order: 10,
  },
  [PAGE_KEYS.TALENT]: {
    key: PAGE_KEYS.TALENT,
    route: '/hr/talent',
    slug: 'talent',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'talent',
    title: 'Talent Overview',
    componentName: 'TalentPage',
    order: 20,
  },
  [PAGE_KEYS.RISK]: {
    key: PAGE_KEYS.RISK,
    route: '/hr/risk',
    slug: 'risk',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'risk',
    title: 'Contract Risk',
    componentName: 'RiskPage',
    order: 30,
  },
  [PAGE_KEYS.COMPENSATION]: {
    key: PAGE_KEYS.COMPENSATION,
    route: '/hr/compensation',
    slug: 'compensation',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'compensation',
    title: 'Compensation',
    componentName: 'CompensationPage',
    order: 40,
  },
  [PAGE_KEYS.DATA_QUALITY]: {
    key: PAGE_KEYS.DATA_QUALITY,
    route: '/hr/quality',
    slug: 'quality',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'quality',
    title: 'Data Quality',
    componentName: 'DataQualityPage',
    order: 50,
  },
  [PAGE_KEYS.EMPLOYEES]: {
    key: PAGE_KEYS.EMPLOYEES,
    route: '/hr/employees',
    slug: 'employees',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'employees',
    title: 'Employees',
    componentName: 'EmployeesPage',
    order: 60,
  },
  [PAGE_KEYS.INSURANCE]: {
    key: PAGE_KEYS.INSURANCE,
    route: '/hr/insurance',
    slug: 'insurance',
    moduleKey: MODULES.HR_MODULE,
    navKey: 'insurance',
    title: 'Medical Insurance',
    componentName: 'MedicalInsurancePage',
    order: 70,
  },
};

export function getPageDefinition(pageKey) {
  return pageRegistry[pageKey] || null;
}

export function getPageBySlug(pageSlug) {
  return Object.values(pageRegistry).find((page) => page.slug === pageSlug) || null;
}

export function getPagesByModule(moduleKey) {
  return Object.values(pageRegistry)
    .filter((page) => page.moduleKey === moduleKey)
    .sort((left, right) => left.order - right.order);
}
