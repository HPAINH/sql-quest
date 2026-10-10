
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
  for (let i = 0; i < t.length; i++) {
    const w = t[i], nx = t[i + 1];
    if (w === 'exists' && nx === '(') f.add('exists');
    if (w === 'on' && nx === 'conflict') f.add('on_conflict');
    if ((w === 'any' || w === 'all' || w === 'some') && nx === '(') f.add('any_all');
    if (w === 'within' && nx === 'group') f.add('within_group');
    if (w === 'rollup' || w === 'cube' || (w === 'grouping' && nx === 'sets')) f.add('grouping_sets');
    if (w === 'create' && (nx === 'index' || (nx === 'unique' && t[i + 2] === 'index'))) f.add('create_index');
  }
  for (const w of ['having', 'limit', 'offset', 'distinct', 'where', 'case', 'between', 'like', 'ilike', 'union', 'intersect', 'except', 'coalesce', 'recursive', 'returning', 'insert', 'update', 'delete', 'lag', 'lead', 'ntile', 'first_value', 'last_value', 'row_number', 'rank', 'dense_rank', 'rows', 'range']) if (has(w)) f.add(w);
  if (t[0] === 'with') f.add('cte');
  if (f.has('ilike')) f.add('like');
  return f;
}

export const FEATURE_NAMES = {
  join: 'JOIN', left_join: 'LEFT JOIN', group_by: 'GROUP BY', order_by: 'ORDER BY', window: 'оконную функцию (OVER)',
  subquery: 'подзапрос', filter: 'FILTER', in: 'IN', having: 'HAVING', limit: 'LIMIT', distinct: 'DISTINCT', where: 'WHERE',
  case: 'CASE', between: 'BETWEEN', like: 'LIKE/ILIKE', union: 'UNION', cte: 'WITH (CTE)', cross_join: 'CROSS JOIN',
  exists: 'EXISTS', on_conflict: 'ON CONFLICT', any_all: 'ANY / ALL', within_group: 'WITHIN GROUP', grouping_sets: 'ROLLUP / CUBE / GROUPING SETS',
  create_index: 'CREATE INDEX', recursive: 'WITH RECURSIVE', returning: 'RETURNING', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE',
  lag: 'LAG', lead: 'LEAD', ntile: 'NTILE', first_value: 'FIRST_VALUE', last_value: 'LAST_VALUE', row_number: 'ROW_NUMBER', rank: 'RANK', dense_rank: 'DENSE_RANK',
  rows: 'рамку ROWS', range: 'рамку RANGE', intersect: 'INTERSECT', except: 'EXCEPT',
};

const TX_WORDS = new Set(['begin', 'start', 'commit', 'end', 'rollback', 'abort', 'prepare', 'copy', 'vacuum', 'checkpoint', 'load', 'discard', 'listen', 'notify', 'release']);

export function statements(sql) {
  return stripSql(sql).split(';').map((x) => x.trim()).filter(Boolean);
}

export function guard(sql, mode = 'read') {
  const stripped = stripSql(sql).trim();
  if (!stripped) return mode === 'write' ? 'Скрипт пуст — напиши команду.' : 'Запрос пуст — напиши SELECT.';
  const t = tokens(sql);
  if (mode === 'write') {
    if (/(^|[^a-z_])shop_h([^a-z_]|$)/i.test(stripped)) return 'Эта схема служебная и недоступна в заданиях.';
    if (stripped.includes('___')) return 'В скрипте остались пропуски ___ — заполни их.';
    for (const st of statements(sql)) {
      const first = (tokens(st)[0] || '');
      if (TX_WORDS.has(first)) return `Команду ${first.toUpperCase()} здесь использовать нельзя: игра сама открывает транзакцию перед твоим скриптом и откатывает её после проверки.`;
    }
    if (statements(sql).length > 12) return 'Слишком много команд в одном скрипте — уложись в 12.';
    return null;
  }
  const body = t.filter((x) => x !== ';');
  const semis = t.filter((x) => x === ';').length;
  if (semis > 1 || (semis === 1 && t[t.length - 1] !== ';')) return 'В одной попытке можно выполнить только один запрос. Убери лишнюю точку с запятой.';
  if (!['select', 'with', 'values', 'table', '('].includes(body[0])) return 'В игре выполняются только запросы на чтение — начни с SELECT или WITH.';
  if (/(^|[^a-z_])shop_h([^a-z_]|$)/i.test(stripped) || t.includes('pg_read_file')) return 'Эта схема служебная и недоступна в заданиях.';
  if (stripped.includes('___')) return 'В запросе остались пропуски ___ — заполни их.';
  return null;
}
