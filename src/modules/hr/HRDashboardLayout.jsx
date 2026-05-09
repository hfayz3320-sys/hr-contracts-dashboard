import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import TopToolbar from '../../components/TopToolbar';
import TopFilterRow from '../../components/TopFilterRow';
import EmployeeModal from '../../components/EmployeeModal';
import BulkPdfImportPanel from '../../components/employees/BulkPdfImportPanel';
import EmployeeFormModal from '../../components/employees/EmployeeFormModal';
import ExecutivePage from '../../pages/ExecutivePage';
import TalentPage from '../../pages/TalentPage';
import RiskPage from '../../pages/RiskPage';
import CompensationPage from '../../pages/CompensationPage';
import DataQualityPage from '../../pages/DataQualityPage';
import EmployeesPage from '../../pages/EmployeesPage';
import MedicalInsurancePage from '../../pages/MedicalInsurancePage';
import { pages as dashboardPages, t } from '../../lib/i18n';
import { useDashboardStore } from '../../store/dashboardStore';
import { cleanDataset } from '../../utils/cleaning';
import {
  exportRowsToCsv,
  exportRowsToXlsx,
  readSpreadsheetFile,
} from '../../utils/fileImport';
import {
  applyFilters as applyDataFilters,
  buildFilterOptions,
  paginateRows,
  sortRows,
} from '../../utils/filtering';
import { useAuthStore } from '../../auth/useAuthStore';
import { MODULES, moduleRegistry } from '../../security/config/modules';
import { PAGE_KEYS, getPageBySlug } from '../../security/config/pages';
import { permissionService } from '../../security/services/permissionService';
import { localDataService } from '../../services/storage/localDataService';
import { resolveStartupSnapshot, shouldHideDemoUI } from '../../services/api/productionMode';
import { calculateEmployeePageSummary } from '../../services/employees/employeeSummaryService';
import { pdfImportService } from '../../services/imports/pdfImportService';
import { insuranceImportService } from '../../services/insurance/insuranceImportService';
import { REVIEW_STATUSES } from '../../storage/indexedDb/dbSchema';

const defaultSummary = {
  rowCount: 0,
  columnCount: 0,
  totalMissingValues: 0,
  criticalCount: 0,
  warningCount: 0,
  topIssues: [],
};

const defaultEmployeeModalState = {
  open: false,
  mode: 'create',
  employee: null,
  error: '',
};

function basename(pathValue) {
  return String(pathValue || '')
    .split(/[\\/]/)
    .pop()
    .trim();
}

