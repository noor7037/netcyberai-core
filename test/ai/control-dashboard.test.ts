import { describe, expect, it } from 'vitest';
import type { Counts, ModelList } from '@/lib/ai/control';
import { flatRows, nextSort, sortRows, type FlatRow } from '@/lib/ai/lab/rows';
import type { LabResult } from '@/lib/ai/lab/store';
import { labTable } from '@/lib/ai/lab/table';
import { groupsFor, hasDuplicate, optionValue, otherValue, parseOption, selectedValue, validModel } from '@/lib/ai/model-options';
import { splitUsage, totals } from '@/lib/ai/usage-view';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// W6-C (C397): Control → AI as a dashboard. The pure parts: the one "provider · model" drop-down's options, the Use
// table's collapse and totals, and the Quality Lab's sortable rows.

const list = (models: string[], ok = true): ModelList => ({ models, ok, fetchedAt: '2026-10-28T10:00:00.000Z' });

describe('the provider · model drop-down', () => {
  it('has a group per provider with the ids its latest list holds, and none from a failed or missing list', () => {
    const g = groupsFor(['openai', 'anthropic', 'google'], { openai: list(['gpt-4o-mini', 'gpt-4o']), anthropic: list(['x'], false) });
    expect(g).toEqual([
      { provider: 'openai', models: ['gpt-4o-mini', 'gpt-4o'] },
      { provider: 'anthropic', models: [] },
      { provider: 'google', models: [] },
    ]);
  });

  it('adds a provider the saved route holds even when the choices lack it', () => {
    expect(groupsFor(['openai'], {}, ['stand-in', 'openai', '']).map((x) => x.provider)).toEqual(['openai', 'stand-in']);
  });

  it('encodes an option as provider|model and "Other…" apart from every model id', () => {
    expect(parseOption(optionValue('openai', 'gpt-4o'))).toEqual({ provider: 'openai', model: 'gpt-4o' });
    expect(parseOption(optionValue('workers', '@cf/meta/llama:8b'))).toEqual({ provider: 'workers', model: '@cf/meta/llama:8b' });
    expect(parseOption(otherValue('openai'))).toEqual({ provider: 'openai', model: null });
    expect(parseOption('')).toBeNull();
    // '*' is not in the model rule, so no model id can equal the "Other…" item.
    expect(validModel('*other')).toBe(false);
  });

  it('shows the list item, "Other…" for a model the list lacks or while typing, and nothing for no choice', () => {
    const g = groupsFor(['openai'], { openai: list(['gpt-4o']) });
    expect(selectedValue(g, { provider: 'openai', model: 'gpt-4o' }, false)).toBe('openai|gpt-4o');
    expect(selectedValue(g, { provider: 'openai', model: 'gpt-9' }, false)).toBe(otherValue('openai'));
    expect(selectedValue(g, { provider: 'openai', model: '' }, true)).toBe(otherValue('openai'));
    expect(selectedValue(g, { provider: 'openai', model: '' }, false)).toBe('');
    expect(selectedValue(g, { provider: '', model: '' }, true)).toBe('');
  });

  it('holds a typed model to the server’s rule', () => {
    for (const ok of ['gpt-4o-mini', 'claude-sonnet-4-5', '@cf/meta/llama-3.1-8b-instruct', 'gemini-2.0:flash', ' gpt-4o ']) expect(validModel(ok), ok).toBe(true);
    for (const bad of ['', 'GPT 4o', 'Claude Sonnet 4.5', 'a'.repeat(81), 'model|x', 'né']) expect(validModel(bad), bad).toBe(false);
  });

  it('finds the same provider and model in two slots, and ignores empty slots', () => {
    const a = { provider: 'openai', model: 'gpt-4o' };
    expect(hasDuplicate([a, { provider: 'anthropic', model: 'gpt-4o' }, { provider: 'openai', model: ' gpt-4o ' }])).toBe(true);
    expect(hasDuplicate([a, { provider: 'openai', model: 'gpt-4o-mini' }])).toBe(false);
    expect(hasDuplicate([{ provider: '', model: '' }, { provider: '', model: '' }])).toBe(false);
  });
});

const counts = (p: Partial<Counts>): Counts => ({ requests: 0, failures: 0, capRefusals: 0, tokensIn: 0, tokensOut: 0, ...p });

