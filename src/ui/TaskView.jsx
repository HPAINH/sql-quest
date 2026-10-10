import { useEffect, useMemo, useRef, useState } from 'react';
import { reveal } from '../engine/canon.js';
import { checkAttempt, execute, executeScript, explainQuery, liveSpec } from '../game/check.js';
import { describeSpec, fmt } from '../engine/plan.js';
import PlanView from './PlanView.jsx';
import { recordResult, isLevelUnlocked, isBossOpen, passwords, baseXp, levelStats } from '../game/progress.js';
import Editor from './Editor.jsx';
import ResultTable from './ResultTable.jsx';
import SchemaPanel from './SchemaPanel.jsx';
import Hints from './Hints.jsx';
import SuccessModal from './SuccessModal.jsx';
import { Markdown, Modal, TYPE_ABOUT, Stars } from './common.jsx';

export default function TaskView({ content, entry, progress, update, replace, dbReady, go }) {
  const { task, level } = entry;
  const rec = progress.tasks[task.id];
  const levelOpen = isLevelUnlocked(content, progress, level.level);
  const bossOpen = isBossOpen(content, progress, level);
  const solution = useMemo(() => JSON.parse(reveal(task.solution)), [task]);
  const hintsOpen = progress.hintsOpen?.[task.id] || 0;
  const [success, setSuccess] = useState(null);
  const [theory, setTheory] = useState(false);

  const idx = level.tasks.findIndex((t) => t.id === task.id);
  const prevT = level.tasks[idx - 1];
  const nextT = level.tasks[idx + 1];

  if (!levelOpen || (task.boss && !bossOpen)) {
    const st = levelStats(level, progress);
    return (
      <div className="locked-page">
        <h1>Этот тикет пока закрыт</h1>
        <p>{!levelOpen ? `Уровень ${level.level} откроется после босса уровня ${level.level - 1}.` : `Босс откроется, когда решишь ${st.need} из ${st.total} тикетов уровня. Сейчас решено ${st.solved}.`}</p>
        <button className="btn" onClick={() => go('#/')}>На карту</button>
      </div>
    );
  }

  const openHint = (n) => update((p) => { p.hintsOpen = p.hintsOpen || {}; p.hintsOpen[task.id] = Math.max(p.hintsOpen[task.id] || 0, n); });

  const onSolved = ({ bonus }) => {
    const p = structuredClone(progress);
    const wasOpen = content.levels.map((l) => isLevelUnlocked(content, p, l.level));
    const used = p.hintsOpen?.[task.id] || 0;
    const priorWrong = p.tasks[task.id]?.wrong || 0;
    const b = task.bonus ? bonus : used === 0 && priorWrong === 0;
    const result = recordResult(p, task, { solved: true, bonus: b, hintsUsed: used, wrong: priorWrong });
    const nowOpen = content.levels.map((l) => isLevelUnlocked(content, p, l.level));
    const lvl = nowOpen.findIndex((o, i) => o && !wasOpen[i]);
    replace(p);
    setSuccess({ ...result, bonus: b, unlockedLevel: lvl > 0 ? lvl : null });
  };

  const onWrong = () => update((p) => { recordResult(p, task, { solved: false }); });

  return (
    <div className="task-page">
      <div className="crumbs">
        <a href="#/" className="back">← Карта</a>
        <span className="crumb-level">Уровень {level.level}. {level.title}</span>
        <button className="link-btn" onClick={() => setTheory(true)}>Теория уровня</button>
        <span className="crumb-nav">
          {prevT && <a href={`#/task/${prevT.id}`} aria-label="Предыдущий тикет">‹</a>}
          <span>{idx + 1} / {level.tasks.length}</span>
          {nextT && (!nextT.boss || bossOpen) && <a href={`#/task/${nextT.id}`} aria-label="Следующий тикет">›</a>}
        </span>
      </div>

      <div className="task-grid">
        <aside className="ticket-col">
          <article className={`ticket ${task.boss ? 'boss' : ''}`}>
            <div className="ticket-top">
              <span className="customer">{task.customer}</span>
              <span className="ticket-kind">{task.boss ? 'Инцидент' : TYPE_ABOUT[task.type]}</span>
            </div>
            <h1>{task.title}</h1>
            <div className="ticket-text">{task.ticket.split('\n').map((p, i) => <p key={i}>{p}</p>)}</div>
            <div className="ticket-foot">
              <span className="reward">{baseXp(task)} XP</span>
              {rec?.solved && <span className="solved-tag"><Stars n={rec.stars} size={13} /> решено</span>}
              <span className="star-rule" title="Как получить звёзды">
                ★★★ — {task.bonus?.text || 'с первой попытки и без подсказок'}
              </span>
            </div>
            {task.expected && !['choose', 'write_dml'].includes(task.type) && (
              <div className="need-cols">
                <span className="muted">Колонки результата{task.expected.check_names ? '' : ' (имена не проверяются)'}:</span>
                <span className="chips">{task.expected.columns.map((c) => <code key={c}>{c}</code>)}</span>
                {task.expected.ordered && <span className="muted">Порядок строк важен.</span>}
              </div>
            )}
            {task.type === 'write_dml' && task.check === 'returning' && (
              <div className="need-cols">
                <span className="muted">Скрипт должен закончиться командой с RETURNING. Колонки:</span>
                <span className="chips">{task.expected.columns.map((c) => <code key={c}>{c}</code>)}</span>
              </div>
            )}
            {(task.type === 'optimize' || task.plan) && (
              <div className="need-cols plan-req">
                <span className="muted">{task.type === 'optimize' ? 'Результат должен остаться прежним, а план —' : 'После скрипта план этого запроса должен'}</span>
                <ul>{describeSpec(task.plan).map((t, i) => <li key={i}>{t}</li>)}</ul>
                {task.plan.max_cost_ratio ? <span className="muted">Стоимость сравнивается с исходным запросом на той же базе в момент проверки.</span> : null}
              </div>
            )}
          </article>

          {task.type === 'write_dml' && (task.verify || task.plan?.probe) && (
            <div className="verify-box">
              <h3>{task.verify ? 'Проверочный запрос' : 'Запрос, план которого проверяется'}</h3>
              <p className="muted">{task.verify ? 'Выполнится сразу после твоего скрипта, внутри той же транзакции. Затем всё откатится — база не изменится.' : 'После твоего скрипта игра посмотрит его план через EXPLAIN. Затем всё откатится.'}</p>
              <Editor value={task.verify || task.plan.probe} readOnly minLines={2} ariaLabel="Проверочный запрос" />
            </div>
          )}

          {task.type === 'target_table' && (
            <div className="target">
              <h3>Образец</h3>
              <ResultTable columns={task.preview.columns} rows={task.preview.rows} total={task.preview.total} compact />
            </div>
          )}

          <Hints task={task} opened={hintsOpen} onOpen={openHint} solution={hintsOpen >= 5 ? solution : null} solved={!!rec?.solved} />
          {task.tables.length > 0 && <SchemaPanel schema={content.schema} tables={task.tables} dbReady={dbReady} />}
        </aside>

        <section className="work-col">
          {task.type === 'predict' ? (
            <Predict task={task} onSolved={onSolved} onWrong={onWrong} solved={!!rec?.solved} />
          ) : task.type === 'choose' ? (
            <Choose task={task} onSolved={onSolved} onWrong={onWrong} />
          ) : (
            <Workbench task={task} content={content} progress={progress} update={update} dbReady={dbReady} onSolved={onSolved} onWrong={onWrong} />
          )}
        </section>
      </div>

      {success && (
        <SuccessModal
          task={task} level={level} content={content} solution={solution} result={success}
          password={success.unlockedLevel ? passwords(content)[success.unlockedLevel] : null}
          onClose={() => setSuccess(null)}
          onNext={() => {
            setSuccess(null);
            const nx = level.tasks.slice(idx + 1).find((t) => !t.boss || isBossOpen(content, progress, level));
            if (nx) go(`#/task/${nx.id}`);
            else if (success.unlockedLevel) go(`#/task/${content.levels[success.unlockedLevel].tasks[0].id}`);
            else go('#/');
          }}
        />
      )}
      {theory && (
        <Modal title={`Уровень ${level.level}. ${level.title}`} onClose={() => setTheory(false)} wide>
          <Markdown text={level.theory} />
          <p className="book-ref">Подробнее — в книге по SQL, глава {level.book_chapter}.</p>
        </Modal>
      )}
    </div>
  );
}

