import React from 'react';

export default function Sidebar({
  lang,
  setLanguage,
  pages,
  activePage,
  onNavigatePage,
  t,
  moduleLabel,
  currentUser,
  roleNames,
  showAdminLink,
  onOpenAdmin,
  onLogout,
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

      <div className="sidebar-section-label">{moduleLabel || 'Module'}</div>

      <div className="nav-list">
        {pages.map((page) => (
          <button
            key={page.key}
            type="button"
            className={`nav-item ${activePage === page.key ? 'active' : ''}`}
            onClick={() => onNavigatePage(page)}
          >
            <span>{lang === 'ar' ? page.ar : page.en}</span>
          </button>
        ))}
      </div>

      {showAdminLink ? (
        <>
          <div className="sidebar-section-label">Administration</div>
          <button type="button" className="nav-item" onClick={onOpenAdmin}>
            <span>System Administration</span>
          </button>
        </>
      ) : null}

      <div className="sidebar-user-card">
        <div>
          <div className="brand-title">{currentUser?.displayName || 'Authenticated user'}</div>
          <div className="brand-sub">{currentUser?.email || currentUser?.username || ''}</div>
        </div>
        <div className="summary-chip-row sidebar-role-row">
          {(roleNames || []).map((roleName) => (
            <span key={roleName} className="badge sidebar-badge">
              {roleName}
            </span>
          ))}
        </div>
        <button type="button" className="btn sidebar-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}
