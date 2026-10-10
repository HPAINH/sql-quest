
export const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 1700]);

export function canonValue(v, oid) {
  if (v === null || v === undefined) return null;
  if (NUMERIC_OIDS.has(oid)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const r = Math.round(n * 1e6) / 1e6;
    return String(Object.is(r, -0) ? 0 : r);
  }
  if (oid === 16) return v === true || v === 't' || v === 'true' ? 't' : 'f';
  return String(v);
}

export function canonRows(fields, rows) {
  return rows.map((r) => r.map((v, i) => canonValue(v, fields[i]?.dataTypeID)));
}

export const rowKey = (r) => JSON.stringify(r);

export function sortedKeys(rows) {
  return rows.map(rowKey).sort();
}

export function keySeq(rows, keyIdx) {
  return rows.map((r) => JSON.stringify(keyIdx.map((i) => r[i])));
}

export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fingerprint(rows, ncols, ordered, keyIdx) {
  const multiset = await sha256(ncols + '|' + sortedKeys(rows).join('\n'));
  let order = '';
  if (ordered) order = await sha256(keyIdx && keyIdx.length ? keySeq(rows, keyIdx).join('\n') : rows.map(rowKey).join('\n'));
  return { multiset, order, count: rows.length };
}

const KEY = 'ShopData-2026';
export function hide(text) {
  const bytes = new TextEncoder().encode(text);
  const out = bytes.map((b, i) => b ^ KEY.charCodeAt(i % KEY.length));
  let s = '';
  for (const b of out) s += String.fromCharCode(b);
  return btoa(s);
}
export function reveal(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  return new TextDecoder().decode(bytes);
}
