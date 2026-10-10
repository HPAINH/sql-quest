import { stripSql, features, tokens } from './sqlscan.js';

const RULES = [
  {
    id: 'update_no_where',
    when: ({ text, verdict }) => verdict && !verdict.ok && /\b(update|delete)\b/i.test(stripSql(text)) && !/\bwhere\b|\busing\b/i.test(stripSql(text)),
    say: 'UPDATE или DELETE без WHERE меняет все строки таблицы. Каким условием ограничить изменение?',
  },
  {
    id: 'recursive_missing',
    when: ({ error, text }) => error?.code === '42P01' && /^\s*with\b/i.test(stripSql(text)) && !/\brecursive\b/i.test(stripSql(text)),
    say: 'Если CTE ссылается сам на себя, его нужно объявить как WITH RECURSIVE.',
  },
  {
    id: 'median',
    when: ({ error, text }) => error?.code === '42883' && /\bmedian\s*\(/i.test(stripSql(text)),
    say: 'Функции median в PostgreSQL нет. Медиана — percentile_cont(0.5) WITHIN GROUP (ORDER BY …).',
  },
  {
    id: 'fk_order',
    when: ({ error }) => error?.code === '23503',
    say: 'Удаляй в обратном порядке зависимостей: сначала строки, которые ссылаются, потом те, на которые ссылаются.',
  },
  {
    id: 'last_value_frame',
    when: ({ verdict, text }) => verdict && !verdict.ok && /\blast_value\s*\(/i.test(text) && !/\bunbounded\s+following\b/i.test(text),
    say: 'По умолчанию рамка окна заканчивается на текущей строке, поэтому LAST_VALUE возвращает её саму. Нужна рамка до UNBOUNDED FOLLOWING.',
  },
  {
    id: 'row_number_ties',
    when: ({ verdict, text }) => verdict?.reason === 'rows_less' && /\brow_number\s*\(/i.test(text),
    say: 'ROW_NUMBER даёт разные номера даже равным значениям и теряет ничьи. Если равные должны делить место — RANK или DENSE_RANK.',
  },
  {
    id: 'partition_missing',
    when: ({ verdict, text }) => verdict && !verdict.ok && /\bover\s*\(\s*order\s+by/i.test(stripSql(text)) && !/partition\s+by/i.test(text),
    say: 'В окне нет PARTITION BY — функция считается по всей таблице сразу. Нужно ли разбить строки на группы?',
  },
  {
    id: 'eq_null',
    when: ({ text }) => /(=|<>|!=)\s*null\b/i.test(text),
    say: 'Сравнение «= NULL» всегда даёт NULL. Может, нужен IS NULL или IS NOT NULL?',
  },
  {
    id: 'not_in_subquery',
    when: ({ text }) => /\bnot\s+in\s*\(\s*select\b/i.test(text),
    say: 'NOT IN с подзапросом ничего не вернёт, если в подзапросе встретится NULL. Проверь, может ли там быть NULL, — или используй NOT EXISTS.',
  },
  {
    id: 'double_quotes_value',
    when: ({ error }) => error?.code === '42703' && /"[^"]*[а-яё\s][^"]*"/i.test(error.message || ''),
    say: 'Похоже, текст записан в двойных кавычках. Значения пишутся в одинарных: \'Москва\'.',
  },
  {
    id: 'agg_in_where',
    when: ({ error, text }) => error?.code === '42803' && /\bwhere\b[^;]*\b(count|sum|avg|min|max)\s*\(/i.test(text),
    say: 'Агрегат стоит в WHERE. Условие на группу пишется в HAVING после GROUP BY.',
  },
  {
    id: 'grouping',
    when: ({ error }) => error?.code === '42803' && /must appear in the group by/i.test(error.message || ''),
    say: 'Колонка из сообщения не стоит в GROUP BY и не обёрнута в агрегат. Добавь её в GROUP BY — или убери из SELECT, если она не нужна.',
  },
  {
    id: 'ambiguous',
    when: ({ error }) => error?.code === '42702',
    say: 'Колонка есть в нескольких таблицах. Укажи таблицу перед именем — например, o.customer_id.',
  },
  {
    id: 'between_dates',
    when: ({ text, verdict }) => verdict?.reason === 'rows_less' && /between\s+''\s+and\s+''/i.test(stripSql(text)) && /\d{4}-\d{2}-\d{2}'/.test(text) && !/\d{4}-\d{2}-\d{2} \d/.test(text),
    say: 'BETWEEN по дате с временем обрывается в полночь последнего дня. Попробуй полуоткрытый интервал: >= начало AND < начало следующего периода.',
  },
  {
    id: 'like_case',
    when: ({ text, verdict }) => verdict?.reason === 'rows_less' && /\blike\b/i.test(stripSql(text)) && !/\bilike\b/i.test(stripSql(text)),
    say: 'LIKE различает регистр. Нет ли в данных тех же слов с другой буквы? ILIKE или lower(…) это решат.',
  },
  {
    id: 'and_or_mix',
    when: ({ text, verdict }) => verdict && !verdict.ok && /\band\b[^()]*\bor\b|\bor\b[^()]*\band\b/i.test(whereClause(text)),
    say: 'В условии смешаны AND и OR без скобок. AND выполняется раньше OR — точно ли условие читается так, как задумано?',
  },
  {
    id: 'fanout',
    when: ({ text, verdict, f }) => verdict?.reason === 'rows_more' && f.has('join') && !f.has('group_by'),
    say: 'Строк больше, чем нужно, а в запросе есть JOIN. Не размножаются ли строки — у одной записи может быть несколько пар?',
  },
  {
    id: 'fanout_agg',
    when: ({ verdict, f, text }) => verdict && ['values', 'values_bigger'].includes(verdict.reason) && f.has('group_by') && (text.match(/\bjoin\b/gi) || []).length >= 2 && !/count\s*\(\s*distinct/i.test(text),
    say: 'Несколько JOIN к «многим» таблицам перемножают строки — счётчики и суммы раздуваются. Помогут COUNT(DISTINCT …) или агрегация до соединения.',
  },
  {
    id: 'inner_vs_left',
    when: ({ verdict, f }) => verdict?.reason === 'rows_less' && f.has('join') && !f.has('left_join'),
    say: 'Строк меньше, чем нужно. INNER JOIN отбрасывает строки без пары — может, нужен LEFT JOIN?',
  },
  {
    id: 'left_where',
    when: ({ verdict, f, text }) => verdict?.reason === 'rows_less' && f.has('left_join') && /\bwhere\b/i.test(text),
    say: 'Условие на правую таблицу LEFT JOIN в WHERE выкидывает строки без пары. Попробуй перенести его в ON.',
  },
  {
    id: 'count_star_left',
    when: ({ verdict, f, text }) => verdict && !verdict.ok && f.has('left_join') && /count\s*\(\s*\*\s*\)/i.test(text),
    say: 'COUNT(*) после LEFT JOIN считает и строку-заглушку с NULL. Считай колонку правой таблицы — COUNT(r.id).',
  },
  {
    id: 'int_division',
    when: ({ verdict, text }) => verdict && ['values'].includes(verdict.reason) && /\b\d+\s*\/\s*\d+\b|\w\s*\/\s*100\b(?!\.)/.test(stripSql(text)) && !/::\s*numeric|\d\.\d/.test(text),
    say: 'Целое делённое на целое в PostgreSQL даёт целое: 15 / 100 = 0. Сделай одно из чисел дробным — 100.0 или ::numeric.',
  },
  {
    id: 'limit_no_order',
    when: ({ f, verdict }) => verdict && !verdict.ok && f.has('limit') && !f.has('order_by'),
    say: 'LIMIT без ORDER BY возвращает случайные строки. Отсортируй перед тем, как ограничивать.',
  },
  {
    id: 'order_missing',
    when: ({ verdict, f }) => verdict?.reason === 'order' && !f.has('order_by'),
    say: 'Строки верные, но в задании важен порядок — добавь ORDER BY.',
  },
  {
    id: 'order_dir',
    when: ({ verdict, f }) => verdict?.reason === 'order' && f.has('order_by'),
    say: 'Порядок не совпал. Проверь колонку сортировки и направление — ASC или DESC.',
  },
  {
    id: 'duplicates',
    when: ({ verdict, f }) => verdict?.reason === 'rows_more' && !f.has('distinct') && !f.has('group_by') && verdict.dupes,
    say: 'В результате есть повторяющиеся строки. Нужен DISTINCT или группировка?',
  },
  {
    id: 'count_column_null',
    when: ({ verdict, text }) => verdict?.reason === 'values' && /count\s*\(\s*[a-z_][\w.]*\s*\)/i.test(text) && !/count\s*\(\s*distinct/i.test(text),
    say: 'COUNT(колонка) пропускает NULL. Если нужно число строк — COUNT(*); если уникальных значений — COUNT(DISTINCT …).',
  },
  {
    id: 'names',
    when: ({ verdict }) => verdict?.reason === 'column_names',
    say: 'Значения могут быть верными — не совпадают имена колонок. Задай их через AS.',
  },
  {
    id: 'timeout',
    when: ({ error }) => error?.code === '57014',
    say: 'Запрос слишком тяжёлый. Нет ли JOIN без условия ON — тогда таблицы перемножаются целиком?',
  },
];

function whereClause(text) {
  const s = stripSql(text);
  const m = /\bwhere\b([\s\S]*?)(\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|$)/i.exec(s);
  return m ? m[1] : '';
}

export function detect({ sql, task, verdict, error }) {
  const text = sql || '';
  const f = features(text);
  const ctx = { text, f, verdict, error, toks: tokens(text) };
  const out = [];
  for (const cm of task?.common_mistakes || []) {
    let hit = true;
    if (cm.pattern) hit = hit && new RegExp(cm.pattern, 'i').test(stripSql(text));
    if (cm.result) {
      const r = verdict?.reason;
      const map = { rows_less: r === 'rows_less', rows_more: r === 'rows_more', values_bigger: r === 'values' || r === 'rows_more' };
      hit = hit && !!map[cm.result];
    }
    if (!cm.pattern && !cm.result) hit = false;
    if (hit && !verdict?.ok) out.push(cm.explain);
  }
  const taskSpecific = out.length > 0;
  for (const r of RULES) {
    if (out.length >= 2 || taskSpecific) break;
    try { if (r.when(ctx)) out.push(r.say); } catch { }
  }
  return [...new Set(out)].slice(0, 2);
}

export const DETECTOR_COUNT = RULES.length;
