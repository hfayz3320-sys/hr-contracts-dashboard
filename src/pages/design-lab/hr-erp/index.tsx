/**
 * /design-lab/hr-erp — Odoo-inspired HR ERP design lab (local-only).
 *
 * URL state:
 *   ?m=<module>&v=<view>&id=<employee-id>
 *
 * No API calls, no production wiring. Will be deleted once the direction
 * is approved (or replaced by production-grade pages).
 */
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { HrErpShell } from './shell';
import { MODULES, VIEW_OPTIONS, type ModuleKey, type ViewKey } from './shell-meta';
import { EmployeesKanban, EmployeesList, EmployeeProfile } from './views-employees';
import { ContractsWorkspace, PayrollWorkspace, LearningWorkspace } from './views-business';
import { OrgWorkspace, ReportingWorkspace } from './views-org';
import { LAB_AGGREGATE } from '../mock-data';

export function HrErpDesignLab() {
  const [params, setParams] = useSearchParams();

  const moduleParam = (params.get('m') as ModuleKey) || 'employees';
  const module: ModuleKey = MODULES.some((m) => m.key === moduleParam) ? moduleParam : 'employees';

  const viewParam = params.get('v') as ViewKey | null;
  const defaultViewFor = (m: ModuleKey): ViewKey => VIEW_OPTIONS[m][0]!;
  const allowedViews = new Set(VIEW_OPTIONS[module]);
  const view: ViewKey = viewParam && allowedViews.has(viewParam) ? viewParam : defaultViewFor(module);

  const employeeId = params.get('id') ?? undefined;

  function setModule(m: ModuleKey) {
    const next = new URLSearchParams(params);
    next.set('m', m);
    // reset view to module default
    next.set('v', defaultViewFor(m));
    next.delete('id');
    setParams(next, { replace: true });
  }
  function setView(v: ViewKey) {
    const next = new URLSearchParams(params);
    next.set('v', v);
    setParams(next, { replace: true });
  }
  function openProfile(id: string) {
    const next = new URLSearchParams(params);
    next.set('m', 'employees');
    next.set('v', 'form');
    next.set('id', id);
    setParams(next, { replace: false });
  }

  // -------- Title + primary action per module ----------------------------
  const meta = MODULE_META[module];

  return (
    <HrErpShell
      module={module}
      onModule={setModule}
      view={view}
      onView={setView}
      title={meta.title}
      primary={meta.primary}
      searchPlaceholder={meta.search}
      count={meta.count}
      showActionBar={meta.showActionBar !== false}
      showViewSwitcher={meta.showViewSwitcher !== false}
    >
      {module === 'employees' && view === 'kanban'   && <EmployeesKanban onOpenProfile={openProfile} />}
      {module === 'employees' && view === 'list'     && <EmployeesList   onOpenProfile={openProfile} />}
      {module === 'employees' && view === 'form'     && <EmployeeProfile employeeId={employeeId} />}
      {module === 'employees' && view === 'org'      && <OrgWorkspace />}
      {module === 'employees' && view === 'activity' && <ActivityPlaceholder />}
      {module === 'employees' && view === 'report'   && <ReportingWorkspace />}

      {module === 'departments' && (view === 'org' || view === 'kanban' || view === 'list') && <OrgWorkspace />}
      {module === 'departments' && view === 'report' && <ReportingWorkspace />}

      {module === 'contracts'   && (view === 'list' || view === 'form' || view === 'kanban') && <ContractsWorkspace />}
      {module === 'contracts'   && view === 'report' && <ReportingWorkspace />}

      {module === 'payroll'     && (view === 'list' || view === 'form')   && <PayrollWorkspace />}
      {module === 'payroll'     && view === 'report' && <ReportingWorkspace />}

      {module === 'learning'    && <LearningWorkspace />}

      {module === 'reporting'   && <ReportingWorkspace />}

      {module === 'configuration' && <ConfigPlaceholder />}
    </HrErpShell>
  );
}

const MODULE_META: Record<ModuleKey, {
  title: string;
  primary?: { label: string; icon?: React.ReactNode };
  search?: string;
  count?: { selected: number; total: number };
  showActionBar?: boolean;
  showViewSwitcher?: boolean;
}> = {
  employees: {
    title: 'Employees',
    primary: { label: 'New employee', icon: <Plus className="h-3.5 w-3.5" /> },
    search: `Search ${LAB_AGGREGATE.employees} employees…`,
    count: { selected: 0, total: LAB_AGGREGATE.employees },
  },
  departments: {
    title: 'Departments',
    primary: { label: 'New department', icon: <Plus className="h-3.5 w-3.5" /> },
    search: 'Search departments…',
  },
  contracts: {
    title: 'Contracts',
    primary: { label: 'New contract', icon: <Plus className="h-3.5 w-3.5" /> },
    search: `Search ${LAB_AGGREGATE.contracts} contracts…`,
    count: { selected: 0, total: LAB_AGGREGATE.contracts },
  },
  payroll: {
    title: 'Payroll & Compensation',
    primary: { label: 'Run payroll', icon: <Plus className="h-3.5 w-3.5" /> },
    search: 'Search payroll…',
  },
  learning: {
    title: 'Learning & Experience',
    primary: { label: 'Add record', icon: <Plus className="h-3.5 w-3.5" /> },
    search: 'Search certifications, skills, training…',
  },
  reporting: {
    title: 'Reporting',
    primary: { label: 'New report', icon: <Plus className="h-3.5 w-3.5" /> },
    search: 'Search reports…',
    showViewSwitcher: false,
  },
  configuration: {
    title: 'Configuration',
    primary: { label: 'New entry', icon: <Plus className="h-3.5 w-3.5" /> },
    search: 'Search configuration…',
    showViewSwitcher: false,
  },
};

function ActivityPlaceholder() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-[18px] font-semibold tracking-tight">Activity stream</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          A unified, filterable feed of every event across the workforce. Reuses the chatter primitives from the Employee profile.
        </p>
      </div>
    </div>
  );
}

function ConfigPlaceholder() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="rounded-lg border bg-card p-8">
        <h2 className="text-[18px] font-semibold tracking-tight">Configuration</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This is the production-ready HR config foundation (14 tables) already deployed.
          The lab does NOT mutate these — production wiring lands in a future phase.
        </p>
        <ul className="mt-4 text-[12.5px] space-y-1.5 list-disc list-inside text-muted-foreground">
          <li>Org units, job titles, positions, grades, trades</li>
          <li>Contract types, document types, transaction types, activity types</li>
          <li>Payroll components, medical providers, medical policy classes</li>
          <li>Learning categories, social insurance rules (history-aware)</li>
        </ul>
      </div>
    </div>
  );
}
