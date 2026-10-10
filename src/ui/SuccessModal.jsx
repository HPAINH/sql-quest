import { useEffect, useState } from 'react';
import { Modal, Stars, copyText } from './common.jsx';
import Editor from './Editor.jsx';

export default function SuccessModal({ task, level, content, solution, result, password, onClose, onNext }) {
  const [shown, setShown] = useState(0);
  const [xp, setXp] = useState(0);
  const [copied, setCopied] = useState(false);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stars = result.stars || 1;

  useEffect(() => {
    if (reduce) { setShown(stars); setXp(result.gained); return undefined; }
    const timers = [];
    for (let i = 1; i <= stars; i++) timers.push(setTimeout(() => setShown(i), 220 + i * 260));
    const steps = 18;
    for (let k = 1; k <= steps; k++) timers.push(setTimeout(() => setXp(Math.round((result.gained * k) / steps)), 200 + k * 35));
    return () => timers.forEach(clearTimeout);
  }, [stars, result.gained, reduce]);

  const nextLevel = result.unlockedLevel != null ? content.levels[result.unlockedLevel] : null;

  return (
    <Modal title={task.boss ? 'Инцидент закрыт' : 'Тикет закрыт'} onClose={onClose} wide className="success">
      <div className="sx-top">
        <div className="sx-stars" aria-label={`${stars} из 3 звёзд`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={`sx-star ${i <= shown ? 'lit' : ''} ${i <= stars ? '' : 'dim'}`}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></svg>
            </span>
          ))}
        </div>
        <div className="sx-xp"><b>+{xp}</b> XP</div>
      </div>
      <ul className="sx-rules">
        <li className="got">Решено</li>
        <li className={stars >= 2 ? 'got' : ''}>Без подсказок 3–5 и не больше двух ошибок</li>
        <li className={stars >= 3 ? 'got' : ''}>{task.bonus?.text || 'С первой попытки и без подсказок'}</li>
      </ul>
      {result.gained === 0 && result.rec?.hints >= 5 && <p className="muted">Опыт не начислен: открыт эталон. Попробуй решить задачу ещё раз позже — звёзды обновятся.</p>}

      {nextLevel && (
        <div className="promo">
          <h3>Повышение: открыт уровень {nextLevel.level} «{nextLevel.title}»</h3>
          {password && (
            <>
              <p>Пароль уровня — запиши его, чтобы открыть уровень на другом устройстве:</p>
              <div className="pw-show">
                <code>{password}</code>
                <button className="btn small ghost" onClick={() => copyText(password).then(() => setCopied(true))}>{copied ? 'Скопировано' : 'Скопировать'}</button>
              </div>
            </>
          )}
          <p className="muted">Звёзды и опыт пароль не переносит — для этого есть код сохранения в разделе «Прогресс».</p>
        </div>
      )}

      <div className="sx-solution">
        <h3>Как решил аналитик ShopData</h3>
        {solution.sql && <Editor value={solution.sql} readOnly minLines={2} ariaLabel="Эталонное решение" />}
        {solution.answer !== undefined && <p><b>Ответ: {solution.answer}</b></p>}
        <p>{solution.explain}</p>
        <p className="book-ref">Тема — глава {task.book_chapter} книги по SQL.</p>
      </div>

      <div className="modal-actions">
        <button className="btn primary" onClick={onNext} autoFocus>{nextLevel ? `К уровню ${nextLevel.level}` : 'Следующий тикет'}</button>
        <button className="btn ghost" onClick={onClose}>Остаться здесь</button>
      </div>
    </Modal>
  );
}
