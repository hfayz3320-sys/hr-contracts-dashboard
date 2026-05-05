import React from 'react';

export default function TopFilterRow({
  lang,
  t,
  filtersDraft,
  updateDraftFilter,
  applyFilters,
  resetFilters,
  options,
}) {
  return (
    <div className="page-card top-filter-row-card">
      <div className="top-filter-row-header">
        <strong>{lang === 'ar' ? 'فلاتر عامة' : 'Global Filters'}</strong>
      </div>

      <div className="top-filter-grid">
        <div className="field">
          <label>{t(lang, 'nationality')}</label>
          <select
            value={filtersDraft.nationality}
            onChange={(event) => updateDraftFilter('nationality', event.target.value)}
          >
            <option value="all">{t(lang, 'all')}</option>
            {options.nationalities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>{t(lang, 'profession')}</label>
          <select
            value={filtersDraft.jobTitle || filtersDraft.profession}
            onChange={(event) => {
              updateDraftFilter('jobTitle', event.target.value);
              updateDraftFilter('profession', event.target.value);
            }}
          >
            <option value="all">{t(lang, 'all')}</option>
            {(options.jobTitles || options.professions).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>{t(lang, 'contractStatus')}</label>
          <select
            value={filtersDraft.contractStatus}
            onChange={(event) => updateDraftFilter('contractStatus', event.target.value)}
          >
            <option value="all">{t(lang, 'all')}</option>
            <option value="Active">{t(lang, 'active')}</option>
            <option value="Expired">{t(lang, 'expired')}</option>
            <option value="ExpiringSoon">{t(lang, 'expiringSoon')}</option>
          </select>
        </div>

        <div className="field">
          <label>
            {t(lang, 'startDateRange')} ({t(lang, 'from')})
          </label>
          <input
            type="date"
            value={filtersDraft.startFrom}
            onChange={(event) => updateDraftFilter('startFrom', event.target.value)}
          />
        </div>

        <div className="field">
          <label>
            {t(lang, 'startDateRange')} ({t(lang, 'to')})
          </label>
          <input
            type="date"
            value={filtersDraft.startTo}
            onChange={(event) => updateDraftFilter('startTo', event.target.value)}
          />
        </div>

        <div className="field">
          <label>
            {t(lang, 'endDateRange')} ({t(lang, 'from')})
          </label>
          <input
            type="date"
            value={filtersDraft.endFrom}
            onChange={(event) => updateDraftFilter('endFrom', event.target.value)}
          />
        </div>

        <div className="field">
          <label>
            {t(lang, 'endDateRange')} ({t(lang, 'to')})
          </label>
          <input
            type="date"
            value={filtersDraft.endTo}
            onChange={(event) => updateDraftFilter('endTo', event.target.value)}
          />
        </div>

        <div className="top-filter-actions">
          <button type="button" className="apply-btn" onClick={applyFilters}>
            {t(lang, 'apply')}
          </button>
          <button type="button" className="btn ghost" onClick={resetFilters}>
            {t(lang, 'resetFilters')}
          </button>
        </div>
      </div>
    </div>
  );
}
