import React, { useEffect, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TopToolbar from './components/TopToolbar';
import EmployeeModal from './components/EmployeeModal';
import ExecutivePage from './pages/ExecutivePage';
import TalentPage from './pages/TalentPage';
import RiskPage from './pages/RiskPage';
import CompensationPage from './pages/CompensationPage';
import DataQualityPage from './pages/DataQualityPage';
import EmployeesPage from './pages/EmployeesPage';
import { pages, t } from './lib/i18n';
import { useDashboardStore } from './store/dashboardStore';
import { cleanDataset } from './utils/cleaning';
import {
  blobMapToObjectUrlMap,
  exportRowsToCsv,
  exportRowsToXlsx,
  parsePdfUploads,
  readSpreadsheetFile,
  readSpreadsheetFromUrl,
} from './utils/fileImport';
import {
  applyFilters as applyDataFilters,
  buildFilterOptions,
  paginateRows,
  sortRows,
} from './utils/filtering';
import {
  clearPdfBlobs,
  clearImportedDataset,
  loadImportedDataset,
  loadPdfBlobs,
  savePdfBlobs,
  saveImportedDataset,
} from './utils/persistence';
import {
  clearRemoteDataset,
  clearRemotePdfs,
  loadRemoteDataset,
  loadRemotePdfMap,
  saveRemoteDataset,
  uploadRemotePdfs,
} from './utils/remoteStorage';

const defaultSummary = {
  rowCount: 0,
  columnCount: 0,
  totalMissingValues: 0,
  criticalCount: 0,
  warningCount: 0,
  topIssues: [],
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
    source,
    sourceBase,
    sourceBase.replace(/\.[^.]+$/, '.pdf'),
    `${sourceBase}.pdf`,
    employee.Name,
    `${employee.Name || ''}.pdf`,
  ]
    .map((x) => x.trim())
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

function blobMapToUploadItems(blobMap) {
  const seen = new Set();
  const items = [];

  Object.entries(blobMap || {}).forEach(([key, blob]) => {
    if (!(blob instanceof Blob)) {
      return;
    }

    const fileName = basename(key);
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return;
    }

    const dedupeKey = `${fileName.toLowerCase()}::${blob.size}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    items.push({
      name: fileName,
      blob,
    });
  });

  return items;
}

export default function App() {
  const excelInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const pdfFolderInputRef = useRef(null);
  const pdfBlobMapRef = useRef({});

  const {
    language,
    activePage,
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

  useEffect(() => {
    document.documentElement.lang = language === 'ar' ? 'ar' : 'en';
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title =
      language === 'ar'
        ? `HR Contracts Dashboard | ${t('ar', 'company')}`
        : `HR Contracts Dashboard | ${t('en', 'company')}`;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        let rowsHydrated = false;

        const remoteSaved = await loadRemoteDataset();
        if (!cancelled && remoteSaved) {
          const remoteRows = Array.isArray(remoteSaved.rows) ? remoteSaved.rows : [];
          if (remoteRows.length) {
            const remoteIssues = Array.isArray(remoteSaved.issues) ? remoteSaved.issues : [];
            const remoteSummary = remoteSaved.importSummary || defaultSummary;
            const remoteSource = remoteSaved.sourceName || 'Imported';
            setRowsAndSummary(remoteRows, remoteIssues, remoteSummary, remoteSource);
            rowsHydrated = true;
          }
        }

        const saved = await loadImportedDataset();
        if (!cancelled && saved && !rowsHydrated) {
          const savedRows = Array.isArray(saved.rows) ? saved.rows : [];
          if (savedRows.length) {
            const savedIssues = Array.isArray(saved.issues) ? saved.issues : [];
            const savedSummary = saved.importSummary || defaultSummary;
            const savedSource = saved.sourceName || 'Imported';
            setRowsAndSummary(savedRows, savedIssues, savedSummary, savedSource);
            saveRemoteDataset(saved).catch((error) => console.warn(error));
          }
        }

        const remotePdfMap = await loadRemotePdfMap();
        if (!cancelled && remotePdfMap && Object.keys(remotePdfMap).length) {
          mergePdfMap(remotePdfMap);
        }

        const savedPdfBlobMap = await loadPdfBlobs();
        if (!cancelled && savedPdfBlobMap && Object.keys(savedPdfBlobMap).length) {
          pdfBlobMapRef.current = savedPdfBlobMap;
          mergePdfMap(blobMapToObjectUrlMap(savedPdfBlobMap));

          if (!Object.keys(remotePdfMap || {}).length) {
            const uploadItems = blobMapToUploadItems(savedPdfBlobMap);
            if (uploadItems.length) {
              const syncedRemotePdfMap = await uploadRemotePdfs(uploadItems);
              if (!cancelled && syncedRemotePdfMap && Object.keys(syncedRemotePdfMap).length) {
                mergePdfMap(syncedRemotePdfMap);
              }
            }
          }
        }
      } catch (error) {
        console.error(error);
      }
    };
    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [mergePdfMap, setRowsAndSummary]);

  const options = useMemo(() => buildFilterOptions(rows), [rows]);
  const pdfFileCount = useMemo(
    () => new Set(Object.values(pdfMap || {})).size,
    [pdfMap]
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

  useEffect(() => {
    if (page !== paged.page) {
      setPage(paged.page);
    }
  }, [page, paged.page, setPage]);

  const hydrateRows = async (rawRows, fileName) => {
    const { cleanedRows, issues: foundIssues, summary } = cleanDataset(rawRows);
    setRowsAndSummary(cleanedRows, foundIssues, summary, fileName);
    const payload = {
      rows: cleanedRows,
      issues: foundIssues,
      importSummary: summary,
      sourceName: fileName,
    };
    await saveImportedDataset(payload);
    await saveRemoteDataset(payload);
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
      const { rows: rawRows } = await readSpreadsheetFromUrl('/data/sample.xlsx');
      await hydrateRows(rawRows, 'sample.xlsx');
    } catch (error) {
      alert(t(language, 'sampleFailed'));
      console.error(error);
    }
  };

  const handleImportPdfsClick = () => {
    pdfInputRef.current?.click();
  };

  const handleImportPdfFolderClick = () => {
    pdfFolderInputRef.current?.click();
  };

  const handleImportPdfs = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files || files.length === 0) {
      return;
    }

    try {
      const { blobMap, urlMap, importedCount, uploadItems } = await parsePdfUploads(files);
      if (!importedCount) {
        alert(t(language, 'pdfImportEmpty'));
        return;
      }
      mergePdfMap(urlMap);
      pdfBlobMapRef.current = {
        ...pdfBlobMapRef.current,
        ...blobMap,
      };
      await savePdfBlobs(pdfBlobMapRef.current);
      const remotePdfMap = await uploadRemotePdfs(uploadItems);
      if (remotePdfMap && Object.keys(remotePdfMap).length) {
        mergePdfMap(remotePdfMap);
      }
      alert(t(language, 'pdfImportSuccess').replace('{count}', String(importedCount)));
    } catch (error) {
      alert(t(language, 'pdfImportFailed'));
      console.error(error);
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
      clearImportedDataset().catch((error) => console.error(error));
      clearPdfBlobs().catch((error) => console.error(error));
      clearRemoteDataset().catch((error) => console.error(error));
      clearRemotePdfs().catch((error) => console.error(error));
      pdfBlobMapRef.current = {};
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

  const handleExportFilteredCsv = () => {
    exportRowsToCsv(sortedRows, 'employees-filtered.csv');
  };

  const handleExportFilteredXlsx = () => {
    exportRowsToXlsx(sortedRows, 'employees-filtered.xlsx');
  };

  const currentPage = (() => {
    if (activePage === 'executive') {
      return <ExecutivePage rows={filteredRows} lang={language} t={t} />;
    }
    if (activePage === 'talent') {
      return <TalentPage rows={filteredRows} lang={language} />;
    }
    if (activePage === 'risk') {
      return <RiskPage rows={filteredRows} lang={language} />;
    }
    if (activePage === 'compensation') {
      return <CompensationPage rows={filteredRows} lang={language} />;
    }
    if (activePage === 'quality') {
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
        onExportCsv={handleExportFilteredCsv}
        onExportXlsx={handleExportFilteredXlsx}
      />
    );
  })();

  return (
    <div className={`dashboard-shell ${language === 'ar' ? 'is-ar' : 'is-en'}`}>
      <div className="content-wrap">
        <TopToolbar
          lang={language}
          t={t}
          sourceName={sourceName}
          searchValue={filtersDraft.search}
          onSearchChange={handleSearchChange}
          onClearSearch={handleClearSearch}
          onImportExcel={handleImportExcelClick}
          onImportPdfs={handleImportPdfsClick}
          onImportPdfFolder={handleImportPdfFolderClick}
          onUseSample={handleUseSample}
          onExportCleaned={handleExportCleaned}
          onResetData={handleResetData}
          pdfCount={pdfFileCount}
        />

        {!rows.length ? (
          <div className="page-card">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <div>
                <h1>{t(language, 'emptyStateTitle')}</h1>
                <p>{t(language, 'emptyStateHint')}</p>
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
        pages={pages}
        activePage={activePage}
        setActivePage={setActivePage}
        filtersDraft={filtersDraft}
        updateDraftFilter={updateDraftFilter}
        applyFilters={applyFilters}
        resetFilters={resetFilters}
        options={options}
        t={t}
      />

      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleImportExcelFile}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,.zip"
        multiple
        style={{ display: 'none' }}
        onChange={handleImportPdfs}
      />
      <input
        ref={pdfFolderInputRef}
        type="file"
        accept=".pdf"
        multiple
        directory=""
        webkitdirectory=""
        style={{ display: 'none' }}
        onChange={handleImportPdfs}
      />

      <EmployeeModal
        lang={language}
        t={t}
        employee={selectedEmployee}
        onClose={closeEmployee}
        pdfUrl={findPdfForEmployee(selectedEmployee, pdfMap)}
      />
    </div>
  );
}
