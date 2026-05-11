import { useMemo } from 'react';
import { FilterDrawer, FilterGroup } from '@/components/common/FilterDrawer';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Employee } from '@/types/domain';
import {
  countEmployeeFilters,
  type EmployeeFilterValues,
} from './filter-types';

export function EmployeeFiltersDrawer({
  open,
  onOpenChange,
  values,
  onApply,
  onReset,
  employees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: EmployeeFilterValues;
  onApply: (values: EmployeeFilterValues) => void;
  onReset: () => void;
  employees: Employee[];
}) {
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => e.department && set.add(e.department));
    return Array.from(set).sort();
  }, [employees]);

  function toggle<T extends string>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  return (
    <FilterDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Filter employees"
      activeCount={countEmployeeFilters(values)}
      onApply={() => onApply(values)}
      onReset={onReset}
    >
      <FilterGroup label="Status">
        {(['active', 'inactive'] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <Checkbox
              id={`emp-status-${s}`}
              checked={values.status.includes(s)}
              onCheckedChange={() => onApply({ ...values, status: toggle(values.status, s) })}
            />
            <Label htmlFor={`emp-status-${s}`} className="capitalize cursor-pointer">{s}</Label>
          </div>
        ))}
      </FilterGroup>

      <FilterGroup label="Department">
        <div className="grid grid-cols-2 gap-2">
          {departments.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <Checkbox
                id={`emp-dept-${d}`}
                checked={values.departments.includes(d)}
                onCheckedChange={() => onApply({ ...values, departments: toggle(values.departments, d) })}
              />
              <Label htmlFor={`emp-dept-${d}`} className="cursor-pointer">{d}</Label>
            </div>
          ))}
        </div>
      </FilterGroup>
    </FilterDrawer>
  );
}
