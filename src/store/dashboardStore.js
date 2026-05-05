import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const defaultFilters = {
  employeeNumber: '',
  employeeName: '',
  nationality: 'all',
  jobTitle: 'all',
  employmentStatus: 'all',
  contractExpiry: 'all',
  profession: 'all',
  contractStatus: 'all',
  startFrom: '',
  startTo: '',
  endFrom: '',
  endTo: '',
  search: '',
};

const defaultVisibleColumns = {
  EmployeeNumber: true,
  Name: true,
  Profession: true,
  Nationality: true,
  StartDate: true,
  EndDate: true,
  ContractStatus: true,
  ContractDaysRemaining: true,
  BasicSalary: true,
  TotalCashAllowances: true,
  GrossCashMonthly: true,
  MobileNumber: false,
  Email: false,
  IBAN: false,
  IdentityNumber: false,
};

export const useDashboardStore = create(
  persist(
    (set, get) => ({
      language: 'ar',
      activePage: 'executive',
      sourceName: 'sample.xlsx',
      rows: [],
      issues: [],
      importSummary: {
        rowCount: 0,
        columnCount: 0,
        totalMissingValues: 0,
        criticalCount: 0,
        warningCount: 0,
        topIssues: [],
      },
      filtersDraft: { ...defaultFilters },
      filtersApplied: { ...defaultFilters },
      sortKey: 'Name',
      sortDirection: 'asc',
      page: 1,
      pageSize: 25,
      visibleColumns: { ...defaultVisibleColumns },
      selectedEmployee: null,
      pdfMap: {},

      setLanguage: (language) => set({ language }),
      setActivePage: (activePage) => set({ activePage }),

      setRowsAndSummary: (rows, issues, importSummary, sourceName) =>
        set({
          rows,
          issues,
          importSummary,
          sourceName,
          page: 1,
          selectedEmployee: null,
        }),

      resetDataState: () =>
        set({
          sourceName: 'sample.xlsx',
          rows: [],
          issues: [],
          importSummary: {
            rowCount: 0,
            columnCount: 0,
            totalMissingValues: 0,
            criticalCount: 0,
            warningCount: 0,
            topIssues: [],
          },
          filtersDraft: { ...defaultFilters },
          filtersApplied: { ...defaultFilters },
          page: 1,
          selectedEmployee: null,
          pdfMap: {},
        }),

      updateDraftFilter: (key, value) =>
        set((state) => ({
          filtersDraft: {
            ...state.filtersDraft,
            [key]: value,
          },
        })),

      applyFilters: () =>
        set((state) => ({
          filtersApplied: { ...state.filtersDraft },
          page: 1,
        })),

      resetFilters: () =>
        set({
          filtersDraft: { ...defaultFilters },
          filtersApplied: { ...defaultFilters },
          page: 1,
        }),

      setSorting: (sortKey) => {
        const { sortKey: currentKey, sortDirection } = get();
        if (currentKey === sortKey) {
          set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
        } else {
          set({ sortKey, sortDirection: 'asc' });
        }
      },

      setPage: (page) => set({ page }),
      setPageSize: (pageSize) => set({ pageSize, page: 1 }),

      toggleColumn: (column) =>
        set((state) => ({
          visibleColumns: {
            ...state.visibleColumns,
            [column]: !state.visibleColumns[column],
          },
        })),

      openEmployee: (selectedEmployee) => set({ selectedEmployee }),
      closeEmployee: () => set({ selectedEmployee: null }),

      mergePdfMap: (incoming) =>
        set((state) => ({
          pdfMap: {
            ...state.pdfMap,
            ...incoming,
          },
        })),
    }),
    {
      name: 'hr-dashboard-ui-state-v2',
      partialize: (state) => ({
        language: state.language,
        activePage: state.activePage,
        filtersDraft: state.filtersDraft,
        filtersApplied: state.filtersApplied,
        visibleColumns: state.visibleColumns,
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
        pageSize: state.pageSize,
      }),
    }
  )
);

export const defaultEmployeeColumns = Object.keys(defaultVisibleColumns);
