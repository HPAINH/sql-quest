import { PGlite, types } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

let db = null;
const raw = {};
for (const v of Object.values(types)) if (typeof v === 'number') raw[v] = (x) => x;
const MAX_ROWS = 50000;

function fromBase64(text) {
  const bin = atob(text.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}

async function fetchBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить ${url} (${res.status})`);
  return url.endsWith('.b64.txt') ? fromBase64(await res.text()) : res.blob();
}

async function init(dataUrl, fsUrl, vecUrl) {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`Не удалось загрузить базу (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let blob;
  if (res.body && total) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      postMessage({ type: 'progress', got, total });
    }
    blob = new Blob(chunks);
  } else blob = await res.blob();
  if (dataUrl.endsWith('.b64.txt')) blob = fromBase64(await blob.text());
  const fsBundle = fsUrl ? await fetchBlob(fsUrl) : undefined;
  let vectorExt = vector;
  if (vecUrl) {
    const vecBlobUrl = URL.createObjectURL(await fetchBlob(vecUrl));
    vectorExt = { name: 'vector', setup: async (_pg, emscriptenOpts) => ({ emscriptenOpts, bundlePath: new URL(vecBlobUrl) }) };
  }
  postMessage({ type: 'progress', got: 1, total: 1, phase: 'start' });
  db = new PGlite({ loadDataDir: blob, parsers: raw, extensions: { vector: vectorExt }, ...(fsBundle ? { fsBundle } : {}) });
  await db.waitReady;
  await db.exec('SET search_path TO shop, public;');
}

const path = (schema) => (schema === 'shop_h' ? 'shop_h, public' : 'shop, public');
const pack = (r) => ({ fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: r.rows });
const fail = (e) => ({ error: { code: e.code || 'XX000', message: e.message, position: e.position || null, hint: e.hint || null, detail: e.detail || null } });

async function query(sql, schema) {
  const t0 = performance.now();
  await db.exec(`BEGIN READ ONLY; SET LOCAL search_path TO ${path(schema)};`);
  try {
    const r = await db.query(sql, [], { rowMode: 'array' });
    if (r.rows.length > MAX_ROWS) return { error: { code: 'XXBIG', message: `Результат слишком большой: ${r.rows.length} строк. Добавь фильтр или LIMIT.` } };
    return { ...pack(r), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return fail(e);
  } finally {
    try { await db.exec('ROLLBACK;'); } catch { }
  }
}

async function explain(sql, schema) {
  await db.exec(`BEGIN READ ONLY; SET LOCAL search_path TO ${path(schema)};`);
  try {
    const r = await db.query(`EXPLAIN (FORMAT JSON) ${sql}`, [], { rowMode: 'array' });
    return { plan: r.rows[0][0] };
  } catch (e) {
    return fail(e);
  } finally {
    try { await db.exec('ROLLBACK;'); } catch { }
  }
}

async function script(sql, schema, verify, probe) {
  const t0 = performance.now();
  await db.exec(`BEGIN; SET LOCAL search_path TO ${path(schema)};`);
  try {
    const results = await db.exec(sql, { rowMode: 'array' });
    const out = { statements: results.length, affected: results.map((r) => r.affectedRows ?? null) };
    const last = [...results].reverse().find((r) => r.fields && r.fields.length);
    if (last) out.last = pack(last);
    if (verify) out.verify = pack(await db.query(verify, [], { rowMode: 'array' }));
    if (probe) out.plan = (await db.query(`EXPLAIN (FORMAT JSON) ${probe}`, [], { rowMode: 'array' })).rows[0][0];
    out.ms = Math.round(performance.now() - t0);
    return out;
  } catch (e) {
    return fail(e);
  } finally {
    try { await db.exec('ROLLBACK;'); } catch { }
  }
}

onmessage = async (ev) => {
  const { id, type } = ev.data;
  try {
    if (type === 'init') { await init(ev.data.url, ev.data.fs, ev.data.vec); postMessage({ id, ok: true }); return; }
    if (type === 'query') { postMessage({ id, result: await query(ev.data.sql, ev.data.schema) }); return; }
    if (type === 'explain') { postMessage({ id, result: await explain(ev.data.sql, ev.data.schema) }); return; }
    if (type === 'script') { postMessage({ id, result: await script(ev.data.sql, ev.data.schema, ev.data.verify, ev.data.probe) }); return; }
  } catch (e) {
    postMessage({ id, fatal: String(e?.message || e) });
  }
};
