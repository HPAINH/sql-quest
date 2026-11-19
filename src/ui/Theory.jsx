import { useEffect, useMemo, useState } from 'react';
import { parseTheory, wordCount, isWriteSql } from '../engine/theory.js';
import { execute, executeScript, explainQuery } from '../game/check.js';
import { isLevelUnlocked, levelStats } from '../game/progress.js';
import ResultTable from './ResultTable.jsx';
import PlanView from './PlanView.jsx';

const KW = new Set(`select from where and or not in is null as on join left right full inner outer cross natural using group by order having limit offset distinct all any some exists between like ilike similar case when then else end union intersect except with recursive over partition rows range groups preceding following unbounded current row window filter within insert into values update set delete returning conflict do nothing create table index unique primary key foreign references check constraint alter add drop default cascade restrict begin commit rollback explain analyze asc desc nulls first last true false interval lateral materialized only if exclude ties fetch next view temp temporary column rename to type cluster concurrently grant revoke vacuum`.split(' '));

function highlight(code) {
  const out = [];
  const re = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)|(\s+|.)/g;
  let m, k = 0, plain = '';
  const flush = () => { if (plain) { out.push(plain); plain = ''; } };
  while ((m = re.exec(code))) {
    if (m[1]) { flush(); out.push(<span key={k++} className="hl-c">{m[1]}</span>); }
    else if (m[2]) { flush(); out.push(<span key={k++} className="hl-s">{m[2]}</span>); }
    else if (m[3]) { flush(); out.push(<span key={k++} className="hl-n">{m[3]}</span>); }
    else if (m[4]) {
      const w = m[4];
      if (KW.has(w.toLowerCase())) { flush(); out.push(<span key={k++} className="hl-k">{w}</span>); }
      else if (code[re.lastIndex] === '(') { flush(); out.push(<span key={k++} className="hl-f">{w}</span>); }
      else plain += w;
    } else plain += m[5];
  }
  flush();
  return out;
}

