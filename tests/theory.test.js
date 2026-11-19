import { describe, it, expect } from 'vitest';
import { parseBlocks, parseTheory, codeBlocks, isWriteSql, calloutKind } from '../src/engine/theory.js';

describe('theory markdown', () => {
  it('splits sections and keeps intro', () => {
    const t = parseTheory('Вступление.\n\n## Первый\n\nТекст.\n\n## Второй\n\n- a\n- b');
    expect(t.intro).toHaveLength(1);
    expect(t.sections.map((s) => s.title)).toEqual(['Первый', 'Второй']);
    expect(t.sections[1].blocks[0]).toEqual({ type: 'ul', items: ['a', 'b'] });
  });

  it('parses tables, callouts, q&a and code', () => {
    const b = parseBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> **Ловушка.** Осторожно.\n\n?? Вопрос?\n:: Ответ.\n\n```sql\nSELECT 1;\n```');
    expect(b.map((x) => x.type)).toEqual(['table', 'callout', 'qa', 'code']);
    expect(b[0].rows).toEqual([['1', '2']]);
    expect(b[1].kind).toBe('warn');
    expect(b[3]).toMatchObject({ lang: 'sql', code: 'SELECT 1;' });
  });

  it('classifies callouts', () => {
    expect(calloutKind('**Совет.** x')).toBe('tip');
    expect(calloutKind('**На собеседовании.** x')).toBe('interview');
    expect(calloutKind('просто текст')).toBe('note');
  });

  it('finds code blocks inside callouts', () => {
    expect(codeBlocks('## A\n\n> **Совет.** см.\n>\n> ```sql\n> SELECT 2;\n> ```')).toHaveLength(1);
  });

  it('detects write scripts', () => {
    expect(isWriteSql('SELECT updated_at FROM stock')).toBe(false);
    expect(isWriteSql('UPDATE products SET price = 1 WHERE product_id = 1')).toBe(true);
    expect(isWriteSql('WITH d AS (DELETE FROM reviews RETURNING 1) SELECT COUNT(*) FROM d')).toBe(true);
    expect(isWriteSql("SELECT 'insert' AS word")).toBe(false);
  });
});
