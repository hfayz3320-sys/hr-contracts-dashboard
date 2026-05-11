export type EmployeeFilterValues = {
  status: ('active' | 'inactive')[];
  departments: string[];
};

export const emptyEmployeeFilters: EmployeeFilterValues = {
  status: [],
  departments: [],
};

export function countEmployeeFilters(v: EmployeeFilterValues): number {
  return v.status.length + v.departments.length;
}
