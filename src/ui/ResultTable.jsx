const SHOW = 200;

export default function ResultTable({ columns, rows, total, mark, caption, compact }) {
  const shown = rows.slice(0, SHOW);
  const n = total ?? rows.length;
  return (
    <div className={`rt-wrap ${compact ? 'compact' : ''}`}>
      {caption && <div className="rt-cap">{caption}</div>}
      <div className="rt-scroll" tabIndex={0} role="region" aria-label={caption || 'Результат запроса'}>
        <table className="rt">
          <thead>
            <tr>
              <th className="rt-idx" aria-label="Номер строки">#</th>
              {columns.map((c, i) => <th key={i}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={mark || ''}>
                <td className="rt-idx">{i + 1}</td>
                {r.map((v, j) => <td key={j} className={v === null ? 'null' : ''}>{v === null ? 'NULL' : v}</td>)}
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="rt-empty" colSpan={columns.length + 1}>Запрос не вернул ни одной строки</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {n > shown.length && <div className="rt-more">Показаны первые {shown.length} из {n} строк</div>}
    </div>
  );
}
