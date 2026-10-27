import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ListSettingEditor } from '@/components/settings/ListSettingEditor';
import type { SettingDefinition } from '@/lib/contracts/settings';
import { DEFAULT_EXAM_TYPES } from '@/lib/contracts/exam-types';
import { applySettingsUpdate } from '@/lib/frameworks/settings-engine';
import { blankKeptRow, codeFromText, finishListRows, listSummary, type ListRow } from '@/lib/frameworks/list-rows';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// A 'list' setting on the settings screen (C230-AJ): the rows a person types become rows the engine takes, a new row
// gets its code once, a saved row is kept (renamed or hidden, not removed), and every list has its words.

const exams = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'exams')!;
const types = exams.fields.find((f) => f.key === 'exam_types')!;
const defaults = DEFAULT_EXAM_TYPES.map((t) => ({ ...t })) as ListRow[];

describe('a code from words', () => {
  const pattern = /^[a-z][a-z0-9_]{1,39}$/;
  it('is the words in a-z, 0-9 and _, and never one already taken', () => {
    expect(codeFromText('Olympiad', [], pattern)).toBe('olympiad');
    expect(codeFromText('  Class-test  No. 2 ', [], pattern)).toBe('class_test_no_2');
    expect(codeFromText('Olympiad', ['olympiad'], pattern)).toBe('olympiad_2');
    expect(codeFromText('Olympiad', ['olympiad', 'olympiad_2'], pattern)).toBe('olympiad_3');
  });
  it('is valid for the column’s pattern whatever was typed: Hindi only, a number first, one letter', () => {
    for (const words of ['', 'ओलंपियाड', '2nd test', 'a', '!!!']) expect(codeFromText(words, [], pattern), words).toMatch(pattern);
  });
});

describe('the rows as sent', () => {
  it('a new row gets its code from its English name; words are trimmed; a row with nothing typed is left out', () => {
    const sent = finishListRows(types, [...defaults, { key: '', en: '  Olympiad ', hi: 'ओलंपियाड', hidden: false }, { key: '', en: '   ', hi: '', hidden: false }]);
    expect(sent.length).toBe(defaults.length + 1);
    expect(sent.at(-1)).toEqual({ key: 'olympiad', en: 'Olympiad', hi: 'ओलंपियाड', hidden: false });
    expect(sent.slice(0, defaults.length)).toEqual(defaults);
  });
  it('a saved row keeps its code when it is renamed', () => {
    const sent = finishListRows(types, defaults.map((r) => (r.key === 'unit' ? { ...r, en: 'Class test' } : r)));
    expect(sent.find((r) => r.en === 'Class test')).toMatchObject({ key: 'unit' });
  });
  it('two new rows with the same name get different codes', () => {
    const sent = finishListRows(types, [{ key: '', en: 'Quiz', hi: '', hidden: false }, { key: '', en: 'Quiz', hi: '', hidden: false }]);
    expect(sent.map((r) => r.key)).toEqual(['quiz', 'quiz_2']);
  });
  it('what is sent is what the engine takes', () => {
    const sent = finishListRows(types, [...defaults, { key: '', en: 'Olympiad', hi: '', hidden: false }]);
    expect(applySettingsUpdate(exams, {}, { set: { exam_types: sent as never } }, 'principal')).toMatchObject({ ok: true });
  });
  it('a saved row that is left without a name is found, so the screen can ask for one', () => {
    expect(blankKeptRow(types, defaults)).toBeNull();
    expect(blankKeptRow(types, [...defaults.slice(0, 2), { ...defaults[2], en: ' ', hi: '' }])).toBe(3);
    // A new row left empty is not a problem: it is simply left out.
    expect(blankKeptRow(types, [...defaults, { key: '', en: '', hi: '', hidden: false }])).toBeNull();
  });
  it('a list in a few words: the first column that is words and not a code', () => {
    expect(listSummary(types, defaults.slice(0, 3))).toBe('Weekly test, Monthly test, Unit test');
  });
});