function normalizePdfKey(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalPdfKey(value) {
  return normalizePdfKey(
    String(value || '')
      .replace(/\.[^.]+$/, '')
      .normalize('NFKC')
      .replace(/[\s._-]+/g, '')
  );
}

function findPdfForEmployee(employee, pdfMap) {
  if (!employee || !pdfMap) {
    return '';
  }

  const source = String(employee.SourceFile || '').trim();
  const sourceBase = basename(source);
  const keysToTry = [
    employee.contractPdfId,
    employee.ContractNumber,
    employee.EmployeeNumber,
    source,
    sourceBase,
    sourceBase.replace(/\.[^.]+$/, '.pdf'),
    `${sourceBase}.pdf`,
    employee.Name,
    `${employee.Name || ''}.pdf`,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const normalizedMap = {};
  const canonicalMap = {};

  Object.keys(pdfMap).forEach((key) => {
    normalizedMap[normalizePdfKey(key)] = pdfMap[key];
    canonicalMap[canonicalPdfKey(key)] = pdfMap[key];
  });

  for (const key of keysToTry) {
    const url = normalizedMap[normalizePdfKey(key)];
    if (url) {
      return url;
    }
  }

  for (const key of keysToTry) {
    const url = canonicalMap[canonicalPdfKey(key)];
    if (url) {
      return url;
    }
  }

  return '';
}

function buildEmployeeInsuranceDetails(employee, insuranceRecords) {
  if (!employee) {
    return null;
  }

  const matches = (insuranceRecords || []).filter(
    (record) =>
      record.matchedEmployeeId === employee.id ||
      String(record.matchedEmployeeNumber || '').trim() ===
        String(employee.EmployeeNumber || '').trim()
  );

  if (!matches.length) {
    return {
      primaryRecord: null,
      dependents: [],
    };
  }

  const primaryRecord =
    matches.find((record) => String(record.Relationship || '').toLowerCase() === 'employee') ||
    matches.find((record) => String(record.memberType || '').toLowerCase() === 'main member') ||
    matches[0];

  const dependents = matches.filter((record) => record.id !== primaryRecord.id);

  return {
    primaryRecord,
    dependents,
  };
}

export default function HRDashboardLayout() {
  const navigate = useNavigate();
  const { pageSlug } = useParams();
  const excelInputRef = useRef(null);
  const singlePdfInputRef = useRef(null);

  const [insuranceRecords, setInsuranceRecords] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [employeeModalState, setEmployeeModalState] = useState(defaultEmployeeModalState);
  const [isEmployeeSaving, setIsEmployeeSaving] = useState(false);
  const [isImportSaving, setIsImportSaving] = useState(false);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [importPanelTitle, setImportPanelTitle] = useState('Contract PDF Review');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  // Production-mode resolver result: 'real' | 'empty' | 'dev-fallback' | 'api-down'
  const [prodMode, setProdMode] = useState({ mode: 'dev-fallback', snapshot: null, isProd: false });

  const currentUser = useAuthStore((state) => state.currentUser);
  const roles = useAuthStore((state) => state.roles);
  const logout = useAuthStore((state) => state.logout);

  const {
    language,
    sourceName,
    rows,
    issues,
    importSummary,
    filtersDraft,
    filtersApplied,
    sortKey,
    sortDirection,
    page,
    pageSize,
    visibleColumns,
    selectedEmployee,
    pdfMap,
    setLanguage,
    setActivePage,
    setRowsAndSummary,
    updateDraftFilter,
    applyFilters,
    resetFilters,
    setSorting,
    setPage,
    setPageSize,
    toggleColumn,
    openEmployee,
    closeEmployee,
    mergePdfMap,
    resetDataState,
  } = useDashboardStore();

  const access = useMemo(
    () => permissionService.resolveUserAccess(currentUser, roles),
    [currentUser, roles]
  );

  const accessiblePages = useMemo(
    () => permissionService.getAccessiblePages(access, MODULES.HR_MODULE),
    [access]
  );

  const currentPageDefinition = getPageBySlug(pageSlug || '');
  const currentPageKey = currentPageDefinition?.navKey || accessiblePages[0]?.navKey || 'executive';
  const canExportCurrentPage = currentPageDefinition
    ? permissionService.canAccessPage(access, currentPageDefinition.key, 'export')
    : false;

  const canCreateEmployees = permissionService.canAccessPage(access, PAGE_KEYS.EMPLOYEES, 'create');
  const canEditEmployees = permissionService.canAccessPage(access, PAGE_KEYS.EMPLOYEES, 'edit');
  const canImportEmployees = permissionService.canAccessPage(access, PAGE_KEYS.EMPLOYEES, 'import');
  const canReviewEmployees = permissionService.canAccessPage(access, PAGE_KEYS.EMPLOYEES, 'review');
  const canImportInsurance = permissionService.canAccessPage(access, PAGE_KEYS.INSURANCE, 'import');
  const canEditInsurance = permissionService.canAccessPage(access, PAGE_KEYS.INSURANCE, 'edit');
  const canReviewInsurance = permissionService.canAccessPage(access, PAGE_KEYS.INSURANCE, 'review');

  const roleNames = useMemo(
    () =>
      roles
        .filter((role) => currentUser?.roleIds?.includes(role.id))
        .map((role) => role.name),
    [currentUser?.roleIds, roles]
  );

  const navPages = useMemo(
    () =>
      accessiblePages.map((pageDefinition) => {
        const dashboardPage = dashboardPages.find((item) => item.key === pageDefinition.navKey);
        return {
          ...pageDefinition,
          ar: dashboardPage?.ar || pageDefinition.title,
          en: dashboardPage?.en || pageDefinition.title,
        };
      }),
    [accessiblePages]
  );

  const refreshLocalData = async () => {
    const saved = await localDataService.loadDashboardData();
    const savedRows = Array.isArray(saved.rows) ? saved.rows : [];
    const savedIssues = Array.isArray(saved.issues) ? saved.issues : [];
    const savedSummary = saved.importSummary || defaultSummary;
    const savedSource = saved.sourceName || 'Local IndexedDB';
    const [savedInsurance, savedReviewItems] = await Promise.all([
      localDataService.listInsuranceRecords(),
      localDataService.listReviewItems(),
    ]);

    setRowsAndSummary(savedRows, savedIssues, savedSummary, savedSource);
    mergePdfMap(saved.pdfMap || {});
    setInsuranceRecords(savedInsurance || []);
    setReviewItems(savedReviewItems || []);
  };

  useEffect(() => {
    document.documentElement.lang = language === 'ar' ? 'ar' : 'en';
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title =
      language === 'ar'
        ? `HR Contracts Dashboard | ${t('ar', 'company')}`
        : `HR Contracts Dashboard | ${t('en', 'company')}`;
  }, [language]);

  useEffect(() => {
    if (currentPageDefinition?.navKey) {
      setActivePage(currentPageDefinition.navKey);
    }
  }, [currentPageDefinition?.navKey, setActivePage]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        setIsBootstrapping(true);

        // Step 1 — ask the API whether a real production snapshot exists.
        //   - mode 'real'         → production data is in D1, hide demo
        //   - mode 'empty'        → prod build but no data yet
        //   - mode 'api-down'     → prod build but Functions not deployed
        //   - mode 'dev-fallback' → dev environment, fall through to IndexedDB
        const startup = await resolveStartupSnapshot();
        if (!cancelled) setProdMode(startup);

        // Step 2 — if we have a real snapshot, surface its source/counts on
        // the toolbar. The table data continues to be read from IndexedDB
        // for now (the existing localDataService stores the same content).
        if (startup.mode === 'real' && startup.snapshot) {
          const job = startup.snapshot.job || {};
          const dateLabel = job.committed_at
            ? new Date(job.committed_at).toLocaleString()
            : '';
          // setSourceName lives on the dashboard store — pass through the
          // existing setRowsAndSummary path so consumers stay unchanged.
          // (When D1-driven hydration of the table view lands, replace
          // refreshLocalData() with a direct snapshot→state mapper.)
        }

        // Step 3 — when a snapshot exists OR we're in dev, also load the
        // local IndexedDB so the existing table memos work. In a clean
        // production environment with mode 'empty' we still call this; it
        // returns empty stores and the dashboard renders the production
        // empty state defined further below.
        await localDataService.initialize();
        if (!cancelled) {
          await refreshLocalData();
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => buildFilterOptions(rows), [rows]);
  const pdfFileCount = useMemo(
    () => new Set(Object.values(pdfMap || {})).size,
    [pdfMap]
  );
  const showTopFilterRow = useMemo(
    () =>
      Boolean(rows.length) &&
      [
        PAGE_KEYS.EXECUTIVE,
        PAGE_KEYS.TALENT,
        PAGE_KEYS.RISK,
        PAGE_KEYS.COMPENSATION,
        PAGE_KEYS.DATA_QUALITY,
      ].includes(currentPageDefinition?.key),
    [currentPageDefinition?.key, rows.length]
  );

  const filteredRows = useMemo(
    () => applyDataFilters(rows, filtersApplied),
    [rows, filtersApplied]
  );

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortKey, sortDirection),
    [filteredRows, sortKey, sortDirection]
  );

  const paged = useMemo(
    () => paginateRows(sortedRows, page, pageSize),
    [sortedRows, page, pageSize]
  );

  const employeeSummary = useMemo(
    () => calculateEmployeePageSummary(filteredRows),
    [filteredRows]
  );

  const selectedEmployeeInsuranceDetails = useMemo(
    () => buildEmployeeInsuranceDetails(selectedEmployee, insuranceRecords),
    [insuranceRecords, selectedEmployee]
  );

  const openReviewItemCount = useMemo(
    () =>
      reviewItems.filter((item) =>
        item.status !== REVIEW_STATUSES.CONFIRMED && item.status !== REVIEW_STATUSES.SKIPPED
      ).length,
    [reviewItems]
  );

  useEffect(() => {
    if (page !== paged.page) {
      setPage(paged.page);
    }
  }, [page, paged.page, setPage]);

  const hydrateRows = async (rawRows, fileName) => {
    const { cleanedRows, issues: foundIssues, summary } = cleanDataset(rawRows);
    setRowsAndSummary(cleanedRows, foundIssues, summary, fileName);
    await localDataService.storeImportedRows(cleanedRows, {
      sourceName: fileName,
      replaceExisting: true,
    });
    await refreshLocalData();
  };

  const handleImportExcelClick = () => {
    excelInputRef.current?.click();
  };

  const handleImportExcelFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const { rows: rawRows } = await readSpreadsheetFile(file);
      await hydrateRows(rawRows, file.name);
    } catch (error) {
      alert(t(language, 'importFailed'));
      console.error(error);
    }
  };

  const handleUseSample = async () => {
    try {
      setIsBootstrapping(true);
      const result = await localDataService.reseedDefaultData();
      await refreshLocalData();
      // Surface a non-blocking warning when some default-data files were
      // missing (e.g. /data/sample.xlsx removed for security). The dashboard
      // continues with whatever data is available — empty stores are fine.
      if (result?.warnings?.length) {
        const lines = result.warnings.map((w) =>
          `• ${w.label || w.file}: ${w.reason}${w.hint ? '\n   ' + w.hint : ''}`
        );
        alert(
          `Sample data partially loaded:\n` +
          `   employees rows : ${result.rows}\n` +
          `   contract PDFs  : ${result.matchedPdfs}/${result.pdfs}\n` +
          `   insurance rows : ${result.insuranceRows}\n\n` +
          `Warnings:\n${lines.join('\n')}`
        );
      }
    } catch (error) {
      alert(t(language, 'sampleFailed') + '\n\n' + (error?.message || String(error)));
      console.error(error);
    } finally {
      setIsBootstrapping(false);
    }
  };

  const preparePdfReview = async (entries) => {
    const preparedEntries = Array.from(entries || []);
    if (!preparedEntries.length) {
      return;
    }

    const result = await pdfImportService.prepare(preparedEntries, rows);
    setReviewItems(result.reviewItems || []);
    setImportPanelTitle('Contract PDF Review');
    setImportPanelOpen(true);
    await refreshLocalData();
  };

  const handleImportContractPdfClick = () => {
    singlePdfInputRef.current?.click();
  };

  const handleImportSinglePdf = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) {
      return;
    }

    try {
      await preparePdfReview(files);
    } catch (error) {
      alert(t(language, 'pdfImportFailed'));
      console.error(error);
    }
  };

  const handleSaveReviewItem = async (item) => {
    const saved = await pdfImportService.saveReviewItems([item]);
    setReviewItems((current) =>
      current.map((currentItem) =>
        currentItem.id === saved[0].id ? saved[0] : currentItem
      )
    );
  };

  const handleSkipReviewItem = async (item) => {
    const saved = await pdfImportService.saveReviewItems([
      {
        ...item,
        status: REVIEW_STATUSES.SKIPPED,
      },
    ]);
    setReviewItems((current) =>
      current.map((currentItem) =>
        currentItem.id === saved[0].id ? saved[0] : currentItem
      )
    );
  };

  const handleConfirmSelectedReviewItems = async (draftItems, selectedIds) => {
    setIsImportSaving(true);
    try {
      await pdfImportService.saveReviewItems(draftItems);
      await pdfImportService.confirm(draftItems, selectedIds);
      await refreshLocalData();
      setImportPanelOpen(false);
    } catch (error) {
      alert(error.message || 'Unable to confirm selected imports.');
    } finally {
      setIsImportSaving(false);
    }
  };

  const handleExportCleaned = () => {
    if (!rows.length) {
      alert(t(language, 'noDataExport'));
      return;
    }
    exportRowsToXlsx(rows, 'Cleaned.xlsx');
  };

  const handleResetData = () => {
    if (window.confirm(t(language, 'confirmResetData'))) {
      resetDataState();
      setIsBootstrapping(true);
      localDataService
        .reseedDefaultData()
        .then((result) => {
          // Pass-through warnings so the operator knows some defaults were skipped.
          if (result?.warnings?.length) {
            console.warn('[reseed] partial seed:', result.warnings);
          }
          return refreshLocalData();
        })
        .catch((error) => {
          console.error(error);
          alert('Reset failed: ' + (error?.message || String(error)));
        })
        .finally(() => setIsBootstrapping(false));
    }
  };

  const handleSearchChange = (value) => {
    updateDraftFilter('search', value);
    applyFilters();
  };

  const handleClearSearch = () => {
    updateDraftFilter('search', '');
    applyFilters();
  };

  const handleEmployeeFilterChange = (key, value) => {
    updateDraftFilter(key, value);
    if (key === 'jobTitle') {
      updateDraftFilter('profession', value);
    }
    applyFilters();
  };

  const handleResetEmployeeFilters = () => {
    resetFilters();
  };

  const handleExportFilteredCsv = () => {
    exportRowsToCsv(sortedRows, 'employees-filtered.csv');
  };

  const handleExportFilteredXlsx = () => {
    exportRowsToXlsx(sortedRows, 'employees-filtered.xlsx');
  };

  const handleUnauthorizedExport = () => {
    alert('You are not authorized to export from this page.');
  };

  const openCreateEmployeeModal = () => {
    setEmployeeModalState({
      open: true,
      mode: 'create',
      employee: null,
      error: '',
    });
  };

  const openEditEmployeeModal = (employee) => {
    setEmployeeModalState({
      open: true,
      mode: 'edit',
      employee,
      error: '',
    });
  };

  const closeEmployeeEditor = () => {
    setEmployeeModalState(defaultEmployeeModalState);
  };

  const handleEmployeeSubmit = async (employee) => {
    setIsEmployeeSaving(true);
    try {
      await localDataService.saveEmployee(employee);
      await refreshLocalData();
      closeEmployeeEditor();
    } catch (error) {
      setEmployeeModalState((current) => ({
        ...current,
        error: error.message || 'Unable to save employee.',
      }));
    } finally {
      setIsEmployeeSaving(false);
    }
  };

  const handleSaveInsuranceRecord = async (record) => {
    await localDataService.saveInsuranceRecords([record]);
    await refreshLocalData();
  };

  const handleImportInsuranceFiles = async (files) => {
    const imported = await insuranceImportService.importFiles(files, rows);
    await refreshLocalData();
    return imported;
  };

  const handleImportInsuranceSample = async () => {
    const imported = await insuranceImportService.importPublicSample('/data/popa.xlsx', rows);
    await refreshLocalData();
    return imported;
  };

  if (!currentPageDefinition) {
    return (
      <Navigate
        to={accessiblePages[0]?.route || permissionService.getDefaultRoute(access)}
        replace
      />
    );
  }

  if (!permissionService.canAccessPage(access, currentPageDefinition.key, 'view')) {
    return <Navigate to="/forbidden" replace />;
  }

  const currentPage = (() => {
    if (currentPageDefinition.key === PAGE_KEYS.EXECUTIVE) {
      return <ExecutivePage rows={filteredRows} lang={language} t={t} />;
    }
    if (currentPageDefinition.key === PAGE_KEYS.TALENT) {
      return <TalentPage rows={filteredRows} lang={language} />;
    }
    if (currentPageDefinition.key === PAGE_KEYS.RISK) {
      return <RiskPage rows={filteredRows} lang={language} />;
    }
    if (currentPageDefinition.key === PAGE_KEYS.COMPENSATION) {
      return <CompensationPage rows={filteredRows} lang={language} />;
    }
    if (currentPageDefinition.key === PAGE_KEYS.DATA_QUALITY) {
      return (
        <DataQualityPage
          lang={language}
          t={t}
          rows={filteredRows}
          issues={issues}
          importSummary={importSummary}
        />
      );
    }
    if (currentPageDefinition.key === PAGE_KEYS.INSURANCE) {
      return (
        <MedicalInsurancePage
          employees={rows}
          insuranceRecords={insuranceRecords}
          canImport={canImportInsurance}
          canEdit={canEditInsurance}
          canExport={canExportCurrentPage}
          canReview={canReviewInsurance}
          onImportFiles={handleImportInsuranceFiles}
          onImportSample={handleImportInsuranceSample}
          onSaveRecord={handleSaveInsuranceRecord}
        />
      );
    }

    return (
      <EmployeesPage
        lang={language}
        t={t}
        rows={sortedRows}
        paged={paged}
        sortKey={sortKey}
        sortDirection={sortDirection}
        setSorting={setSorting}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        page={paged.page}
        setPage={setPage}
        pageSize={pageSize}
        setPageSize={setPageSize}
        onRowClick={openEmployee}
        onExportCsv={canExportCurrentPage ? handleExportFilteredCsv : handleUnauthorizedExport}
        onExportXlsx={canExportCurrentPage ? handleExportFilteredXlsx : handleUnauthorizedExport}
        summary={employeeSummary}
        filtersDraft={filtersDraft}
        filterOptions={options}
        onFilterChange={handleEmployeeFilterChange}
        onResetDedicatedFilters={handleResetEmployeeFilters}
        onCreateEmployee={openCreateEmployeeModal}
        onEditEmployee={openEditEmployeeModal}
        onImportContractPdf={handleImportContractPdfClick}
        onReviewImports={() => setImportPanelOpen(true)}
        reviewItemsCount={openReviewItemCount}
        canCreateEmployee={canCreateEmployees}
        canEditEmployee={canEditEmployees}
        canImportContracts={canImportEmployees}
        canReviewImports={canReviewEmployees}
        resolvePdfUrl={(row) => findPdfForEmployee(row, pdfMap)}
      />
    );
  })();

  return (
    <div className={`dashboard-shell ${language === 'ar' ? 'is-ar' : 'is-en'}`}>
      <div className="content-wrap">
        <TopToolbar
          lang={language}
          t={t}
          sourceName={
            prodMode.mode === 'real' && prodMode.snapshot?.job?.committed_at
              ? `Real Imported Data (${new Date(prodMode.snapshot.job.committed_at).toLocaleDateString()})`
              : sourceName
          }
          searchValue={filtersDraft.search}
          onSearchChange={handleSearchChange}
          onClearSearch={handleClearSearch}
          onImportExcel={handleImportExcelClick}
          onUseSample={handleUseSample}
          onExportCleaned={canExportCurrentPage ? handleExportCleaned : handleUnauthorizedExport}
          onResetData={handleResetData}
          pdfCount={
            prodMode.mode === 'real' && prodMode.snapshot?.counts
              ? prodMode.snapshot.counts.contracts
              : pdfFileCount
          }
          hideDemoButton={shouldHideDemoUI(prodMode)}
        />

        {showTopFilterRow ? (
          <TopFilterRow
            lang={language}
            t={t}
            filtersDraft={filtersDraft}
            updateDraftFilter={updateDraftFilter}
            applyFilters={applyFilters}
            resetFilters={resetFilters}
            options={options}
          />
        ) : null}

        {isBootstrapping ? (
          <div className="page-card">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <div>
                <h1>{language === 'ar' ? 'جاري تهيئة البيانات' : 'Initializing data'}</h1>
                <p>
                  {language === 'ar'
                    ? 'يتم تحميل بيانات التشغيل الافتراضية من الملفات المنشورة.'
                    : 'Loading the default operational dataset from the deployed files.'}
                </p>
              </div>
            </div>
          </div>
        ) : !rows.length && currentPageDefinition.key !== PAGE_KEYS.INSURANCE ? (
          <div className="page-card">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <div>
                {prodMode.isProd && prodMode.mode === 'empty' ? (
                  <>
                    <h1>{language === 'ar' ? 'لم يتم استيراد بيانات الموارد البشرية بعد' : 'No production HR data has been imported yet'}</h1>
                    <p>
                      {language === 'ar'
                        ? 'يجب على المسؤول استيراد ملف الموظفين وعقود PDF وملف التأمين والاعتماد عبر صفحة الاستيراد.'
                        : 'Admin must import the Employee Excel, Contract PDFs, and Insurance Excel and commit them via the Import Dashboard.'}
                    </p>
                  </>
                ) : prodMode.isProd && prodMode.mode === 'api-down' ? (
                  <>
                    <h1>{language === 'ar' ? 'تعذّر الاتصال بقاعدة البيانات' : 'HR API unavailable'}</h1>
                    <p>
                      {language === 'ar'
                        ? 'تأكد من نشر Cloudflare Pages Functions وإعداد ربط D1.'
                        : 'Confirm Cloudflare Pages Functions are deployed and the D1 binding is configured.'}
                    </p>
                  </>
                ) : (
                  <>
                    <h1>{t(language, 'emptyStateTitle')}</h1>
                    <p>{t(language, 'emptyStateHint')}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          currentPage
        )}
      </div>

      <Sidebar
        lang={language}
        setLanguage={setLanguage}
        pages={navPages}
        activePage={currentPageKey}
        onNavigatePage={(pageDefinition) => navigate(pageDefinition.route)}
        t={t}
        moduleLabel={moduleRegistry[MODULES.HR_MODULE].label}
        currentUser={currentUser}
        roleNames={roleNames}
        showAdminLink={permissionService.canAccessPage(access, PAGE_KEYS.ADMIN, 'view')}
        onOpenAdmin={() => navigate('/admin')}
        onLogout={() => {
          logout();
          navigate('/login', { replace: true });
        }}
      />

      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleImportExcelFile}
      />
      <input
        ref={singlePdfInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleImportSinglePdf}
      />

      <EmployeeModal
        lang={language}
        t={t}
        employee={selectedEmployee}
        onClose={closeEmployee}
        pdfUrl={findPdfForEmployee(selectedEmployee, pdfMap)}
        onEdit={
          canEditEmployees
            ? (employee) => {
                closeEmployee();
                openEditEmployeeModal(employee);
              }
            : null
        }
        insuranceDetails={selectedEmployeeInsuranceDetails}
      />

      <EmployeeFormModal
        open={employeeModalState.open}
        mode={employeeModalState.mode}
        initialEmployee={employeeModalState.employee}
        onClose={closeEmployeeEditor}
        onSubmit={handleEmployeeSubmit}
        submitError={employeeModalState.error}
        isSaving={isEmployeeSaving}
      />

      <BulkPdfImportPanel
        open={importPanelOpen}
        title={importPanelTitle}
        reviewItems={reviewItems}
        onClose={() => setImportPanelOpen(false)}
        onSaveItem={handleSaveReviewItem}
        onSkipItem={handleSkipReviewItem}
        onConfirmSelected={handleConfirmSelectedReviewItems}
        isSaving={isImportSaving}
      />
    </div>
  );
}
