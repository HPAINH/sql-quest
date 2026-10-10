import { useState } from 'react';
import { levelStats, isLevelUnlocked, isBossOpen, checkPassword } from '../game/progress.js';
import { TYPE_LABEL, Stars, Modal, Markdown } from './common.jsx';

export function nextTask(content, p) {
  for (const l of content.levels) {
    if (!isLevelUnlocked(content, p, l.level)) break;
    for (const t of l.tasks) {
      if (t.boss && !isBossOpen(content, p, l)) continue;
      if (!p.tasks[t.id]?.solved) return t;
    }
  }
  return null;
}

export default function MapView({ content, progress, update, go }) {
  const [theory, setTheory] = useState(null);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState(null);
  const next = nextTask(content, progress);
  const started = Object.keys(progress.tasks).length > 0;

  const submitPw = (e) => {
    e.preventDefault();
    const lvl = checkPassword(content, pw);
    if (lvl < 0) { setPwMsg({ bad: true, text: 'Такого пароля нет. Проверь буквы и дефис — например, JOIN-7K2Q.' }); return; }
    if (progress.unlocked >= lvl) { setPwMsg({ text: `Уровень ${lvl} уже открыт.` }); return; }
    update((p) => { p.unlocked = Math.max(p.unlocked, lvl); });
    setPwMsg({ text: `Открыты уровни до ${lvl}-го включительно.` });
    setPw('');
  };

  const cards = [
    ...content.levels.map((l) => {
      const open = isLevelUnlocked(content, progress, l.level);
      const st = levelStats(l, progress);
      const bossOpen = isBossOpen(content, progress, l);
      return { level: l.level, node: (
        <article key={l.level} style={{ order: l.level }} className={`er ${open ? '' : 'locked'}`} aria-label={`Уровень ${l.level}: ${l.title}`}>
          <header className="er-head">
            <div className="er-title">
              <span className="er-num">{l.level}</span>
              <div>
                <h2>{l.title}</h2>
                <span className="er-grade">{l.grade}</span>
              </div>
            </div>
            <button className="link-btn" onClick={() => setTheory(l)} disabled={!open}>Теория</button>
          </header>
          <p className="er-summary">{l.summary}</p>
          <div className="er-meta">
            <span>{st.solved} из {st.total} тикетов</span>
            <Stars n={Math.round((st.stars / st.maxStars) * 3)} />
          </div>
          <ol className="er-rows">
            {l.tasks.map((t) => {
              const rec = progress.tasks[t.id];
              const avail = open && (!t.boss || bossOpen);
              const cls = `er-row ${t.boss ? 'boss' : ''} ${rec?.solved ? 'solved' : ''} ${avail ? '' : 'na'}`;
              const body = (
                <>
                  <span className="er-type">{t.boss ? 'босс' : TYPE_LABEL[t.type]}</span>
                  <span className="er-name">{t.title}</span>
                  <span className="er-stars">{rec?.solved ? <Stars n={rec.stars} size={12} /> : t.boss && open && !bossOpen ? <span className="er-lock">ещё {st.need - st.solved}</span> : null}</span>
                </>
              );
              return (
                <li key={t.id}>
                  {avail ? <a className={cls} href={`#/task/${t.id}`}>{body}</a> : <span className={cls} aria-disabled="true">{body}</span>}
                </li>
              );
            })}
          </ol>
          {!open && <p className="er-locked-note">Откроется после босса уровня {l.level - 1} и 70% его тикетов.</p>}
        </article>
      ) };
    }),
    ...content.roadmap.map((r) => ({ level: r.level, node: (
      <article key={r.level} style={{ order: r.level }} className="er ghost" aria-label={`Уровень ${r.level}: ${r.title}, в разработке`}>
        <header className="er-head">
          <div className="er-title">
            <span className="er-num">{r.level}</span>
            <div><h2>{r.title}</h2><span className="er-grade">{r.grade}</span></div>
          </div>
          <span className="soon">в разработке</span>
        </header>
      </article>
    ) })),
  ];

  return (
    <div className="map">
      <section className="intro">
        <div className="intro-text">
          <h1>Схема твоей карьеры в ShopData</h1>
          <p>Ты — новый аналитик интернет-магазина. Коллеги присылают тикеты, а ты отвечаешь на них запросами к настоящему PostgreSQL, который работает прямо в браузере. Каждый уровень — таблица навыков, каждый босс — инцидент, после которого тебя повышают.</p>
          <div className="intro-actions">
            {next ? (
              <button className="btn primary" onClick={() => go(`#/task/${next.id}`)}>
                {started ? 'Продолжить' : 'Начать с первого тикета'}
                <span className="btn-sub">{next.title}</span>
              </button>
            ) : (
              <span className="done-note">Все открытые тикеты закрыты. Следующие уровни уже в разработке.</span>
            )}
          </div>
        </div>
        <form className="pw" onSubmit={submitPw}>
          <label htmlFor="pw-input">Пароль уровня</label>
          <div className="pw-row">
            <input id="pw-input" value={pw} onChange={(e) => { setPw(e.target.value); setPwMsg(null); }} placeholder="JOIN-7K2Q" autoComplete="off" spellCheck="false" />
            <button className="btn" type="submit" disabled={!pw.trim()}>Открыть</button>
          </div>
          <p className={`pw-msg ${pwMsg?.bad ? 'bad' : ''}`} role="status">{pwMsg?.text || 'Играешь на другом устройстве? Введи пароль, который получил при открытии уровня, — или восстанови всё кодом сохранения в разделе «Прогресс».'}</p>
        </form>
      </section>

      <section className="schema" aria-label="Уровни">
        {[0, 1].map((side) => (
          <div key={side} className={`stack ${side ? 'right' : 'left'}`}>
            {cards.filter((c) => c.level % 2 === side).map((c) => c.node)}
          </div>
        ))}
      </section>

      {theory && (
        <Modal title={`Уровень ${theory.level}. ${theory.title}`} onClose={() => setTheory(null)} wide>
          <Markdown text={theory.theory} />
          <p className="book-ref">Подробнее — в книге по SQL, глава {theory.book_chapter}.</p>
        </Modal>
      )}
    </div>
  );
}