function Workbench({ task, content, progress, update, dbReady, onSolved, onWrong }) {
  const initial = progress.drafts?.[task.id] ?? task.start_sql ?? '';
  const [sql, setSql] = useState(initial);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const change = (v) => {
    setSql(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => update((p) => { p.drafts = p.drafts || {}; p.drafts[task.id] = v; }), 500);
  };

  const run = async () => {
    if (busy || !dbReady) return;
    setBusy('run');
    let r;
    if (task.type === 'write_dml') r = { script: await executeScript(task, sql) };
    else {
      r = await execute(sql);
      if (task.type === 'optimize' && r.rows) { const pl = await explainQuery(sql); const spec = await liveSpec(task); if (pl.plan) r.plan = { root: pl.plan, spec, baseline: spec.baseline }; }
    }
    setBusy(null);
    if (r.script?.blocked) r = { blocked: r.script.blocked };
    else if (r.script?.error) r = { error: r.script.error };
    setOut({ kind: 'run', ...r });
  };
  const check = async () => {
    if (busy || !dbReady) return;
    setBusy('check');
    const r = await checkAttempt(task, sql);
    setBusy(null);
    setOut({ kind: 'check', ...r });
    if (r.status === 'ok') onSolved({ bonus: r.bonus });
    else if (r.status === 'wrong' || r.status === 'error') onWrong();
  };
  const reset = () => change(task.start_sql ?? '');

  return (
    <div className="workbench">
      <div className="editor-box">
        <div className="editor-bar">
          <span className="muted">{task.type === 'write_dml' ? (task.start_sql ? 'Скрипт с ошибкой — исправь его. Выполняется в транзакции и откатывается' : 'Твой скрипт — выполняется в транзакции и откатывается') : task.type === 'optimize' ? 'Медленный запрос — ускорь его' : task.type === 'fix_bug' ? 'Запрос с ошибкой — исправь его' : task.type === 'fill_blank' ? 'Заполни пропуски ___' : 'Твой запрос'}</span>
          <button className="link-btn" onClick={reset} title="Вернуть исходный текст">Сбросить</button>
        </div>
        <Editor value={sql} onChange={change} onRun={run} onCheck={check} schema={content.schema} minLines={8} placeholder={task.type === 'write_dml' ? 'INSERT … / UPDATE … / DELETE … / CREATE INDEX …' : 'SELECT …'} />
      </div>
      <div className="actions">
        <button className="btn" onClick={run} disabled={!dbReady || !!busy} title="Ctrl + Enter">
          {busy === 'run' ? 'Выполняем…' : 'Выполнить'} <kbd>Ctrl ↵</kbd>
        </button>
        <button className="btn primary" onClick={check} disabled={!dbReady || !!busy} title="Ctrl + Shift + Enter">
          {busy === 'check' ? 'Проверяем…' : 'Проверить'} <kbd>Ctrl ⇧ ↵</kbd>
        </button>
        {!dbReady && <span className="muted">База ещё загружается…</span>}
      </div>
      <Output out={out} task={task} sql={sql} />
    </div>
  );
}

