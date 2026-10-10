import { useMemo, useState } from 'react';
import { encodeSave, decodeSave, levelStats, isLevelUnlocked, totalXp, grade, passwords, emptyProgress, taskXp } from '../game/progress.js';
import { Stars, copyText } from './common.jsx';

export default function ProgressView({ content, progress, replace }) {
  const code = useMemo(() => encodeSave(content, progress), [content, progress]);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const pw = passwords(content);
  const xp = totalXp(content, progress);

  const restore = (e) => {
    e.preventDefault();
    try {
      const p = decodeSave(content, input);
      p.drafts = progress.drafts;
      replace(p);
      setMsg({ text: 'Прогресс восстановлен из кода.' });
      setInput('');
    } catch (err) { setMsg({ bad: true, text: err.message }); }
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ app: 'sql-quest', version: 1, saved: new Date().toISOString(), progress }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sql-quest-progress.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'sql-quest' || !data.progress?.tasks) throw new Error();
      replace({ ...emptyProgress(), ...data.progress });
      setMsg({ text: `Прогресс загружен из файла ${f.name}.` });
    } catch { setMsg({ bad: true, text: 'Это не файл прогресса SQL Quest.' }); }
    e.target.value = '';
  };

  return (
    <div className="progress-page">
      <section className="pg-summary">
        <div>
          <h1>{grade(content, progress)}</h1>
          <p className="muted">Текущий грейд</p>
        </div>
        <div className="pg-xp"><b>{xp}</b><span>XP</span></div>
      </section>

      <section className="pg-levels" aria-label="Навыки по уровням">
        <h2>Навыки</h2>
        <table className="skills">
          <thead><tr><th>Уровень</th><th>Тикеты</th><th>Звёзды</th><th>Босс</th><th>XP</th></tr></thead>
          <tbody>
            {content.levels.map((l) => {
              const st = levelStats(l, progress);
              const open = isLevelUnlocked(content, progress, l.level);
              const lxp = l.tasks.reduce((s, t) => s + taskXp(t, progress.tasks[t.id]), 0);
              return (
                <tr key={l.level} className={open ? '' : 'locked'}>
                  <td><b>{l.level}. {l.title}</b></td>
                  <td>
                    <span className="bar" aria-hidden="true"><span style={{ width: `${Math.round(st.share * 100)}%` }} /></span>
                    {st.solved} из {st.total}
                  </td>
                  <td><Stars n={Math.round((st.stars / st.maxStars) * 3)} /> <span className="muted">{st.stars}/{st.maxStars}</span></td>
                  <td>{st.bossSolved ? 'пройден' : open ? 'впереди' : 'закрыт'}</td>
                  <td>{lxp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="save" aria-label="Код сохранения">
        <h2>Код сохранения</h2>
        <p>Код хранит весь прогресс: решённые тикеты, звёзды и подсказки. Скопируй его и вставь на другом устройстве — или сохрани в заметках. Сервера у игры нет, поэтому прогресс живёт только в этом браузере и в коде.</p>
        <div className="code-box">
          <code>{code}</code>
          <button className="btn small" onClick={() => copyText(code).then((ok) => setCopied(ok !== false))}>{copied ? 'Скопировано' : 'Скопировать код'}</button>
        </div>
        <form onSubmit={restore} className="restore">
          <label htmlFor="restore-input">Восстановить из кода</label>
          <textarea id="restore-input" rows={3} value={input} onChange={(e) => { setInput(e.target.value); setMsg(null); }} placeholder="Вставь код сохранения" spellCheck="false" />
          <div className="row">
            <button className="btn" type="submit" disabled={!input.trim()}>Восстановить</button>
            <button className="btn ghost" type="button" onClick={exportFile}>Скачать файл .json</button>
            <label className="btn ghost file-btn">Загрузить файл<input type="file" accept="application/json,.json" onChange={importFile} /></label>
          </div>
          {msg && <p className={msg.bad ? 'bad' : 'ok'} role="status">{msg.text}</p>}
        </form>
      </section>

      <section className="pwlist" aria-label="Пароли уровней">
        <h2>Пароли уровней</h2>
        <p className="muted">Пароль открывает уровень и все предыдущие на любом устройстве — без звёзд и опыта.</p>
        <ul>
          {content.levels.filter((l) => l.level > 0).map((l) => {
            const open = isLevelUnlocked(content, progress, l.level);
            return (
              <li key={l.level}>
                <span>Уровень {l.level}. {l.title}</span>
                {open ? <code>{pw[l.level]}</code> : <span className="muted">откроется после босса уровня {l.level - 1}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="danger-zone">
        {!confirmReset ? (
          <button className="link-btn bad" onClick={() => setConfirmReset(true)}>Сбросить прогресс</button>
        ) : (
          <div className="row">
            <span>Все решения и звёзды будут удалены из этого браузера. Сначала сохрани код, если он может пригодиться.</span>
            <button className="btn small danger" onClick={() => { replace(emptyProgress()); setConfirmReset(false); setMsg({ text: 'Прогресс сброшен.' }); }}>Сбросить</button>
            <button className="btn small ghost" onClick={() => setConfirmReset(false)}>Отмена</button>
          </div>
        )}
      </section>
    </div>
  );
}
