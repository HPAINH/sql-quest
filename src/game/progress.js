import { reveal } from '../engine/canon.js';

export const XP_BY_DIFF = { 1: 10, 2: 20, 3: 30 };
export const BOSS_XP = 100;
export const HINT_MULT = [1, 0.9, 0.8, 0.65, 0.5, 0];
export const HINT_COST = ['', '−10% XP', '−20% XP', '−35% XP', '−50% XP', '0 XP'];
export const UNLOCK_SHARE = 0.7;
const STORE_KEY = 'sqlquest.progress.v1';

export const emptyProgress = () => ({ v: 1, tasks: {}, unlocked: 0, drafts: {}, lastTask: null });

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...emptyProgress(), ...JSON.parse(raw) };
  } catch { }
  return emptyProgress();
}

export function saveProgress(p) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}

export const baseXp = (task) => (task.boss ? BOSS_XP : XP_BY_DIFF[task.difficulty] || 10);
export const taskXp = (task, rec) => (rec?.solved ? Math.round(baseXp(task) * HINT_MULT[Math.min(rec.hints || 0, 5)]) : 0);

export function totalXp(content, p) {
  let s = 0;
  for (const l of content.levels) for (const t of l.tasks) s += taskXp(t, p.tasks[t.id]);
  return s;
}

export function levelStats(level, p) {
  const regular = level.tasks.filter((t) => !t.boss);
  const boss = level.tasks.find((t) => t.boss);
  const solved = regular.filter((t) => p.tasks[t.id]?.solved).length;
  const stars = level.tasks.reduce((s, t) => s + (p.tasks[t.id]?.stars || 0), 0);
  return {
    solved, total: regular.length, share: regular.length ? solved / regular.length : 0,
    bossSolved: !!(boss && p.tasks[boss.id]?.solved), stars, maxStars: level.tasks.length * 3,
    need: Math.ceil(regular.length * UNLOCK_SHARE),
  };
}

export function isLevelUnlocked(content, p, n) {
  if (n === 0 || p.unlocked >= n) return true;
  const prev = content.levels.find((l) => l.level === n - 1);
  if (!prev) return false;
  const st = levelStats(prev, p);
  return isLevelUnlocked(content, p, n - 1) && st.bossSolved && st.share >= UNLOCK_SHARE;
}

export function isBossOpen(content, p, level) {
  if (p.unlocked > level.level) return true;
  const st = levelStats(level, p);
  return st.solved >= st.need;
}

export function grade(content, p) {
  let g = content.levels[0].grade;
  for (const l of content.levels) if (isLevelUnlocked(content, p, l.level)) g = l.grade;
  return g;
}

export function recordResult(p, task, { solved, bonus, hintsUsed, wrong }) {
  const prev = p.tasks[task.id] || { solved: false, stars: 0, hints: 0, attempts: 0, wrong: 0 };
  const rec = { ...prev, attempts: prev.attempts + 1 };
  if (!solved) { rec.wrong = (prev.wrong || 0) + 1; p.tasks[task.id] = rec; return { rec, gained: 0, stars: 0 }; }
  const hints = hintsUsed;
  let stars = 1;
  if (hints <= 2 && (wrong ?? prev.wrong ?? 0) <= 2) stars = 2;
  if (stars === 2 && bonus) stars = 3;
  const before = taskXp(task, prev);
  const better = !prev.solved || hints < prev.hints || stars > prev.stars;
  if (better) {
    rec.solved = true;
    rec.hints = prev.solved ? Math.min(prev.hints, hints) : hints;
    rec.stars = Math.max(prev.stars || 0, stars);
  }
  p.tasks[task.id] = rec;
  const gained = Math.max(0, taskXp(task, rec) - before);
  return { rec, gained, stars };
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function toB32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function fromB32(str) {
  const clean = str.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('bad char');
    val = ((val << 5) | v) & 0xffffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return out;
}

export const taskOrder = (content) => content.levels.flatMap((l) => l.tasks.map((t) => t.id));

export function encodeSave(content, p) {
  const ids = taskOrder(content);
  const bytes = [0x51, 1, p.unlocked & 255, (ids.length >> 8) & 255, ids.length & 255];
  for (const id of ids) {
    const r = p.tasks[id];
    bytes.push(r?.solved ? 1 | ((r.stars & 3) << 1) | ((Math.min(r.hints, 5) & 7) << 3) : 0);
  }
  const c = crc16(bytes);
  bytes.push((c >> 8) & 255, c & 255);
  return toB32(bytes).match(/.{1,5}/g).join('-');
}

export function decodeSave(content, code) {
  let bytes;
  try { bytes = fromB32(code); } catch { throw new Error('В коде есть недопустимые символы. Скопируй его целиком ещё раз.'); }
  if (bytes.length < 7) throw new Error('Код слишком короткий — похоже, скопирован не полностью.');
  const n = (bytes[3] << 8) | bytes[4];
  const body = bytes.slice(0, 5 + n);
  const crc = (bytes[5 + n] << 8) | bytes[6 + n];
  if (bytes[0] !== 0x51 || body.length !== 5 + n || crc16(body) !== crc) throw new Error('Код повреждён: не сходится контрольная сумма. Проверь, что он скопирован без изменений.');
  if (bytes[1] !== 1) throw new Error('Этот код сделан в другой версии игры.');
  const ids = taskOrder(content);
  const p = emptyProgress();
  p.unlocked = bytes[2];
  for (let i = 0; i < Math.min(n, ids.length); i++) {
    const b = body[5 + i];
    if (b & 1) p.tasks[ids[i]] = { solved: true, stars: (b >> 1) & 3, hints: (b >> 3) & 7, attempts: 1, wrong: 0 };
  }
  return p;
}

let _pw = null;
export function passwords(content) {
  if (!_pw) _pw = JSON.parse(reveal(content.passwords));
  return _pw;
}

export function checkPassword(content, input) {
  const norm = input.toUpperCase().replace(/\s+/g, '').replace(/[–—_]/g, '-');
  const pw = passwords(content);
  for (let i = pw.length - 1; i > 0; i--) if (pw[i] && pw[i] === norm) return i;
  return -1;
}
