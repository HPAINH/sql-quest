const NAV = [
  ['map', 'Карта', '#/'],
  ['sandbox', 'Песочница', '#/sandbox'],
  ['progress', 'Прогресс', '#/progress'],
];

export default function TopBar({ view, xp, grade, theme, setTheme, go }) {
  const active = view === 'task' ? 'map' : view;
  return (
    <header className="topbar">
      <a className="logo" href="#/" aria-label="SQL Quest — на карту">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <rect x="3" y="5" width="26" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3 12h26M12 12v15" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>SQL Quest</span>
      </a>
      <nav className="nav" aria-label="Разделы">
        {NAV.map(([id, label, hash]) => (
          <a key={id} href={hash} className={active === id ? 'on' : ''} aria-current={active === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      <div className="me">
        <button className="grade" onClick={() => go('#/progress')} title="Твой грейд и опыт">
          <span className="grade-name">{grade}</span>
          <span className="xp"><b>{xp}</b> XP</span>
        </button>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
          )}
        </button>
      </div>
    </header>
  );
}