export function Inline({ text }) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*?[^*\s]\*|\[[^\]]+\]\(#[^)]+\))/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) parts.push(<b key={k++}><Inline text={t.slice(2, -2)} /></b>);
    else if (t.startsWith('`')) parts.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) { const mm = /^\[([^\]]+)\]\((#[^)]+)\)$/.exec(t); parts.push(<a key={k++} href={mm[2]}>{mm[1]}</a>); }
    else parts.push(<i key={k++}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function toSandbox(code, go) {
  try { localStorage.setItem('sqlquest.sandbox', code); } catch { }
  go('#/sandbox');
}

function RunResult({ out }) {
  if (!out) return null;
  if (out.busy) return <div className="run-out muted">Выполняю…</div>;
  if (out.blocked) return <div className="run-out"><div className="verdict warn"><b>Не выполнено.</b> {out.blocked}</div></div>;
  if (out.error) {
    return (
      <div className="run-out">
        <div className="verdict bad">
          <b>{out.error.title}</b>
          <p>{out.error.explain}</p>
          <pre className="pg-msg">{out.error.message}</pre>
        </div>
      </div>
    );
  }
  if (out.plan) return <div className="run-out"><PlanView root={out.plan} /></div>;
  if (out.script) {
    const t = out.script.last;
    return (
      <div className="run-out">
        <div className="run-meta">Скрипт выполнен за {out.script.ms} мс и откачен — данные не изменились.</div>
        {t ? <ResultTable columns={t.columns} rows={t.rows} compact /> : null}
      </div>
    );
  }
  return (
    <div className="run-out">
      <div className="run-meta">{out.rows.length} стр., {out.ms} мс</div>
      <ResultTable columns={out.columns} rows={out.rows} compact />
    </div>
  );
}

function CodeBlock({ lang, code, dbReady, go }) {
  const [out, setOut] = useState(null);
  const runnable = lang === 'sql' || lang === 'sql-error' || lang === 'sql-plan';
  const isSql = lang.startsWith('sql');
  const write = runnable && lang !== 'sql-plan' && isWriteSql(code);
  const run = async () => {
    setOut({ busy: true });
    if (lang === 'sql-plan') {
      const r = await explainQuery(code.replace(/^\s*EXPLAIN(\s*\([^)]*\))?(\s+ANALYZE)?\s+/i, ''));
      setOut(r.error ? { error: r.error } : { plan: r.plan });
    } else if (write) {
      const r = await executeScript({ verify: null }, code);
      setOut(r.error || r.blocked ? r : { script: r });
    } else {
      setOut(await execute(code));
    }
  };
  return (
    <figure className={`tcode ${lang}`}>
      {lang === 'sql-error' && <figcaption className="tcode-tag bad">Этот запрос с ошибкой — так делать не нужно</figcaption>}
      {lang === 'sql-static' && <figcaption className="tcode-tag">Фрагмент запроса</figcaption>}
      <pre><code>{isSql ? highlight(code) : code}</code></pre>
      {runnable && (
        <div className="tcode-bar">
          <button className="btn small" onClick={run} disabled={!dbReady || out?.busy}>
            {lang === 'sql-plan' ? '▶ Показать план' : write ? '▶ Выполнить и откатить' : lang === 'sql-error' ? '▶ Посмотреть ошибку' : '▶ Выполнить'}
          </button>
          {lang !== 'sql-plan' && !write && <button className="btn small ghost" onClick={() => toSandbox(code, go)}>В песочницу</button>}
          {out && !out.busy && <button className="link-btn" onClick={() => setOut(null)}>Скрыть результат</button>}
          {!dbReady && <span className="muted small">база загружается…</span>}
        </div>
      )}
      <RunResult out={out} />
    </figure>
  );
}

function Blocks({ blocks, dbReady, go }) {
  return blocks.map((b, k) => {
    switch (b.type) {
      case 'h3': return <h3 key={k}><Inline text={b.text} /></h3>;
      case 'p': return <p key={k}><Inline text={b.text} /></p>;
      case 'ul': return <ul key={k}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>;
      case 'ol': return <ol key={k}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ol>;
      case 'table':
        return (
          <div className="ttable-wrap" key={k}>
            <table className="ttable">
              <thead><tr>{b.head.map((h, j) => <th key={j}><Inline text={h} /></th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n}><Inline text={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      case 'code': return <CodeBlock key={k} lang={b.lang} code={b.code} dbReady={dbReady} go={go} />;
      case 'callout':
        return (
          <aside key={k} className={`callout ${b.kind}`}>
            <Blocks blocks={b.blocks} dbReady={dbReady} go={go} />
          </aside>
        );
      case 'qa':
        return (
          <details key={k} className="qa">
            <summary><span className="qa-q"><Inline text={b.q} /></span></summary>
            <div className="qa-body"><Blocks blocks={b.blocks} dbReady={dbReady} go={go} /></div>
          </details>
        );
      default: return null;
    }
  });
}

export function TheoryBody({ md, dbReady, go, prefix = 'th' }) {
  const t = useMemo(() => parseTheory(md), [md]);
  return (
    <div className="theory md">
      <Blocks blocks={t.intro} dbReady={dbReady} go={go} />
      {t.sections.map((s, n) => (
        <section key={s.id} id={`${prefix}-${s.id}`} className="tsection">
          <h2><span className="tsection-n">{n + 1}</span><Inline text={s.title} /></h2>
          <Blocks blocks={s.blocks} dbReady={dbReady} go={go} />
        </section>
      ))}
    </div>
  );
}

export function TheoryToc({ md, prefix = 'th', onPick }) {
  const t = useMemo(() => parseTheory(md), [md]);
  const jump = (id) => {
    const el = document.getElementById(`${prefix}-${id}`);
    if (!el) return;
    const box = el.closest('.modal');
    if (box) {
      const head = box.querySelector('.modal-head')?.offsetHeight || 0;
      box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - head - 8 });
    } else {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 72 });
    }
    onPick?.(id);
  };
  return (
    <ol className="ttoc">
      {t.sections.map((s) => (
        <li key={s.id}>
          <span className="toc-link" role="button" tabIndex={0} onMouseDown={(e) => e.preventDefault()} onClick={() => jump(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(s.id); } }}>
            <Inline text={s.title} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const minutes = (md) => Math.max(1, Math.round(wordCount(md) / 160));

export function LearnIndex({ content, progress, go }) {
  return (
    <div className="learn-index">
      <div className="learn-hero">
        <h1>Учебник</h1>
        <p>Теория всех двенадцати уровней: объяснения, примеры на данных ShopData, которые можно запустить прямо здесь, типичные ошибки, шпаргалки и вопросы для самопроверки. Читать можно в любом порядке — закрыты только тикеты.</p>
      </div>
      <div className="learn-cards">
        {content.levels.map((l, idx) => {
          const t = parseTheory(l.theory);
          const st = levelStats(l, progress);
          const open = isLevelUnlocked(content, progress, l.level);
          return (
            <a key={l.level} className="learn-card" href={`#/learn/${l.level}`}>
              <div className="learn-card-top">
                <span className="er-num">{l.level}</span>
                <span className="muted small">{l.grade} · {minutes(l.theory)} мин чтения</span>
              </div>
              <h2>{l.title}</h2>
              <p className="muted">{l.summary}</p>
              <ol className="learn-card-toc">{t.sections.slice(0, 7).map((s) => <li key={s.id}><Inline text={s.title} /></li>)}{t.sections.length > 7 && <li className="muted more">и ещё {t.sections.length - 7}</li>}</ol>
              <div className="learn-card-foot muted small">{open ? `Тикеты: решено ${st.solved} из ${st.total}` : 'Тикеты уровня пока закрыты'}</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function LearnView({ content, progress, levelNo, dbReady, go }) {
  const idx = content.levels.findIndex((l) => String(l.level) === String(levelNo));
  const level = content.levels[idx];
  useEffect(() => { window.scrollTo(0, 0); }, [levelNo]);
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches;
  if (!level) return <LearnIndex content={content} progress={progress} go={go} />;
  const prev = content.levels[idx - 1];
  const next = content.levels[idx + 1];
  const open = isLevelUnlocked(content, progress, level.level);
  const firstTask = level.tasks.find((t) => !t.boss && !progress.tasks[t.id]?.solved) || level.tasks[0];
  return (
    <div className="learn">
      <nav className="crumbs">
        <a className="back" href="#/learn">← Учебник</a>
        <span className="muted">Уровень {level.level} · {level.grade} · {minutes(level.theory)} мин чтения</span>
      </nav>
      <div className="learn-grid">
        <aside className="learn-side">
          <div className="learn-side-in">
            <details className="learn-toc" open={!narrow}>
              <summary className="rt-cap">Содержание</summary>
              <TheoryToc md={level.theory} prefix="lv" />
            </details>
            <div className="learn-side-act">
              {open
                ? <button className="btn primary small" onClick={() => go(`#/task/${firstTask.id}`)}>К тикетам уровня</button>
                : <span className="muted small">Тикеты откроются после босса предыдущего уровня</span>}
            </div>
          </div>
        </aside>
        <article className="learn-main">
          <header className="learn-head">
            <span className="er-num">{level.level}</span>
            <div>
              <h1>{level.title}</h1>
              <p className="muted">{level.summary}</p>
            </div>
          </header>
          <TheoryBody md={level.theory} dbReady={dbReady} go={go} prefix="lv" />
          <p className="book-ref">Подробнее — в книге по SQL, глава {level.book_chapter}.</p>
          <div className="learn-pager">
            {prev ? <a className="btn" href={`#/learn/${prev.level}`}>← {prev.level}. {prev.title}</a> : <span />}
            {open && <button className="btn primary" onClick={() => go(`#/task/${firstTask.id}`)}>Решать тикеты</button>}
            {next ? <a className="btn" href={`#/learn/${next.level}`}>{next.level}. {next.title} →</a> : <span />}
          </div>
        </article>
      </div>
    </div>
  );
}
