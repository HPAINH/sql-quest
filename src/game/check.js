import { runQuery } from '../db/client.js';
import { canonRows, rowKey } from '../engine/canon.js';
import { guard, features, FEATURE_NAMES } from '../engine/sqlscan.js';
import { comparePublic, compareHidden } from '../engine/compare.js';
import { explainError } from '../engine/errors.js';
import { detect } from '../engine/detect.js';

export async function execute(sql, schema = 'shop') {
  const g = guard(sql);
  if (g) return { blocked: g };
  const r = await runQuery(sql, schema);
  if (r.error) return { error: explainError(r.error), raw: r.error };
  return { columns: r.fields.map((f) => f.name), rows: canonRows(r.fields, r.rows), ms: r.ms };
}

export async function checkAttempt(task, sql) {
  const ex = await execute(sql);
  if (ex.blocked) return { status: 'blocked', message: ex.blocked };
  if (ex.error) {
    return { status: 'error', error: ex.error, detectors: detect({ sql, task, error: ex.raw }) };
  }
  const expected = task.expected;
  const verdict = comparePublic(expected, ex);
  if (!verdict.ok) {
    const keys = ex.rows.map(rowKey);
    verdict.dupes = new Set(keys).size < keys.length;
    return { status: 'wrong', result: ex, verdict, detectors: detect({ sql, task, verdict }) };
  }
  const hid = await execute(sql, 'shop_h');
  if (hid.error || hid.blocked) {
    return { status: 'wrong', result: ex, verdict: { ok: false, reason: 'hidden', message: 'На контрольных данных запрос упал. Не опирайся на конкретные id или значения из выборки.' }, detectors: [] };
  }
  const hv = await compareHidden(expected, hid.rows);
  if (!hv.ok) {
    return {
      status: 'wrong', result: ex,
      verdict: { ok: false, reason: 'hidden', message: 'На видимых данных результат совпал, а на контрольных — нет. Похоже, запрос подогнан под ответ: в нём есть конкретные значения, которых нет в условии задачи. Опиши правило, а не результат.' },
      detectors: [],
    };
  }
  const f = features(sql);
  const missing = (task.required || []).filter((r) => !f.has(r));
  const banned = (task.forbidden || []).filter((r) => f.has(r));
  if (missing.length || banned.length) {
    const parts = [];
    if (missing.length) parts.push(`используй ${missing.map((m) => FEATURE_NAMES[m] || m).join(', ')}`);
    if (banned.length) parts.push(`обойдись без ${banned.map((m) => FEATURE_NAMES[m] || m).join(', ')}`);
    return { status: 'wrong', result: ex, verdict: { ok: false, reason: 'structure', message: `Результат верный, но задание тренирует конкретный приём: ${parts.join('; ')}.` }, detectors: [] };
  }
  let bonus = true;
  if (task.bonus) {
    bonus = (task.bonus.required || []).every((r) => f.has(r)) && !(task.bonus.forbidden || []).some((r) => f.has(r));
  }
  return { status: 'ok', result: ex, bonus };
}
