/**
 * Module / view registry — pure data, split from `shell.tsx` so the shell
 * file only exports components (required by react-refresh).
 */

export type ModuleKey = 'employees' | 'departments' | 'contracts' | 'payroll' | 'learning' | 'reporting' | 'configuration';
export type ViewKey   = 'kanban' | 'list' | 'form' | 'org' | 'activity' | 'report';

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'employees',     label: 'Employees'     },
  { key: 'departments',   label: 'Departments'   },
  { key: 'contracts',     label: 'Contracts'     },
  { key: 'payroll',       label: 'Payroll'       },
  { key: 'learning',      label: 'Learning'      },
  { key: 'reporting',     label: 'Reporting'     },
  { key: 'configuration', label: 'Configuration' },
];

export const VIEW_OPTIONS: Record<ModuleKey, ViewKey[]> = {
  employees:     ['kanban', 'list', 'form', 'org', 'activity', 'report'],
  departments:   ['kanban', 'list', 'org', 'report'],
  contracts:     ['list', 'form', 'kanban', 'report'],
  payroll:       ['list', 'form', 'report'],
  learning:      ['kanban', 'list', 'form'],
  reporting:     ['report'],
  configuration: ['list', 'form'],
};
