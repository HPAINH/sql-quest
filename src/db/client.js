const TIMEOUT_MS = 5000;
const OVERRIDE = globalThis.SQLQUEST_ASSETS || {};
const DATA_URL = new URL(OVERRIDE.data || './data/shop.tar.gz', document.baseURI).href;
const FS_URL = OVERRIDE.fs ? new URL(OVERRIDE.fs, document.baseURI).href : undefined;

let worker = null;
let ready = null;
let seq = 0;
const pending = new Map();
let onProgress = () => {};
let chain = Promise.resolve();

function spawn() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'progress') { onProgress(m); return; }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.fatal) p.reject(new Error(m.fatal)); else p.resolve(m.result ?? m);
  };
  worker.onerror = (e) => {
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error(e.message || 'Ошибка базы данных')); }
    pending.clear();
  };
}

function call(msg, timeout) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = timeout ? setTimeout(() => {
      pending.delete(id);
      restart();
      resolve({ error: { code: '57014', message: 'canceling statement due to statement timeout (5 s)' } });
    }, timeout) : null;
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ ...msg, id });
  });
}

function restart() {
  try { worker.terminate(); } catch { }
  for (const [, p] of pending) { clearTimeout(p.timer); p.resolve({ error: { code: '57014', message: 'База перезапущена' } }); }
  pending.clear();
  spawn();
  ready = call({ type: 'init', url: DATA_URL, fs: FS_URL });
}

export function initDb(progress) {
  if (progress) onProgress = progress;
  if (!ready) { spawn(); ready = call({ type: 'init', url: DATA_URL, fs: FS_URL }); }
  return ready;
}

export function runQuery(sql, schema = 'shop') {
  const job = chain.then(async () => {
    await ready;
    return call({ type: 'query', sql, schema }, TIMEOUT_MS);
  });
  chain = job.catch(() => {});
  return job;
}
