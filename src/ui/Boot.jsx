export default function Boot({ db }) {
  if (db.state === 'error') {
    return (
      <div className="boot boot-error" role="alert">
        <b>База данных не загрузилась.</b> {db.message}. Обнови страницу; если не помогло — проверь подключение к интернету при первом запуске.
      </div>
    );
  }
  const pct = db.total && db.got <= db.total ? Math.round((db.got / db.total) * 100) : db.got ? 60 : 0;
  const mb = (x) => (x / 1e6).toFixed(1);
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="boot-label">
        {db.phase === 'start' ? 'Запускаем PostgreSQL в браузере…' : db.total && db.got <= db.total ? `Загружаем базу ShopData — ${mb(db.got)} из ${mb(db.total)} МБ` : db.got ? `Загружаем базу ShopData — ${mb(db.got)} МБ` : 'Готовим базу данных…'}
      </span>
      <span className="boot-bar"><span style={{ width: `${db.phase === 'start' ? 100 : pct}%` }} /></span>
    </div>
  );
}
