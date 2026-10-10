import { PGlite, types } from '@electric-sql/pglite';

let db = null;
const raw = {};
for (const v of Object.values(types)) if (typeof v === 'number') raw[v] = (x) => x;
const MAX_ROWS = 50000;

async function init(dataUrl) {
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
  postMessage({ type: 'progress', got: 1, total: 1, phase: 'start' });
  db = new PGlite({ loadDataDir: blob, parsers: raw });
  await db.waitReady;
  await db.exec('SET search_path TO shop;');
}

async function query(sql, schema) {
  const t0 = performance.now();
  await db.exec(`BEGIN READ ONLY; SET LOCAL search_path TO ${schema === 'shop_h' ? 'shop_h' : 'shop'};`);
  try {
    const r = await db.query(sql, [], { rowMode: 'array' });
    const rows = r.rows.length > MAX_ROWS ? null : r.rows;
    if (!rows) return { error: { code: 'XXBIG', message: `Результат слишком большой: ${r.rows.length} строк. Добавь фильтр или LIMIT.` } };
    return { fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })), rows, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { error: { code: e.code || 'XX000', message: e.message, position: e.position || null, hint: e.hint || null, detail: e.detail || null } };
  } finally {
    try { await db.exec('ROLLBACK;'); } catch { }
  }
}

onmessage = async (ev) => {
  const { id, type } = ev.data;
  try {
    if (type === 'init') { await init(ev.data.url); postMessage({ id, ok: true }); return; }
    if (type === 'query') { postMessage({ id, result: await query(ev.data.sql, ev.data.schema) }); return; }
  } catch (e) {
    postMessage({ id, fatal: String(e?.message || e) });
  }
};
