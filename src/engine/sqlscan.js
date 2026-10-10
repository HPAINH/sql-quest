
export function stripSql(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === '-' && d === '-') { while (i < n && sql[i] !== '\n') i++; out += ' '; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === "'") {
      i++;
      while (i < n) { if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } if (sql[i] === "'") break; i++; }
      i++; out += " '' "; continue;
    }
    if (c === '$' && /[A-Za-z_$]/.test(d || '')) {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { const end = sql.indexOf(m[0], i + m[0].length); i = end < 0 ? n : end + m[0].length; out += " '' "; continue; }
    }
    out += c; i++;
  }
  return out;
}

export function tokens(sql) {
  const s = stripSql(sql).toLowerCase();
  return s.match(/"[^"]*"|[a-zа-яё_][a-zа-яё0-9_$]*|\d+(?:\.\d+)?|''|::|<>|!=|<=|>=|[(),.;*=<>+\-/%|]/giu) || [];
}

export function features(sql) {
  const t = tokens(sql);
  const f = new Set();
  const has = (w) => t.includes(w);
  for (let i = 0; i < t.length; i++) {
    const w = t[i], nx = t[i + 1];
    if (w === 'join') f.add('join');
    if (w === 'left' && (nx === 'join' || nx === 'outer')) f.add('left_join');
    if (w === 'cross' && nx === 'join') f.add('cross_join');
    if (w === 'group' && nx === 'by') f.add('group_by');
    if (w === 'order' && nx === 'by') f.add('order_by');
    if (w === 'over') f.add('window');
    if (w === '(' && nx === 'select') f.add('subquery');
    if (w === 'filter' && nx === '(') f.add('filter');
    if (w === 'in' && nx === '(') f.add('in');
  }
  for (const w of ['having', 'limit', 'offset', 'distinct', 'where', 'case', 'between', 'like', 'ilike', 'union', 'intersect', 'except', 'coalesce']) if (has(w)) f.add(w);
  if (t[0] === 'with') f.add('cte');
  if (f.has('ilike')) f.add('like');
  return f;
}

export const FEATURE_NAMES = {
  join: 'JOIN', left_join: 'LEFT JOIN', group_by: 'GROUP BY', order_by: 'ORDER BY', window: 'оконную функцию (OVER)',
  subquery: 'подзапрос', filter: 'FILTER', in: 'IN', having: 'HAVING', limit: 'LIMIT', distinct: 'DISTINCT', where: 'WHERE',
  case: 'CASE', between: 'BETWEEN', like: 'LIKE/ILIKE', union: 'UNION', cte: 'WITH (CTE)', cross_join: 'CROSS JOIN',
};

export function guard(sql) {
  const stripped = stripSql(sql).trim();
  if (!stripped) return 'Запрос пуст — напиши SELECT.';
  const t = tokens(sql);
  const body = t.filter((x) => x !== ';');
  const semis = t.filter((x) => x === ';').length;
  if (semis > 1 || (semis === 1 && t[t.length - 1] !== ';')) return 'В одной попытке можно выполнить только один запрос. Убери лишнюю точку с запятой.';
  if (!['select', 'with', 'values', 'table', '('].includes(body[0])) return 'В игре выполняются только запросы на чтение — начни с SELECT или WITH.';
  if (/(^|[^a-z_])shop_h([^a-z_]|$)/i.test(stripped) || t.includes('pg_read_file')) return 'Эта схема служебная и недоступна в заданиях.';
  if (stripped.includes('___')) return 'В запросе остались пропуски ___ — заполни их.';
  return null;
}
