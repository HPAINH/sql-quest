import { runQuery, runExplain, runScript } from '../db/client.js';
import { canonRows, rowKey } from '../engine/canon.js';
import { guard, features, FEATURE_NAMES } from '../engine/sqlscan.js';
import { comparePublic, compareHidden } from '../engine/compare.js';
import { explainError } from '../engine/errors.js';
import { detect } from '../engine/detect.js';
import { parsePlan, checkPlan } from '../engine/plan.js';

export async function execute(sql, schema = 'shop') {
  const g = guard(sql);
  if (g) return { blocked: g };
  const r = await runQuery(sql, schema);
  if (r.error) return { error: explainError(r.error), raw: r.error };
  return { columns: r.fields.map((f) => f.name), rows: canonRows(r.fields, r.rows), ms: r.ms };
}

export async function explainQuery(sql) {
  const r = await runExplain(sql);
  if (r.error) return { error: explainError(r.error) };
  return { plan: parsePlan(r.plan) };
}

const table = (t) => (t ? { columns: t.fields.map((f) => f.name), rows: canonRows(t.fields, t.rows) } : null);

export async function executeScript(task, sql, schema = 'shop') {
  const g = guard(sql, 'write');
  if (g) return { blocked: g };
  const r = await runScript(sql, schema, task.verify, task.plan?.probe || null);
  if (r.error) return { error: explainError(r.error), raw: r.error };
  return { last: table(r.last), verify: table(r.verify), plan: r.plan ? parsePlan(r.plan) : null, affected: r.affected, ms: r.ms };
}

function structure(task, sql) {
  const f = features(sql);
  const missing = (task.required || []).filter((r) => !f.has(r));
  const banned = (task.forbidden || []).filter((r) => f.has(r));
  if (!missing.length && !banned.length) return null;
  const parts = [];
  if (missing.length) parts.push(`используй ${missing.map((m) => FEATURE_NAMES[m] || m).join(', ')}`);
  if (banned.length) parts.push(`обойдись без ${banned.map((m) => FEATURE_NAMES[m] || m).join(', ')}`);
  return { ok: false, reason: 'structure', message: `Результат верный, но задание тренирует конкретный приём: ${parts.join('; ')}.` };
}

function bonusOf(task, sql) {
  if (!task.bonus) return true;
  const f = features(sql);
  return (task.bonus.required || []).every((r) => f.has(r)) && !(task.bonus.forbidden || []).some((r) => f.has(r));
}

const HIDDEN_MSG = 'На видимых данных результат совпал, а на контрольных — нет. Похоже, решение подогнано под ответ: в нём есть конкретные значения, которых нет в условии задачи. Опиши правило, а не результат.';

export async function checkAttempt(task, sql) {
  if (task.type === 'write_dml') return checkDml(task, sql);
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
  if (!hv.ok) return { status: 'wrong', result: ex, verdict: { ok: false, reason: 'hidden', message: HIDDEN_MSG }, detectors: [] };
  const st = structure(task, sql);
  if (st) return { status: 'wrong', result: ex, verdict: st, detectors: [] };
  let plan = null;
  if (task.type === 'optimize') {
    const pr = await explainQuery(sql);
    if (pr.error) return { status: 'error', error: pr.error, detectors: [] };
    const spec = await liveSpec(task);
    const pc = checkPlan(pr.plan, spec);
    plan = { root: pr.plan, spec, baseline: spec.baseline, ...pc };
    if (!pc.ok) return { status: 'wrong', result: ex, plan, verdict: { ok: false, reason: 'plan', message: `Результат верный, но план не тот. ${pc.message}` }, detectors: [] };
  }
  return { status: 'ok', result: ex, plan, bonus: bonusOf(task, sql) };
}

export async function liveSpec(task) {
  const spec = { ...task.plan };
  if (task.plan.max_cost_ratio || task.start_sql) {
    const base = await explainQuery(task.start_sql);
    if (base.plan) {
      spec.baseline = base.plan['Total Cost'];
      if (task.plan.max_cost_ratio) spec.max_cost = Math.round(spec.baseline * task.plan.max_cost_ratio * 100) / 100;
    }
  }
  return spec;
}

async function checkDml(task, sql) {
  const pub = await executeScript(task, sql);
  if (pub.blocked) return { status: 'blocked', message: pub.blocked };
  if (pub.error) return { status: 'error', error: pub.error, detectors: detect({ sql, task, error: pub.raw }) };
  let plan = null;
  if (task.check !== 'plan') {
    const actual = task.check === 'returning' ? pub.last : pub.verify;
    if (!actual) {
      return { status: 'wrong', script: pub, verdict: { ok: false, reason: 'returning', message: 'Последняя команда ничего не вернула. Добавь RETURNING с нужными колонками.' }, detectors: [] };
    }
    const verdict = comparePublic(task.expected, actual);
    if (!verdict.ok) {
      verdict.message = (task.check === 'returning' ? 'RETURNING вернул не то. ' : 'После твоего скрипта проверочный запрос показывает не то. ') + verdict.message;
      return { status: 'wrong', script: pub, result: actual, verdict, detectors: detect({ sql, task, verdict }) };
    }
    const hid = await executeScript(task, sql, 'shop_h');
    if (hid.error || hid.blocked) {
      return { status: 'wrong', script: pub, result: actual, verdict: { ok: false, reason: 'hidden', message: 'На контрольных данных скрипт упал. Не опирайся на конкретные id из выборки, если их нет в условии.' }, detectors: [] };
    }
    const hv = await compareHidden(task.expected, (task.check === 'returning' ? hid.last : hid.verify)?.rows || []);
    if (!hv.ok) return { status: 'wrong', script: pub, result: actual, verdict: { ok: false, reason: 'hidden', message: HIDDEN_MSG }, detectors: [] };
  }
  if (task.plan) {
    const pc = checkPlan(pub.plan, task.plan);
    plan = { root: pub.plan, ...pc };
    if (!pc.ok) return { status: 'wrong', script: pub, plan, verdict: { ok: false, reason: 'plan', message: `После твоего скрипта запрос всё ещё выполняется не так. ${pc.message}` }, detectors: [] };
  }
  const st = structure(task, sql);
  if (st) return { status: 'wrong', script: pub, verdict: st, detectors: [] };
  return { status: 'ok', script: pub, result: task.check === 'returning' ? pub.last : pub.verify, plan, bonus: bonusOf(task, sql) };
}