describe('the Use table', () => {
  const usage = [
    { profileId: 'a', today: counts({ requests: 3, failures: 1 }), month: counts({ requests: 10, failures: 2, capRefusals: 1 }) },
    { profileId: 'b', today: counts({}), month: counts({}) },
    { profileId: 'c', today: counts({}), month: counts({ requests: 4 }) },
    { profileId: 'd', today: counts({}), month: counts({}) },
  ];
  it('collapses only the workloads with nothing today and nothing this month', () => {
    const s = splitUsage(usage);
    expect(s.active.map((u) => u.profileId)).toEqual(['a', 'c']);
    expect(s.idle.map((u) => u.profileId)).toEqual(['b', 'd']);
  });
  it('adds the counts and shows honest zeros when there is no use', () => {
    expect(totals(usage)).toEqual({ today: counts({ requests: 3, failures: 1 }), month: counts({ requests: 14, failures: 2, capRefusals: 1 }) });
    expect(totals([])).toEqual({ today: counts({}), month: counts({}) });
    expect(splitUsage([usage[1], usage[3]]).active).toEqual([]);
  });
});

const result = (caseId: string, model: string, p: Partial<LabResult>): LabResult => ({
  resultId: `${caseId}-${model}`,
  caseId,
  provider: 'openai',
  model,
  outputText: 'x',
  latencyMs: 100,
  firstTokenMs: null,
  tokensIn: 1,
  tokensOut: 1,
  jsonValid: null,
  checkPassed: null,
  errorClass: null,
  score: null,
  notes: null,
  createdAt: '2026-10-28T10:00:00.000Z',
  costUsd: null,
  ...p,
});

describe('the Quality Lab’s sortable rows', () => {
  const run = {
    caseIds: ['c1', 'c2'],
    models: [
      { provider: 'openai', model: 'm1' },
      { provider: 'openai', model: 'm2' },
    ],
    results: [
      result('c1', 'm1', { latencyMs: 900, score: 3, costUsd: 0.2 }),
      result('c1', 'm2', { latencyMs: 300, score: 5, costUsd: 0.1 }),
      result('c2', 'm1', { latencyMs: 600, score: null, tokensIn: 50 }),
      // c2 with m2 has not run.
    ],
  };
  const rows = flatRows(labTable(run));
  const ids = (r: FlatRow[]) => r.map((x) => `${x.caseId}/${x.link.model}`);

  it('has a row for each case and model, a cell not run yet included', () => {
    expect(ids(rows)).toEqual(['c1/m1', 'c1/m2', 'c2/m1', 'c2/m2']);
    expect(rows[3].result).toBeNull();
  });
  it('sorts by a column in either direction, with the unrun cell and the unscored last', () => {
    expect(ids(sortRows(rows, { key: 'time', dir: 'asc' }))).toEqual(['c1/m2', 'c2/m1', 'c1/m1', 'c2/m2']);
    expect(ids(sortRows(rows, { key: 'time', dir: 'desc' }))).toEqual(['c1/m1', 'c2/m1', 'c1/m2', 'c2/m2']);
    expect(ids(sortRows(rows, { key: 'score', dir: 'desc' }))).toEqual(['c1/m2', 'c1/m1', 'c2/m1', 'c2/m2']);
    expect(ids(sortRows(rows, { key: 'cost', dir: 'asc' }))).toEqual(['c1/m2', 'c1/m1', 'c2/m1', 'c2/m2']);
    expect(ids(sortRows(rows, { key: 'tokens', dir: 'desc' }))[0]).toBe('c2/m1');
  });
  it('keeps the run’s own order without a sort, and for equal values', () => {
    expect(sortRows(rows, null)).toBe(rows);
    expect(ids(sortRows(rows, { key: 'model', dir: 'asc' }))).toEqual(['c1/m1', 'c2/m1', 'c1/m2', 'c2/m2']);
  });
  it('sorts the model column by what is shown, so blind letters do not leak the names', () => {
    const letter = (r: FlatRow) => (r.column === 0 ? 'Model B' : 'Model A');
    expect(ids(sortRows(rows, { key: 'model', dir: 'asc' }, letter))).toEqual(['c1/m2', 'c2/m2', 'c1/m1', 'c2/m1']);
  });
  it('cycles ascending, descending, off', () => {
    const a = nextSort(null, 'time');
    expect(a).toEqual({ key: 'time', dir: 'asc' });
    const d = nextSort(a, 'time');
    expect(d).toEqual({ key: 'time', dir: 'desc' });
    expect(nextSort(d, 'time')).toBeNull();
    expect(nextSort(d, 'cost')).toEqual({ key: 'cost', dir: 'asc' });
  });
});

describe('the words', () => {
  it('every new key has English and Hindi', () => {
    const keys = Object.keys(en).filter((k) => /^control\.ai\.(stat|pick|lab\.col)\./.test(k) || ['control.ai.slot.duplicate', 'control.ai.route.rollback', 'control.ai.card.settings', 'control.ai.usage.none', 'control.ai.usage.noneNames', 'control.ai.usage.total'].includes(k));
    expect(keys.length).toBeGreaterThan(25);
    for (const k of keys) expect((hi as Record<string, string>)[k], k).toBeTruthy();
  });
});