function ScriptTables({ script, task }) {
  if (!script) return null;
  const changed = (script.affected || []).filter((x) => x != null).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="run-meta">Команд выполнено: {script.affected?.length ?? 0}, строк изменено: {changed}, {script.ms} мс. После проверки всё откатилось.</div>
      {script.last && <ResultTable caption="Последняя команда вернула" columns={script.last.columns} rows={script.last.rows} compact />}
      {script.verify && <ResultTable caption="Проверочный запрос после скрипта" columns={script.verify.columns} rows={script.verify.rows} compact />}
      {script.plan && <PlanView root={script.plan} spec={task.plan} caption="План проверяемого запроса после скрипта" />}
    </>
  );
}

function Output({ out, task, sql }) {
  if (!out) {
    return (
      <div className="output empty">
        <p>{task.type === 'write_dml'
          ? '«Выполнить» запустит скрипт, покажет, что он вернул и что видит проверочный запрос, а затем откатит изменения. «Проверить» сделает то же на видимых и на контрольных данных.'
          : task.type === 'optimize'
            ? '«Выполнить» покажет результат и план запроса со стоимостью. «Проверить» сравнит результат с ожидаемым и проверит план.'
            : '«Выполнить» покажет результат запроса. «Проверить» сравнит его с ожидаемым — на видимых и на контрольных данных.'}</p>
      </div>
    );
  }
  if (out.blocked || out.status === 'blocked') return <div className="output"><div className="verdict warn"><b>Запрос не выполнен.</b> {out.blocked || out.message}</div></div>;
  if (out.error) {
    const e = out.error;
    return (
      <div className="output">
        <div className="verdict bad" role="alert">
          <b>{e.title}</b>
          <p>{e.explain}</p>
          <pre className="pg-msg">{e.message}{e.position ? `\n${caret(sql, e.position)}` : ''}</pre>
          {out.detectors?.length > 0 && <Detectors list={out.detectors} />}
        </div>
      </div>
    );
  }
  const res = out.result || out;
  if (out.kind === 'run') {
    if (out.script) return <div className="output"><ScriptTables script={out.script} task={task} /></div>;
    return (
      <div className="output">
        <div className="run-meta">{res.rows.length} {rowsWord(res.rows.length)}, {res.ms} мс</div>
        {out.plan && <PlanView root={out.plan.root} spec={out.plan.spec || task.plan} baseline={out.plan.baseline} />}
        <ResultTable columns={res.columns} rows={res.rows} />
      </div>
    );
  }
  if (out.status === 'ok') {
    return (
      <div className="output">
        <div className="verdict ok" role="status"><b>Верно.</b> {task.type === 'write_dml' ? (task.check === 'plan' ? 'План запроса стал таким, как нужно.' : 'Состояние данных после скрипта совпало на видимых и на контрольных данных.') : task.type === 'optimize' ? 'Результат прежний, план — нужный.' : 'Результат совпал на видимых и на контрольных данных.'}</div>
        {out.plan && <PlanView root={out.plan.root} spec={out.plan.spec || task.plan} baseline={out.plan.baseline} />}
        {out.script ? <ScriptTables script={out.script} task={task} /> : res?.rows && <ResultTable columns={res.columns} rows={res.rows} />}
      </div>
    );
  }
  const v = out.verdict;
  return (
    <div className="output">
      <div className="verdict bad" role="alert">
        <b>Пока не то.</b> <span>{v.message}</span>
        {out.detectors?.length > 0 && <Detectors list={out.detectors} />}
      </div>
      {out.plan && <PlanView root={out.plan.root} spec={out.plan.spec || task.plan} baseline={out.plan.baseline} />}
      {(v.extra?.length > 0 || v.missing?.length > 0) && (
        <div className="diff">
          {v.missing?.length > 0 && <ResultTable caption={`Не хватает строк: ${v.missingTotal}${v.missingTotal > v.missing.length ? ' (показаны первые 20)' : ''}`} columns={task.expected.columns} rows={v.missing} mark="miss" compact />}
          {v.extra?.length > 0 && <ResultTable caption={`Лишние строки: ${v.extraTotal}${v.extraTotal > v.extra.length ? ' (показаны первые 20)' : ''}`} columns={out.result?.columns || task.expected.columns} rows={v.extra} mark="extra" compact />}
        </div>
      )}
      {out.script && <ScriptTables script={out.script} task={task} />}
      {!out.script && out.result?.rows && (
        <details className="your-result">
          <summary>Твой результат: {out.result.rows.length} {rowsWord(out.result.rows.length)}</summary>
          <ResultTable columns={out.result.columns} rows={out.result.rows} compact />
        </details>
      )}
    </div>
  );
}

