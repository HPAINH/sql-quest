import { rowKey, fingerprint } from './canon.js';

export function comparePublic(expected, actual) {
  const ec = expected.columns.length, ac = actual.columns.length;
  if (ec !== ac) {
    return {
      ok: false, reason: 'columns_count',
      message: `В результате ${ac} ${plural(ac, 'колонка', 'колонки', 'колонок')}, а нужно ${ec}: ${expected.columns.join(', ')}.`,
    };
  }
  if (expected.check_names) {
    const bad = expected.columns.map((c, i) => [c, actual.columns[i]]).filter(([e, a]) => e.toLowerCase() !== String(a).toLowerCase());
    if (bad.length) {
      return {
        ok: false, reason: 'column_names',
        message: `Колонки должны называться ${expected.columns.join(', ')}. Сейчас: ${actual.columns.join(', ')}. Переименуй через AS.`,
      };
    }
  }
  const need = new Map();
  for (const r of expected.rows) { const k = rowKey(r); need.set(k, (need.get(k) || 0) + 1); }
  const extra = [];
  for (const r of actual.rows) {
    const k = rowKey(r);
    const c = need.get(k);
    if (c) need.set(k, c - 1); else extra.push(r);
  }
  const missing = [];
  for (const [k, c] of need) for (let i = 0; i < c; i++) missing.push(JSON.parse(k));
  const sameCount = expected.rows.length === actual.rows.length;
  if (extra.length || missing.length) {
    let reason = 'values', message;
    if (actual.rows.length > expected.rows.length) {
      reason = 'rows_more';
      message = `Строк больше, чем нужно: ${actual.rows.length} вместо ${expected.rows.length}.`;
    } else if (actual.rows.length < expected.rows.length) {
      reason = 'rows_less';
      message = `Строк меньше, чем нужно: ${actual.rows.length} вместо ${expected.rows.length}.`;
    } else {
      message = `Число строк верное (${actual.rows.length}), но ${missing.length} ${plural(missing.length, 'строка отличается', 'строки отличаются', 'строк отличаются')}.`;
    }
    return { ok: false, reason, message, extra: extra.slice(0, 20), missing: missing.slice(0, 20), extraTotal: extra.length, missingTotal: missing.length, sameCount };
  }
  if (expected.ordered) {
    const idx = expected.key_idx && expected.key_idx.length ? expected.key_idx : null;
    const proj = (r) => JSON.stringify(idx ? idx.map((i) => r[i]) : r);
    const a = actual.rows.map(proj), e = expected.rows.map(proj);
    const at = a.findIndex((k, i) => k !== e[i]);
    if (at >= 0) {
      return { ok: false, reason: 'order', message: `Строки верные, но порядок другой — расхождение начинается со строки ${at + 1}. Проверь ORDER BY и направление сортировки.`, at };
    }
  }
  return { ok: true };
}

export async function compareHidden(expected, rows) {
  const fp = await fingerprint(rows, expected.columns.length, expected.ordered, expected.key_idx);
  const h = expected.hidden;
  if (fp.multiset !== h.multiset) return { ok: false, count: fp.count, expectedCount: h.count };
  if (expected.ordered && fp.order !== h.order) return { ok: false, order: true };
  return { ok: true };
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
