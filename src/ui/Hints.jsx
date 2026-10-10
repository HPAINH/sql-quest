import { useState } from 'react';
import { HINT_COST } from '../game/progress.js';
import Editor from './Editor.jsx';

const STEP_NAME = ['Направление', 'Таблицы и связи', 'План решения', 'Скелет запроса', 'Эталон с разбором'];

export default function Hints({ task, opened, onOpen, solution, solved }) {
  const [confirm, setConfirm] = useState(false);
  const steps = [...task.hints, null];
  const openNext = () => {
    if (opened === 4 && !solved) { setConfirm(true); return; }
    onOpen(opened + 1);
  };
  return (
    <section className="hints" aria-label="Подсказки">
      <div className="hints-head">
        <h3>Подсказки</h3>
        <span className="muted">{opened} из 5</span>
      </div>
      <ol className="hint-steps">
        {steps.map((h, i) => {
          const isOpen = i < opened;
          const isNext = i === opened;
          return (
            <li key={i} className={`hint ${isOpen ? 'open' : ''} ${isNext ? 'next' : ''}`}>
              <div className="hint-row">
                <span className="hint-n">{i + 1}</span>
                <span className="hint-name">{STEP_NAME[i]}</span>
                {!isOpen && <span className="hint-cost">{solved ? 'бесплатно' : HINT_COST[i + 1]}</span>}
              </div>
              {isOpen && i < 4 && <p className="hint-text">{h}</p>}
              {isOpen && i === 4 && solution && (
                <div className="hint-solution">
                  {solution.sql && <Editor value={solution.sql} readOnly minLines={2} ariaLabel="Эталонный запрос" />}
                  {solution.answer !== undefined && <p><b>Ответ: {solution.answer}</b></p>}
                  <p className="hint-text">{solution.explain}</p>
                </div>
              )}
              {isNext && !confirm && (
                <button className="btn small ghost" onClick={openNext}>Открыть подсказку {i + 1}</button>
              )}
              {isNext && confirm && (
                <div className="hint-confirm" role="alertdialog" aria-label="Подтверждение">
                  <p>Пятая подсказка покажет эталонное решение. Задача будет засчитана без опыта — 0 XP.</p>
                  <div className="row">
                    <button className="btn small danger" onClick={() => { setConfirm(false); onOpen(5); }}>Показать эталон</button>
                    <button className="btn small ghost" onClick={() => setConfirm(false)}>Попробую сам</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
