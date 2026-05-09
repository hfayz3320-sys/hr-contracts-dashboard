import React, { useMemo } from 'react';
import CollapsibleFilters from './filters/CollapsibleFilters';

/**
 * Global filters drawer (Executive / Talent / Risk / Compensation / Data Quality).
 *
 * The grid below is exactly what was previously rendered inline as a top
 * card; only the chrome around it changed — the children of the drawer
 * are the same field controls, so all selectors, validation, and apply/
 * reset wiring continue to work unchanged.
 */
export default function TopFilterRow({
  lang,
  t,
  filtersDraft,
  updateDraftFilter,
  applyFilters,
  resetFilters,
  options,
}) {
  // Active filter count = anything not at its empty/all default
  const activeCount = useMemo(() => {
    let n = 0;
    if (filtersDraft.nationality && filtersDraft.nationality !== 'all') n += 1;
    if ((filtersDraft.jobTitle && filtersDraft.jobTitle !== 'all')
        || (filtersDraft.profession && filtersDraft.profession !== 'all')) n += 1;
    if (filtersDraft.contractStatus && filtersDraft.contractStatus !== 'all') n += 1;
    if (filtersDraft.startFrom) n += 1;
    if (filtersDraft.startTo)   n += 1;
    if (filtersDraft.endFrom)   n += 1;
    if (filtersDraft.endTo)     n += 1;
    return n;
  }, [filtersDraft]);

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
      <CollapsibleFilters
        activeCount={activeCount}
        buttonLabel={lang === 'ar' ? 'الفلاتر' : 'Filters'}
        drawerTitle={lang === 'ar' ? 'فلاتر عامة' : 'Global Filters'}
        onApply={applyFilters}
        onClear={resetFilters}
      >
        <div className="top-filter-grid" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label>{t(lang, 'nationality')}</label>
            <select
              value={filtersDraft.nationality}
              onChange={(event) => updateDraftFilter('nationality', event.target.value)}
            >
              <option value="all">{t(lang, 'all')}</option>
              {options.nationalities.map((item) => (
                <option key={item} value={item}>{item}</option>
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
                <option key={item} value={item}>{item}</option>
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
            <label>{t(lang, 'startDateRange')} ({t(lang, 'from')})</label>
            <input type="date" value={filtersDraft.startFrom}
              onChange={(event) => updateDraftFilter('startFrom', event.target.value)} />
          </div>

          <div className="field">
            <label>{t(lang, 'startDateRange')} ({t(lang, 'to')})</label>
            <input type="date" value={filtersDraft.startTo}
              onChange={(event) => updateDraftFilter('startTo', event.target.value)} />
          </div>

          <div className="field">
            <label>{t(lang, 'endDateRange')} ({t(lang, 'from')})</label>
            <input type="date" value={filtersDraft.endFrom}
              onChange={(event) => updateDraftFilter('endFrom', event.target.value)} />
          </div>

          <div className="field">
            <label>{t(lang, 'endDateRange')} ({t(lang, 'to')})</label>
            <input type="date" value={filtersDraft.endTo}
              onChange={(event) => updateDraftFilter('endTo', event.target.value)} />
          </div>
        </div>
      </CollapsibleFilters>
    </div>
  );
}
