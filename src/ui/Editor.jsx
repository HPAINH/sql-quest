import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder as cmPlaceholder, drawSelection } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sql-key)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sql-str)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--sql-num)' },
  { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--ink-2)' },
  { tag: tags.typeName, color: 'var(--sql-num)' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: 'var(--sql-fn)' },
]);

const theme = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'transparent', fontSize: '14.5px' },
  '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--signal)', padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--ink-3)', border: 'none', fontFamily: 'var(--mono)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--signal)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--rule)', color: 'var(--ink)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--surface-2)', color: 'var(--ink)' },
  '.cm-placeholder': { color: 'var(--ink-3)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket': { backgroundColor: 'var(--selection)', outline: 'none' },
});

export function schemaForCompletion(schema) {
  const s = {};
  for (const t of schema) s[t.name] = t.columns.map((c) => c.name);
  return s;
}

export default function Editor({ value, onChange, onRun, onCheck, schema, readOnly = false, minLines = 6, ariaLabel = 'Редактор SQL' }) {
  const host = useRef(null);
  const view = useRef(null);
  const handlers = useRef({ onChange, onRun, onCheck });
  handlers.current = { onChange, onRun, onCheck };

  useEffect(() => {
    const keys = Prec.highest(keymap.of([
      { key: 'Mod-Shift-Enter', run: () => { handlers.current.onCheck?.(); return true; } },
      { key: 'Mod-Enter', run: () => { handlers.current.onRun?.(); return true; } },
    ]));
    const state = EditorState.create({
      doc: value || '',
      extensions: [
        readOnly ? [] : [lineNumbers(), highlightActiveLine(), history(), drawSelection(), closeBrackets(), indentOnInput(), autocompletion({ activateOnTyping: true }), cmPlaceholder('SELECT …'), keys],
        bracketMatching(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
        sql({ dialect: PostgreSQL, schema: schema ? schemaForCompletion(schema) : undefined, upperCaseKeywords: true }),
        syntaxHighlighting(highlight),
        theme,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange?.(u.state.doc.toString()); }),
        EditorView.theme({ '.cm-content': { minHeight: `${minLines * 1.5}em` } }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => view.current.destroy();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && value !== undefined && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className={`editor ${readOnly ? 'ro' : ''}`} ref={host} />;
}

export function focusEditor(el) {
  el?.querySelector('.cm-content')?.focus();
}