function Detectors({ list }) {
  return (
    <div className="detectors">
      {list.map((d, i) => <p key={i}><span className="det-tag">Подсказка</span>{d}</p>)}
    </div>
  );
}

function caret(sql, pos) {
  const upto = sql.slice(0, pos - 1);
  const lineStart = upto.lastIndexOf('\n') + 1;
  const lineEnd = sql.indexOf('\n', pos - 1);
  const line = sql.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  return `${line}\n${' '.repeat(Math.max(0, pos - 1 - lineStart))}^`;
}

const rowsWord = (n) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'строка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'строки';
  return 'строк';
};

function Predict({ task, onSolved, onWrong, solved }) {
  const correct = useMemo(() => JSON.parse(reveal(task.answer)), [task]);
  const [wrong, setWrong] = useState([]);
  const [done, setDone] = useState(false);
  const pick = (i) => {
    if (done) return;
    if (correct.includes(i)) { setDone(true); onSolved({ bonus: true }); }
    else { setWrong((w) => [...w, i]); onWrong(); }
  };
  return (
    <div className="quiz">
      <div className="editor-box"><div className="editor-bar"><span className="muted">Запрос</span></div><Editor value={task.query} readOnly minLines={3} ariaLabel="Запрос для прогноза" /></div>
      <h3 className="quiz-q">{task.ask === 'rows' ? 'Сколько строк вернёт запрос?' : 'Какое значение вернёт запрос?'}</h3>
      <div className="options grid">
        {task.options.map((o, i) => {
          const isWrong = wrong.includes(i);
          const isRight = (done || solved) && correct.includes(i);
          return (
            <button key={i} className={`option ${isWrong ? 'wrong' : ''} ${isRight ? 'right' : ''}`} onClick={() => pick(i)} disabled={isWrong || done}>
              <span className="opt-val">{o}</span>
              {isWrong && <span className="opt-note">нет</span>}
              {isRight && <span className="opt-note">верно</span>}
            </button>
          );
        })}
      </div>
      {wrong.length > 0 && !done && <p className="muted">Подумай ещё — подсказки слева помогут разобраться.</p>}
    </div>
  );
}

