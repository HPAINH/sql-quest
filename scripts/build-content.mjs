
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { PGlite, types } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { generate, loadInto, TABLE_ORDER } from './dataset.mjs';
import { canonRows, fingerprint, hide, rowKey, sortedKeys, keySeq } from '../src/engine/canon.js';
import { guard, features } from '../src/engine/sqlscan.js';
import { parsePlan, checkPlan } from '../src/engine/plan.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const errors = [];
const warn = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

const raw = {};
for (const v of Object.values(types)) if (typeof v === 'number') raw[v] = (x) => x;

const t0 = Date.now();
const db = new PGlite({ parsers: raw, extensions: { vector } });
await loadInto(db, 'shop', generate(1, 1));
await loadInto(db, 'shop_h', generate(2, 0.85));
await db.exec('ANALYZE;');
await db.exec('ALTER DATABASE postgres SET search_path TO shop, public;');
console.log(`datasets loaded in ${Date.now() - t0} ms`);

async function run(sql, schema = 'shop') {
  await db.exec(`BEGIN READ ONLY; SET LOCAL search_path TO ${schema}, public;`);
  try {
    const r = await db.query(sql, [], { rowMode: 'array' });
    return { fields: r.fields, rows: canonRows(r.fields, r.rows) };
  } catch (e) {
    return { error: { code: e.code, message: e.message } };
  } finally {
    await db.exec('ROLLBACK;');
  }
}

let dirty = false;
async function explain(sql, schema = 'shop') {
  if (dirty) { await db.exec('VACUUM FULL'); await db.exec('ANALYZE'); dirty = false; }
  await db.exec(`BEGIN READ ONLY; SET LOCAL search_path TO ${schema}, public;`);
  try {
    const r = await db.query(`EXPLAIN (FORMAT JSON) ${sql}`, [], { rowMode: 'array' });
    return parsePlan(r.rows[0][0]);
  } catch (e) {
    return { error: { code: e.code, message: e.message } };
  } finally {
    await db.exec('ROLLBACK;');
  }
}

async function runScript(script, schema, { verify, probe } = {}) {
  dirty = true;
  await db.exec(`BEGIN; SET LOCAL search_path TO ${schema}, public;`);
  try {
    const results = await db.exec(script, { rowMode: 'array' });
    const last = results[results.length - 1];
    const out = { last: last && last.fields.length ? { fields: last.fields, rows: canonRows(last.fields, last.rows.map((r) => (Array.isArray(r) ? r : last.fields.map((f) => r[f.name])))) } : null };
    if (verify) { const v = await db.query(verify, [], { rowMode: 'array' }); out.verify = { fields: v.fields, rows: canonRows(v.fields, v.rows) }; }
    if (probe) { const p = await db.query(`EXPLAIN (FORMAT JSON) ${probe}`, [], { rowMode: 'array' }); out.plan = parsePlan(p.rows[0][0]); }
    return out;
  } catch (e) {
    return { error: { code: e.code, message: e.message } };
  } finally {
    await db.exec('ROLLBACK;');
  }
}

const sameResult = (a, b, ordered) => {
  if (a.error || b.error) return false;
  if (a.fields.length !== b.fields.length) return false;
  if (ordered) return a.rows.map(rowKey).join('\n') === b.rows.map(rowKey).join('\n');
  return sortedKeys(a.rows).join('\n') === sortedKeys(b.rows).join('\n');
};

