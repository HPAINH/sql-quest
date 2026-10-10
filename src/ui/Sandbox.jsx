import { useState } from 'react';
import { execute, explainQuery } from '../game/check.js';
import PlanView from './PlanView.jsx';
import Editor from './Editor.jsx';
import ResultTable from './ResultTable.jsx';
import SchemaPanel from './SchemaPanel.jsx';

const KEY = 'sqlquest.sandbox';
const START = `-- Песочница: любые запросы на чтение, без проверки.
-- Ctrl + Enter — выполнить.
SELECT c.name AS category, COUNT(*) AS products
FROM products AS p
JOIN categories AS c ON c.category_id = p.category_id
GROUP BY c.name
ORDER BY products DESC;`;

export default function Sandbox({ content, dbReady }) {
  const [sql, setSql] = useState(() => { try { return localStorage.getItem(KEY) || START; } catch { return START; } });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const change = (v) => { setSql(v); try { localStorage.setItem(KEY, v); } catch { } };
  const run = async () => {
    if (busy || !dbReady) return;
    setBusy(true);
    setOut(await execute(sql));
    setBusy(false);
  };
  const plan = async () => {
    if (busy || !dbReady) return;
    setBusy(true);
    const r = await explainQuery(sql);
    setOut(r.error ? { error: r.error } : { plan: r.plan });
    setBusy(false);
  };
  return (
    <div className="sandbox">
      <aside className="ticket-col">
        <div className="sandbox-intro">
          <h1>Песочница</h1>
          <p>Та же база ShopData, что в заданиях, — 16 таблиц. Экспериментируй сколько угодно: запросы выполняются в режиме только для чтения, данные не изменятся.</p>
        </div>
        <SchemaPanel schema={content.schema} tables={[]} dbReady={dbReady} title="Схема ShopData" allowAll={false} />
      </aside>
      <section className="work-col">
        <div className="editor-box">
          <div className="editor-bar"><span className="muted">Запрос</span><button className="link-btn" onClick={() => change(START)}>Пример</button></div>
          <Editor value={sql} onChange={change} onRun={run} onCheck={run} schema={content.schema} minLines={10} />
        </div>
        <div className="actions">
          <button className="btn primary" onClick={run} disabled={!dbReady || busy}>{busy ? 'Выполняем…' : 'Выполнить'} <kbd>Ctrl ↵</kbd></button>
          <button className="btn" onClick={plan} disabled={!dbReady || busy}>Показать план</button>
        </div>
        <div className="output">
          {!out && <p className="muted">Результат появится здесь.</p>}
          {out?.blocked && <div className="verdict warn"><b>Запрос не выполнен.</b> {out.blocked}</div>}
          {out?.error && (
            <div className="verdict bad"><b>{out.error.title}</b><p>{out.error.explain}</p><pre className="pg-msg">{out.error.message}</pre></div>
          )}
          {out?.plan && <PlanView root={out.plan} />}
          {out?.rows && (
            <>
              <div className="run-meta">{out.rows.length} стр., {out.ms} мс</div>
              <ResultTable columns={out.columns} rows={out.rows} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
