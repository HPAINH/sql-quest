import { describe, it, expect } from 'vitest';
import content from '../src/content/content.json';
import { canonValue, canonRows, fingerprint, hide, reveal } from '../src/engine/canon.js';
import { comparePublic, compareHidden } from '../src/engine/compare.js';
import { features, guard } from '../src/engine/sqlscan.js';
import { detect } from '../src/engine/detect.js';
import { encodeSave, decodeSave, emptyProgress, recordResult, checkPassword, passwords, isLevelUnlocked } from '../src/game/progress.js';

const exp = (rows, extra = {}) => ({ columns: ['a', 'b'], check_names: false, ordered: false, key_idx: [], rows, ...extra });

describe('canon', () => {
  it('normalizes numerics and booleans', () => {
    expect(canonValue('3.5000000000000000', 1700)).toBe('3.5');
    expect(canonValue('0.30000000000000004', 701)).toBe('0.3');
    expect(canonValue('t', 16)).toBe('t');
    expect(canonValue(null, 23)).toBe(null);
    expect(canonRows([{ dataTypeID: 23 }, { dataTypeID: 25 }], [['1', 'x']])).toEqual([['1', 'x']]);
  });
  it('hides and reveals text', () => {
    expect(reveal(hide('SELECT 1 — тест'))).toBe('SELECT 1 — тест');
  });
});

describe('compare', () => {
  it('accepts any row order for unordered tasks', () => {
    expect(comparePublic(exp([['1', 'x'], ['2', 'y']]), { columns: ['a', 'b'], rows: [['2', 'y'], ['1', 'x']] }).ok).toBe(true);
  });
  it('treats rows as a multiset, so duplicates matter', () => {
    const r = comparePublic(exp([['1', 'x']]), { columns: ['a', 'b'], rows: [['1', 'x'], ['1', 'x']] });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rows_more');
  });
  it('rejects swapped columns', () => {
    expect(comparePublic(exp([['1', 'x']]), { columns: ['b', 'a'], rows: [['x', '1']] }).ok).toBe(false);
  });
  it('checks order with ties allowed inside equal keys', () => {
    const e = exp([['9', 'a'], ['9', 'b'], ['5', 'c']], { ordered: true, key_idx: [0] });
    expect(comparePublic(e, { columns: ['a', 'b'], rows: [['9', 'b'], ['9', 'a'], ['5', 'c']] }).ok).toBe(true);
    expect(comparePublic(e, { columns: ['a', 'b'], rows: [['5', 'c'], ['9', 'a'], ['9', 'b']] }).reason).toBe('order');
  });
  it('checks column names when required', () => {
    expect(comparePublic(exp([['1', 'x']], { check_names: true }), { columns: ['a', 'c'], rows: [['1', 'x']] }).reason).toBe('column_names');
  });
  it('compares the hidden fingerprint', async () => {
    const rows = [['1', 'x'], ['2', 'y']];
    const e = exp([], { hidden: await fingerprint(rows, 2, false, []) });
    expect((await compareHidden(e, [['2', 'y'], ['1', 'x']])).ok).toBe(true);
    expect((await compareHidden(e, [['1', 'x']])).ok).toBe(false);
  });
});

describe('sqlscan', () => {
  it('detects constructs, ignoring strings and comments', () => {
    const f = features("SELECT a FROM t LEFT JOIN u ON true -- GROUP BY\nWHERE x = 'HAVING' GROUP BY a HAVING count(*) > 1");
    expect(f.has('left_join')).toBe(true);
    expect(f.has('group_by')).toBe(true);
    expect(f.has('having')).toBe(true);
    expect(features("SELECT 'join'").has('join')).toBe(false);
    expect(features('SELECT * FROM (SELECT 1) t').has('subquery')).toBe(true);
  });
  it('guards writes, multiple statements, blanks and the hidden schema', () => {
    expect(guard('DELETE FROM orders')).toMatch(/только запросы на чтение/);
    expect(guard('SELECT 1; SELECT 2')).toMatch(/один запрос/);
    expect(guard('SELECT 1;')).toBe(null);
    expect(guard('SELECT ___ FROM t')).toMatch(/пропуски/);
    expect(guard('SELECT * FROM shop_h.orders')).toMatch(/служебная/);
    expect(guard("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(null);
  });
});

describe('detectors', () => {
  it('flags = NULL', () => {
    expect(detect({ sql: 'SELECT * FROM t WHERE a = NULL', verdict: { ok: false, reason: 'rows_less' } })[0]).toMatch(/IS NULL/);
  });
  it('flags a missing LEFT JOIN', () => {
    expect(detect({ sql: 'SELECT * FROM a JOIN b ON a.id = b.id', verdict: { ok: false, reason: 'rows_less' } }).join(' ')).toMatch(/LEFT JOIN/);
  });
  it('explains HAVING for aggregates in WHERE', () => {
    expect(detect({ sql: 'SELECT a FROM t WHERE count(*) > 1', error: { code: '42803', message: 'aggregate functions are not allowed in WHERE' } })[0]).toMatch(/HAVING/);
  });
});

describe('progress', () => {
  const t1 = content.levels[0].tasks[0];
  it('scores stars and xp by hints', () => {
    const p = emptyProgress();
    const r = recordResult(p, t1, { solved: true, bonus: true, hintsUsed: 0, wrong: 0 });
    expect(r.stars).toBe(3);
    expect(r.gained).toBe(10);
    const q = emptyProgress();
    expect(recordResult(q, t1, { solved: true, bonus: false, hintsUsed: 5, wrong: 0 }).gained).toBe(0);
  });
  it('round-trips the save code and rejects a damaged one', () => {
    const p = emptyProgress();
    p.unlocked = 2;
    recordResult(p, t1, { solved: true, bonus: true, hintsUsed: 1, wrong: 0 });
    const code = encodeSave(content, p);
    const back = decodeSave(content, code.toLowerCase());
    expect(back.unlocked).toBe(2);
    expect(back.tasks[t1.id]).toMatchObject({ solved: true, stars: 3, hints: 1 });
    const broken = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
    expect(() => decodeSave(content, broken)).toThrow();
  });
  it('unlocks levels with passwords', () => {
    const pw = passwords(content);
    expect(checkPassword(content, pw[3].toLowerCase())).toBe(3);
    expect(checkPassword(content, 'JOIN-0000')).toBe(-1);
    const p = emptyProgress();
    expect(isLevelUnlocked(content, p, 1)).toBe(false);
    p.unlocked = 3;
    expect(isLevelUnlocked(content, p, 3)).toBe(true);
  });
  it('every task has five hints and a book chapter', () => {
    for (const l of content.levels) for (const t of l.tasks) {
      expect(t.hints.length + 1).toBe(5);
      expect(t.book_chapter).toBeTruthy();
    }
  });
});