const schemaDoc = yaml.load(fs.readFileSync(path.join(ROOT, 'content/schema.yaml'), 'utf8'));
const cols = (await db.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'shop' ORDER BY table_name, ordinal_position`)).rows;
const counts = {};
for (const t of TABLE_ORDER) counts[t] = Number((await db.query(`SELECT count(*) AS c FROM shop.${t}`)).rows[0].c);
const schema = TABLE_ORDER.map((t) => ({
  name: t,
  about: schemaDoc[t]?.about || '',
  rows: counts[t],
  columns: cols.filter((c) => c.table_name === t).map((c) => ({ name: c.column_name, type: c.data_type.replace('timestamp without time zone', 'timestamp').replace('character varying', 'varchar'), about: schemaDoc[t]?.columns?.[c.column_name] || '' })),
}));
for (const t of schema) for (const c of t.columns) if (!c.about) warn.push(`schema: no description for ${t.name}.${c.name}`);

const levelFiles = fs.readdirSync(path.join(ROOT, 'content/levels')).filter((f) => f.endsWith('.yaml')).sort();
const levels = [];
const TYPES = new Set(['write_query', 'target_table', 'fix_bug', 'predict', 'fill_blank', 'choose', 'optimize', 'write_dml']);
const seenIds = new Set();

const shuffle = (arr, seed) => {
  const a = [...arr];
  let s = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let i = a.length - 1; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const j = Math.floor((s / 4294967296) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

for (const file of levelFiles) {
  const L = yaml.load(fs.readFileSync(path.join(ROOT, 'content/levels', file), 'utf8'));
  const out = { level: L.level, grade: L.grade, title: L.title, tag: L.tag, summary: L.summary, theory: L.theory, book_chapter: L.book_chapter, tasks: [] };
  const bosses = L.tasks.filter((t) => t.boss);
  if (bosses.length !== 1) fail(`L${L.level}`, 'у уровня должен быть ровно один босс');
  for (const t of L.tasks) {
    const id = t.id;
    if (seenIds.has(id)) fail(id, 'повтор id');
    seenIds.add(id);
    if (!TYPES.has(t.type)) { fail(id, `неизвестный тип ${t.type}`); continue; }
    if (!Array.isArray(t.hints) || t.hints.length !== 5) fail(id, `нужно ровно 5 подсказок, сейчас ${t.hints?.length ?? 0}`);
    if (!t.book_chapter && !L.book_chapter) fail(id, 'нет ссылки на главу книги');
    for (const k of ['title', 'ticket', 'customer', 'difficulty']) if (t[k] === undefined) fail(id, `нет поля ${k}`);
    const task = {
      id, type: t.type, boss: !!t.boss, difficulty: t.difficulty, customer: t.customer, title: t.title, ticket: t.ticket.trim(),
      tables: t.tables || [], book_chapter: t.book_chapter || L.book_chapter,
      hints: t.hints.slice(0, 4), solution: null,
      required: t.required || [], forbidden: t.forbidden || [], bonus: t.bonus || null,
      common_mistakes: t.common_mistakes || [],
    };
    for (const cm of task.common_mistakes) if (cm.pattern) { try { new RegExp(cm.pattern, 'i'); } catch { fail(id, `плохой pattern ${cm.pattern}`); } }

    if (t.type === 'predict') {
      const pub = await run(t.query);
      if (pub.error) { fail(id, `query падает: ${pub.error.message}`); continue; }
      const truth = t.ask === 'rows' ? String(pub.rows.length) : (pub.rows[0]?.[0] ?? 'NULL');
      const opts = new Set([truth]);
      for (const q of t.distractor_queries || []) {
        const r = await run(q);
        if (r.error) fail(id, `distractor падает: ${r.error.message}`);
        else opts.add(t.ask === 'rows' ? String(r.rows.length) : String(r.rows[0]?.[0] ?? 'NULL'));
      }
      for (const v of t.distractor_values || []) opts.add(String(v));
      let k = 1;
      while (opts.size < 4 && /^\d+$/.test(truth)) { opts.add(String(Number(truth) + k)); k = k > 0 ? -k : -k + 1; }
      const options = shuffle([...opts].slice(0, 4), id);
      Object.assign(task, { query: t.query.trim(), ask: t.ask, options, answer: hide(JSON.stringify([options.indexOf(truth)])) });
      task.solution = hide(JSON.stringify({ sql: t.query.trim(), explain: t.hints[4], answer: truth }));
      out.tasks.push(task);
      continue;
    }

    if (t.type === 'write_dml') {
      if (!t.reference) { fail(id, 'нет reference'); continue; }
      const g = guard(t.reference, 'write');
      if (g) fail(id, `reference не проходит guard: ${g}`);
      if (!t.verify && t.check !== 'returning' && !t.plan) fail(id, 'нужен verify, check: returning или plan');
      const opts = { verify: t.verify, probe: t.plan?.probe };
      const pub = await runScript(t.reference, 'shop', opts);
      const hid = await runScript(t.reference, 'shop_h', opts);
      if (pub.error) { fail(id, `reference падает: ${pub.error.message}`); continue; }
      if (hid.error) { fail(id, `reference падает на скрытом датасете: ${hid.error.message}`); continue; }
      const ordered = !!t.ordered;
      const req = features(t.reference);
      for (const r of task.required) if (!req.has(r)) fail(id, `reference не содержит обязательную конструкцию ${r}`);
      Object.assign(task, { check: t.check || (t.verify ? 'verify' : 'plan'), verify: t.verify ? t.verify.trim() : null, start_sql: t.start_sql ? t.start_sql.trim() : '' });
      if (task.check !== 'plan') {
        const src = task.check === 'returning' ? 'last' : 'verify';
        const P = pub[src], H = hid[src];
        if (!P || !P.rows.length) fail(id, `${src} пустой на публичном датасете`);
        if (!H || !H.rows.length) fail(id, `${src} пустой на скрытом датасете`);
        if (!P || !H) continue;
        const names = P.fields.map((f) => f.name);
        if (t.expected_columns && t.expected_columns.join(',') !== names.join(',')) fail(id, `expected_columns ${t.expected_columns} ≠ ${names}`);
        if (task.check === 'verify') {
          const before = await run(t.verify);
          if (sameResult(before, P, ordered)) fail(id, 'verify до изменений уже совпадает с ожидаемым — задача ничего не проверяет');
        }
        task.expected = { columns: names, check_names: !!t.check_column_names, ordered, key_idx: [], rows: P.rows, hidden: await fingerprint(H.rows, names.length, ordered, []) };
      }
      if (t.plan) {
        const spec = { require: t.plan.require || [], forbid: t.plan.forbid || [] };
        const pc = checkPlan(pub.plan, spec);
        if (!pc.ok) fail(id, `план после reference не проходит: ${pc.message}`);
        const base = await explain(t.plan.probe);
        if (base.error) fail(id, `probe падает: ${base.error.message}`);
        else if (checkPlan(base, spec).ok) fail(id, 'план и без скрипта уже проходит — задача ничего не проверяет');
        task.plan = { probe: t.plan.probe.trim(), ...spec };
      }
      if (t.start_sql) {
        const st = await runScript(t.start_sql, 'shop', opts);
        if (!st.error && task.expected) {
          const src = task.check === 'returning' ? 'last' : 'verify';
          if (st[src] && sameResult(st[src], pub[src], ordered)) fail(id, 'start_sql уже даёт верный результат');
        }
      }
      task.solution = hide(JSON.stringify({ sql: t.reference.trim(), explain: t.hints[4] }));
      out.tasks.push(task);
      continue;
    }

    if (!t.reference) { fail(id, 'нет reference'); continue; }
    const g = guard(t.reference);
    if (g) fail(id, `reference не проходит guard: ${g}`);
    const pub = await run(t.reference);
    const hid = await run(t.reference, 'shop_h');
    if (pub.error) { fail(id, `reference падает: ${pub.error.message}`); continue; }
    if (hid.error) { fail(id, `reference падает на скрытом датасете: ${hid.error.message}`); continue; }
    if (!pub.rows.length) fail(id, 'reference вернул 0 строк на публичном датасете');
    if (!hid.rows.length) fail(id, 'reference вернул 0 строк на скрытом датасете');
    if (sameResult(pub, hid, false)) warn.push(`${id}: результаты на публичном и скрытом датасетах совпадают`);
    const names = pub.fields.map((f) => f.name);
    if (t.expected_columns && t.type !== 'choose') {
      if (t.expected_columns.join(',') !== names.join(',')) fail(id, `expected_columns ${t.expected_columns} ≠ reference ${names}`);
    }
    const ordered = !!t.ordered;
    const keyIdx = (t.order_keys || []).map((k) => names.indexOf(k));
    if (keyIdx.some((i) => i < 0)) fail(id, `order_keys ${t.order_keys} нет среди колонок`);
    if (ordered && !features(t.reference).has('order_by')) fail(id, 'ordered: true, но в reference нет ORDER BY');
    if (ordered && /\blimit\b/i.test(t.reference) && keyIdx.length) {
      const unl = await run(t.reference.replace(/\blimit\s+\d+(\s+offset\s+\d+)?/i, ''));
      const off = Number((/\boffset\s+(\d+)/i.exec(t.reference) || [0, 0])[1]);
      const lim = pub.rows.length;
      const k = (r) => JSON.stringify(keyIdx.map((i) => r[i]));
      const all = unl.rows;
      if ((off > 0 && all[off - 1] && k(all[off - 1]) === k(all[off])) || (all[off + lim] && k(all[off + lim - 1]) === k(all[off + lim]))) fail(id, 'ничья на границе LIMIT/OFFSET — результат неоднозначен');
    }
    const req = features(t.reference);
    for (const r of task.required) if (!req.has(r)) fail(id, `reference не содержит обязательную конструкцию ${r}`);
    for (const r of task.forbidden) if (req.has(r)) fail(id, `reference содержит запрещённую конструкцию ${r}`);
    if (task.bonus?.required) for (const r of task.bonus.required) if (!req.has(r)) fail(id, `reference не выполняет бонус (${r})`);
    if (task.bonus?.forbidden) for (const r of task.bonus.forbidden) if (req.has(r)) fail(id, `reference не выполняет бонус (без ${r})`);

    const expected = {
      columns: names,
      check_names: !!t.check_column_names,
      ordered,
      key_idx: keyIdx,
      rows: pub.rows,
      hidden: await fingerprint(hid.rows, names.length, ordered, keyIdx),
    };

    if (t.type === 'choose') {
      if (!Array.isArray(t.options) || t.options.length < 3) fail(id, 'нужно минимум 3 варианта');
      const correct = [];
      for (let i = 0; i < t.options.length; i++) {
        const a = await run(t.options[i]);
        const b = await run(t.options[i], 'shop_h');
        if (sameResult(a, pub, ordered) && sameResult(b, hid, ordered)) correct.push(i);
      }
      if (!correct.length) fail(id, 'ни один вариант не совпал с эталоном');
      if (t.expect_correct && t.expect_correct.join(',') !== correct.join(',')) fail(id, `верные варианты ${correct} ≠ ожидаемым ${t.expect_correct}`);
      if (correct.length === t.options.length) fail(id, 'все варианты верны');
      Object.assign(task, { options: t.options.map((s) => s.trim()), multi: correct.length > 1, answer: hide(JSON.stringify(correct)) });
      task.solution = hide(JSON.stringify({ sql: t.reference.trim(), explain: t.hints[4], correct }));
      out.tasks.push(task);
      continue;
    }

    if (t.type === 'fix_bug') {
      if (!t.broken_query) fail(id, 'нет broken_query');
      const br = await run(t.broken_query);
      if (!br.error && sameResult(br, pub, ordered)) fail(id, 'broken_query даёт тот же результат, что и эталон');
      task.start_sql = t.broken_query.trim();
    }
    if (t.type === 'optimize') {
      if (!t.start_sql || !t.plan) fail(id, 'optimize требует start_sql и plan');
      else {
        const slow = await run(t.start_sql);
        if (!sameResult(slow, pub, ordered)) fail(id, 'start_sql должен давать верный результат — его нужно только ускорить');
        const slowPlan = await explain(t.start_sql);
        const refPlan = await explain(t.reference);
        const spec = { require: t.plan.require || [], forbid: t.plan.forbid || [] };
        const probeSpec = { ...spec };
        if (t.plan.max_cost_ratio) probeSpec.max_cost = Math.round(slowPlan['Total Cost'] * t.plan.max_cost_ratio * 100) / 100;
        const rc = checkPlan(refPlan, probeSpec);
        if (!rc.ok) fail(id, `план эталона не проходит: ${rc.message}`);
        if (checkPlan(slowPlan, probeSpec).ok) fail(id, 'медленный запрос уже проходит план');
        task.plan = t.plan.max_cost_ratio ? { ...spec, max_cost_ratio: t.plan.max_cost_ratio } : spec;
        task.start_cost = slowPlan['Total Cost'];
        task.start_sql = t.start_sql.trim();
      }
    }
    if (t.type === 'fill_blank') {
      if (!t.template || !t.template.includes('___')) fail(id, 'template без пропусков ___');
      task.start_sql = t.template.trim();
    }
    if (t.type === 'target_table') {
      task.preview = { columns: names, rows: pub.rows.slice(0, 10), total: pub.rows.length };
      if (pub.rows.length > 60) warn.push(`${id}: target_table с ${pub.rows.length} строками — образец покажет только 10`);
    }
    task.expected = expected;
    task.solution = hide(JSON.stringify({ sql: t.reference.trim(), explain: t.hints[4] }));
    out.tasks.push(task);
    if (pub.rows.length > 3000) warn.push(`${id}: большой результат ${pub.rows.length} строк`);
  }
  levels.push(out);
}

const SECRET = 'sqlquest:shopdata:v1';
const fnv = (s) => { let h = 0x811c9dc5; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const ALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const code4 = (n) => { let h = fnv(SECRET + ':' + n), s = ''; for (let i = 0; i < 4; i++) { s += ALPH[h % ALPH.length]; h = Math.floor(h / ALPH.length); } return s; };
const passwords = levels.map((l) => (l.level === 0 ? null : `${l.tag}-${code4(l.level)}`));

const roadmapAll = [
  { level: 5, grade: 'Junior', title: 'Подзапросы и множества' },
  { level: 6, grade: 'Middle', title: 'CTE и рекурсия' },
  { level: 7, grade: 'Middle', title: 'Оконные функции I' },
  { level: 8, grade: 'Middle', title: 'Оконные функции II' },
  { level: 9, grade: 'Senior', title: 'Аналитические паттерны' },
  { level: 10, grade: 'Senior', title: 'Данные и транзакции' },
  { level: 11, grade: 'Lead', title: 'Производительность и ML' },
];
const roadmap = roadmapAll.filter((r) => !levels.some((l) => l.level === r.level));

if (warn.length) console.log('Предупреждения:\n  ' + warn.join('\n  '));
if (errors.length) {
  console.error(`\n✗ Ошибки в контенте (${errors.length}):\n  ` + errors.join('\n  '));
  await db.close();
  process.exit(1);
}

const content = { version: 1, built: new Date().toISOString().slice(0, 10), levels, roadmap, schema, passwords: hide(JSON.stringify(passwords)) };
fs.mkdirSync(path.join(ROOT, 'src/content'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/content/content.json'), JSON.stringify(content));
const nTasks = levels.reduce((s, l) => s + l.tasks.length, 0);
console.log(`✓ ${levels.length} уровней, ${nTasks} задач, все эталоны прошли на обоих датасетах`);

if (!process.argv.includes('--no-dump')) {
  const clean = new PGlite({ extensions: { vector } });
  await loadInto(clean, 'shop', generate(1, 1));
  await loadInto(clean, 'shop_h', generate(2, 0.85));
  await clean.exec('ANALYZE;');
  await clean.exec('ALTER DATABASE postgres SET search_path TO shop, public;');
  const blob = await clean.dumpDataDir('gzip');
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public/data/shop.tar.gz'), Buffer.from(await blob.arrayBuffer()));
  console.log(`✓ дамп базы: ${(blob.size / 1e6).toFixed(1)} МБ`);
  await clean.close();
}
await db.close();
