import React from 'react';

export default function TopToolbar({
  lang,
  t,
  sourceName,
  searchValue,
  onSearchChange,
  onClearSearch,
  onImportExcel,
  onImportPdfs,
  onImportPdfFolder,
  onUseSample,
  onExportCleaned,
  onResetData,
  pdfCount,
}) {
  return (
    <div className="top-toolbar">
      <div className="toolbar-group">
        <button type="button" className="btn primary" onClick={onImportExcel}>{t(lang, 'importExcel')}</button>
        <button type="button" className="btn" onClick={onImportPdfs}>{t(lang, 'importPdfs')}</button>
        <button type="button" className="btn" onClick={onImportPdfFolder}>{t(lang, 'importPdfFolder')}</button>
        <button type="button" className="btn" onClick={onUseSample}>{t(lang, 'useSample')}</button>
        <button type="button" className="btn" onClick={onExportCleaned}>{t(lang, 'exportCleaned')}</button>
        <button type="button" className="btn ghost" onClick={onResetData}>{t(lang, 'resetData')}</button>
      </div>

      <div className="toolbar-group">
        <input
          type="search"
          className="side-panel-input"
          style={{ minHeight: 36, borderRadius: 10, border: '1px solid var(--line)', padding: '6px 10px', minWidth: 280 }}
          placeholder={t(lang, 'search')}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button type="button" className="btn ghost" onClick={onClearSearch}>{t(lang, 'clearSearch')}</button>
        <span className="source-badge">{t(lang, 'source')}: {sourceName || '-'}</span>
        <span className="source-badge">{t(lang, 'pdfCount')}: {pdfCount || 0}</span>
      </div>
    </div>
  );
}