function Choose({ task, onSolved, onWrong }) {
  const correct = useMemo(() => JSON.parse(reveal(task.answer)), [task]);
  const [sel, setSel] = useState([]);
  const [state, setState] = useState(null);
  const toggle = (i) => { setState(null); setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); };
  const submit = () => {
    const ok = sel.length === correct.length && sel.every((i) => correct.includes(i));
    if (ok) { setState('ok'); onSolved({ bonus: true }); }
    else {
      const missed = correct.filter((i) => !sel.includes(i)).length;
      const extra = sel.filter((i) => !correct.includes(i)).length;
      setState({ missed, extra });
      onWrong();
    }
  };
  return (
    <div className="quiz">
      <h3 className="quiz-q">{task.multi ? 'Верных вариантов несколько — отметь все.' : 'Отметь верный вариант.'}</h3>
      <div className="options">
        {task.options.map((o, i) => (
          <label key={i} className={`option sql-opt ${sel.includes(i) ? 'sel' : ''} ${state === 'ok' && correct.includes(i) ? 'right' : ''}`}>
            <input type="checkbox" checked={sel.includes(i)} onChange={() => toggle(i)} disabled={state === 'ok'} />
            <span className="opt-letter">{String.fromCharCode(1040 + i)}</span>
            <div className="opt-sql"><Editor value={o} readOnly minLines={1} ariaLabel={`Вариант ${i + 1}`} /></div>
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={submit} disabled={!sel.length || state === 'ok'}>Проверить выбор</button>
      </div>
      {state && state !== 'ok' && (
        <div className="verdict bad" role="alert">
          <b>Не совсем.</b>{' '}
          {state.extra > 0 && `Среди отмеченных есть неверные (${state.extra}). `}
          {state.missed > 0 && `Отмечены не все верные — пропущено ${state.missed}.`}
        </div>
      )}
    </div>
  );
}