describe('the engine checks a list column’s pattern and that a unique column is not repeated', () => {
  const set = (rows: unknown) => applySettingsUpdate(exams, {}, { set: { exam_types: rows as never } }, 'principal');
  it('a bad code, a repeated code and a hidden that is not yes or no are refused', () => {
    expect(set([{ key: 'Bad Code', en: 'X', hi: 'X', hidden: false }])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(set([{ key: 'a', en: 'X', hi: 'X', hidden: false }])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(set([{ key: 'one', en: 'X', hi: 'X', hidden: false }, { key: 'one', en: 'Y', hi: 'Y', hidden: false }])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(set([{ key: 'one', en: 'X', hi: 'X', hidden: 'no' }])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(set([{ key: 'one', en: 'X', hi: 'X', hidden: false }])).toMatchObject({ ok: true });
  });
  it('only the office changes the list', () => {
    expect(applySettingsUpdate(exams, {}, { set: { exam_types: defaults as never } }, 'teacher')).toMatchObject({ ok: false, reason: 'forbidden' });
  });
});

describe('every list setting has its words, in English and Hindi', () => {
  const E = en as Record<string, string>;
  const H = hi as Record<string, string>;
  const lists = SETTINGS_SCHEMAS.flatMap((s) => s.fields.filter((f) => f.type === 'list').map((f) => [s.moduleId, f] as const));
  it('there is a list, and each column and the add button have their words', () => {
    expect(lists.length).toBeGreaterThan(0);
    for (const [moduleId, f] of lists) {
      for (const c of (f.columns ?? []).filter((x) => !x.codeFrom)) {
        const key = `set.${moduleId}.${f.key}.col.${c.key}`;
        expect(E[key], key).toBe(c.label);
        expect(/[ऀ-ॿ]/.test(H[key] ?? ''), `${key} in Hindi`).toBe(true);
      }
      const add = `set.${moduleId}.${f.key}.add`;
      expect(E[add], add).toBeTruthy();
      expect(/[ऀ-ॿ]/.test(H[add] ?? ''), `${add} in Hindi`).toBe(true);
    }
    for (const k of ['set.list.code', 'set.list.new', 'set.list.remove', 'set.list.pinned', 'set.list.unnamed']) {
      expect(E[k], k).toBeTruthy();
      expect(/[ऀ-ॿ]/.test(H[k] ?? ''), `${k} in Hindi`).toBe(true);
    }
  });
});

describe('the list editor', () => {
  const render = (rows: ListRow[], over: Partial<SettingDefinition> = {}, disabled = false) =>
    renderToStaticMarkup(h(ListSettingEditor, { moduleId: 'exams', def: { ...types, ...over }, rows, disabled, onChange: () => undefined }));
  it('one card for each row, with its code, its names and whether it is hidden; the code is not a field', () => {
    const html = render(defaults);
    expect((html.match(/data-list-row="/g) ?? []).length).toBe(defaults.length);
    expect(html).toContain('data-list-row-code="unit"');
    expect(html).toContain('Code: unit');
    expect(html).toContain('Name in English');
    expect(html).toContain('Name in Hindi');
    expect(html).toContain('Hidden');
    expect(html).not.toContain('Short code');
    expect(html).toContain('Add an exam type');
  });
  it('a saved row cannot be removed; a new one can', () => {
    const html = render([...defaults, { key: '', en: '', hi: '', hidden: false }]);
    expect((html.match(/data-list-remove=/g) ?? []).length).toBe(1);
    expect(html).toContain(`data-list-remove="${defaults.length}"`);
    expect(html).toContain('>New<');
  });
  it('"Other" is pinned: shown, its Hidden switch fixed off', () => {
    const html = render(defaults);
    const other = html.slice(html.indexOf('data-list-row-code="other"'));
    expect(other).toContain('This one always stays and is always shown.');
    expect(other.slice(0, other.indexOf('</li>'))).toMatch(/type="checkbox"[^>]*disabled/);
  });
  it('a person who may not change it can read it and not change it', () => {
    const html = render(defaults, {}, true);
    expect(html).toContain('disabled');
    expect(html).toMatch(/data-list-add[^>]*disabled/);
  });
});
