import { useCallback, useEffect, useMemo, useState } from 'react';
import content from './content/content.json';
import { initDb } from './db/client.js';
import { loadProgress, saveProgress, totalXp, grade } from './game/progress.js';
import TopBar from './ui/TopBar.jsx';
import MapView from './ui/MapView.jsx';
import TaskView from './ui/TaskView.jsx';
import Sandbox from './ui/Sandbox.jsx';
import ProgressView from './ui/ProgressView.jsx';
import Boot from './ui/Boot.jsx';

const parseHash = () => {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, arg] = h.split('/');
  if (view === 'task' && arg) return { view: 'task', id: decodeURIComponent(arg) };
  if (view === 'sandbox' || view === 'progress') return { view };
  return { view: 'map' };
};

export const taskIndex = {};
for (const l of content.levels) for (const t of l.tasks) taskIndex[t.id] = { task: t, level: l };

function readTheme() {
  try { return localStorage.getItem('sqlquest.theme') || 'dark'; } catch { return 'dark'; }
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [progress, setProgress] = useState(loadProgress);
  const [db, setDb] = useState({ state: 'loading', got: 0, total: 0 });
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sqlquest.theme', theme); } catch { }
  }, [theme]);

  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    initDb((m) => setDb((s) => ({ ...s, got: m.got, total: m.total, phase: m.phase })))
      .then(() => setDb({ state: 'ready' }))
      .catch((e) => setDb({ state: 'error', message: e.message }));
  }, []);

  const update = useCallback((fn) => {
    setProgress((p) => {
      const next = structuredClone(p);
      fn(next);
      saveProgress(next);
      return next;
    });
  }, []);

  const replace = useCallback((p) => { saveProgress(p); setProgress(p); }, []);

  const xp = useMemo(() => totalXp(content, progress), [progress]);
  const g = useMemo(() => grade(content, progress), [progress]);
  const go = (hash) => { location.hash = hash; };

  let page;
  if (route.view === 'task' && taskIndex[route.id]) {
    page = <TaskView key={route.id} content={content} entry={taskIndex[route.id]} progress={progress} update={update} replace={replace} dbReady={db.state === 'ready'} go={go} />;
  } else if (route.view === 'sandbox') {
    page = <Sandbox content={content} dbReady={db.state === 'ready'} />;
  } else if (route.view === 'progress') {
    page = <ProgressView content={content} progress={progress} replace={replace} update={update} go={go} />;
  } else {
    page = <MapView content={content} progress={progress} update={update} go={go} />;
  }

  return (
    <div className="app">
      <TopBar view={route.view} xp={xp} grade={g} theme={theme} setTheme={setTheme} go={go} />
      {db.state !== 'ready' && <Boot db={db} />}
      <main className="page">{page}</main>
    </div>
  );
}
