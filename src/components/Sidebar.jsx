import React from 'react';

export default function Sidebar({
  lang,
  setLanguage,
  pages,
  activePage,
  setActivePage,
  filtersDraft,
  updateDraftFilter,
  applyFilters,
  resetFilters,
  options,
  t,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/assets/logo.png" alt="logo" />
        <div>
          <div className="brand-title">{t(lang, 'appTitle')}</div>
          <div className="brand-sub">{t(lang, 'company')}</div>
        </div>
      </div>

      <div className="lang-switch">
        <button
          className={lang === 'ar' ? 'active' : ''}
          type="button"
          onClick={() => setLanguage('ar')}
        >
          AR
        </button>
        <button
          className={lang === 'en' ? 'active' : ''}
          type="button"
          onClick={() => setLanguage('en')}
        >
          EN
        </button>
      </div>

      <div className="nav-list">
        {pages.map((page) => (
          <button
            key={page.key}
            type="button"
            className={`nav-item ${activePage === page.key ? 'active' : ''}`}
            onClick={() => setActivePage(page.key)}
          >
            <span>{lang === 'ar' ? page.ar : page.en}</span>
          </button>
        ))}
      </div>

      <div className="side-panel">
        <h4>{lang === 'ar' ? 'الفلاتر' : 'Filters'}</h4>
        <div className="grid">
          <div>
            <label>{t(lang, 'nationality')}</label>
            <select
              value={filtersDraft.nationality}
              onChange={(e) => updateDraftFilter('nationality', e.target.value)}
            >
              <option value="all">{t(lang, 'all')}</option>
              {options.nationalities.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label>{t(lang, 'profession')}</label>
            <select
              value={filtersDraft.profession}
              onChange={(e) => updateDraftFilter('profession', e.target.value)}
            >
              <option value="all">{t(lang, 'all')}</option>
              {options.professions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label>{t(lang, 'contractStatus')}</label>
            <select
              value={filtersDraft.contractStatus}
              onChange={(e) => updateDraftFilter('contractStatus', e.target.value)}
            >
              <option value="all">{t(lang, 'all')}</option>
              <option value="Active">{t(lang, 'active')}</option>
              <option value="Expired">{t(lang, 'expired')}</option>
              <option value="ExpiringSoon">{t(lang, 'expiringSoon')}</option>
            </select>
          </div>

          <div>
            <label>{t(lang, 'startDateRange')} ({t(lang, 'from')})</label>
            <input
              type="date"
              value={filtersDraft.startFrom}
              onChange={(e) => updateDraftFilter('startFrom', e.target.value)}
            />
          </div>

          <div>
            <label>{t(lang, 'startDateRange')} ({t(lang, 'to')})</label>
            <input
              type="date"
              value={filtersDraft.startTo}
              onChange={(e) => updateDraftFilter('startTo', e.target.value)}
            />
          </div>

          <div>
            <label>{t(lang, 'endDateRange')} ({t(lang, 'from')})</label>
            <input
              type="date"
              value={filtersDraft.endFrom}
              onChange={(e) => updateDraftFilter('endFrom', e.target.value)}
            />
          </div>

          <div>
            <label>{t(lang, 'endDateRange')} ({t(lang, 'to')})</label>
            <input
              type="date"
              value={filtersDraft.endTo}
              onChange={(e) => updateDraftFilter('endTo', e.target.value)}
            />
          </div>

          <button type="button" className="apply-btn" onClick={applyFilters}>{t(lang, 'apply')}</button>
          <button type="button" className="btn ghost" onClick={resetFilters}>{t(lang, 'resetFilters')}</button>
        </div>
      </div>
    </aside>
  );
}
