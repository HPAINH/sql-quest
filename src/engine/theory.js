import { guard, tokens } from './sqlscan.js';

const CALLOUTS = [
  [/^(ловушка|осторожно|важно|не путай)/i, 'warn'],
  [/^(совет|лайфхак|приём|прием)/i, 'tip'],
  [/^(на собеседовании|собеседование)/i, 'interview'],
  [/^(в книге|из книги)/i, 'book'],
];

export function calloutKind(text) {
  const m = /^\*\*([^*]+)\*\*/.exec(text.trim());
  if (!m) return 'note';
  for (const [re, kind] of CALLOUTS) if (re.test(m[1])) return kind;
  return 'note';
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseBlocks(text) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'text';
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', lang, code: buf.join('\n') });
      continue;
    }
    if (line.startsWith('### ')) { blocks.push({ type: 'h3', text: line.slice(4).trim() }); i++; continue; }
    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      const body = buf.join('\n');
      blocks.push({ type: 'callout', kind: calloutKind(body), blocks: parseBlocks(body) });
      continue;
    }
    if (line.startsWith('?? ')) {
      const q = line.slice(3).trim();
      i++;
      const buf = [];
      while (i < lines.length && lines[i].startsWith('::')) buf.push(lines[i++].replace(/^::\s?/, ''));
      blocks.push({ type: 'qa', q, blocks: parseBlocks(buf.join('\n')) });
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''));
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push({ type: 'ol', items });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (
      i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !lines[i].startsWith('#')
      && !lines[i].startsWith('> ') && !lines[i].startsWith('?? ') && !/^\s*-\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i]) && !isTableRow(lines[i])
    ) buf.push(lines[i++]);
    if (buf.length) blocks.push({ type: 'p', text: buf.join(' ') });
    else i++;
  }
  return blocks;
}

export function parseTheory(md) {
  const parts = (md || '').replace(/\r\n/g, '\n').split(/^## /m);
  const intro = parseBlocks(parts[0]);
  const sections = parts.slice(1).map((p, k) => {
    const nl = p.indexOf('\n');
    const title = (nl < 0 ? p : p.slice(0, nl)).trim();
    return { id: `s${k + 1}`, title, blocks: parseBlocks(nl < 0 ? '' : p.slice(nl + 1)) };
  });
  return { intro, sections };
}

export function codeBlocks(md) {
  const out = [];
  const walk = (blocks, where) => {
    for (const b of blocks) {
      if (b.type === 'code') out.push({ ...b, where });
      if (b.blocks) walk(b.blocks, where);
    }
  };
  const t = parseTheory(md);
  walk(t.intro, 'вступление');
  for (const s of t.sections) walk(s.blocks, s.title);
  return out;
}

export function wordCount(md) {
  return ((md || '').replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
}

export const RUNNABLE = new Set(['sql', 'sql-error', 'sql-plan']);

const WRITE_WORDS = new Set(['insert', 'update', 'delete', 'create', 'alter', 'drop', 'truncate', 'merge', 'comment', 'grant', 'revoke', 'reindex', 'cluster', 'analyze']);

export function isWriteSql(code) {
  if (guard(code) && !guard(code, 'write')) return true;
  return tokens(code).some((t) => WRITE_WORDS.has(t));
}
