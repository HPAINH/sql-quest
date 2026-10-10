import { useState } from 'react';
import { execute } from '../game/check.js';
import ResultTable from './ResultTable.jsx';

export default function SchemaPanel({ schema, tables, dbReady, title = 'Таблицы', allowAll = true }) {
  const [all, setAll] = useState(!tables || tables.length === 0);
  const list = all ? schema : schema.filter((t) => tables.includes(t.name));
  return (
    <section className="schema-panel" aria-label={title}>
      <div className="sp-head">
        <h3>{title}</h3>
        {allowAll && tables?.length > 0 && (
          <button className="link-btn" onClick={() => setAll(!all)}>{all ? 'Только нужные' : 'Вся схема'}</button>
        )}
      </div>
      {list.map((t) => <TableCard key={t.name} t={t} dbReady={dbReady} defaultOpen={!all && list.length <= 2} />)}
    </section>
  );
}

function TableCard({ t, dbReady, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [preview, setPreview] = useState(null);
  const load = async () => {
    setPreview({ busy: true });
    const r = await execute(`SELECT * FROM ${t.name} LIMIT 5`);
    setPreview(r.error ? { error: r.error.message } : r);
  };
  return (
    <div className={`tcard ${open ? 'open' : ''}`}>
      <button className="tcard-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tcard-name">{t.name}</span>
        <span className="tcard-about">{t.about}</span>
        <span className="tcard-rows">{t.rows.toLocaleString('ru-RU')} стр.</span>
      </button>
      {open && (
        <div className="tcard-body">
          <ul className="cols">
            {t.columns.map((c) => (
              <li key={c.name}>
                <code>{c.name}</code>
                <span className="col-type">{c.type}</span>
                <span className="col-about">{c.about}</span>
              </li>
            ))}
          </ul>
          {!preview && <button className="btn small ghost" onClick={load} disabled={!dbReady}>Показать 5 строк</button>}
          {preview?.busy && <p className="muted">Загружаем…</p>}
          {preview?.error && <p className="bad">{preview.error}</p>}
          {preview?.rows && <ResultTable columns={preview.columns} rows={preview.rows} compact />}
        </div>
      )}
    </div>
  );
}
