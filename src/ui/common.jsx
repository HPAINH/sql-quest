import { useEffect, useRef } from 'react';

export const TYPE_LABEL = {
  write_query: 'запрос',
  target_table: 'образец',
  fix_bug: 'баг',
  predict: 'прогноз',
  fill_blank: 'пропуск',
  choose: 'выбор',
  optimize: 'ускорение',
  write_dml: 'скрипт',
};

export const TYPE_ABOUT = {
  write_query: 'Напиши запрос по тикету',
  target_table: 'Получи таблицу как на образце',
  fix_bug: 'Найди и исправь ошибку',
  predict: 'Предскажи результат',
  fill_blank: 'Заполни пропуски',
  choose: 'Выбери верные запросы',
  optimize: 'Ускорь запрос',
  write_dml: 'Измени данные скриптом',
};

export function Stars({ n = 0, max = 3, size = 14 }) {
  return (
    <span className="stars" aria-label={`${n} из ${max} звёзд`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" width={size} height={size} className={i < n ? 'on' : ''} aria-hidden="true">
          <path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function Markdown({ text }) {
  const blocks = [];
  const lines = (text || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push(<pre className="md-code" key={blocks.length}><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''));
      blocks.push(<ul key={blocks.length}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^\s*-\s+/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={blocks.length}>{inline(buf.join(' '))}</p>);
  }
  return <div className="md">{blocks}</div>;
}

function inline(s) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const tok = m[0];
    parts.push(tok.startsWith('**') ? <b key={k++}>{tok.slice(2, -2)}</b> : <code key={k++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

export function Modal({ title, onClose, children, wide, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
