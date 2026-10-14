import { describe, expect, it } from 'vitest';
import type { ModuleSettingsSchema } from '@/lib/contracts/settings';
import { applySettingsUpdate, effectiveValues, schemaProblems, validateValue } from './settings-engine';
import { SETTINGS_SCHEMAS } from './settings-schemas';

const schema: ModuleSettingsSchema = {
  moduleId: 'setup',
  version: 1,
  fields: [
    { key: 'accent_color', label: 'Accent', section: 'B', type: 'color_token', default: 'royal', editableBy: ['principal', 'school_admin'] },
    { key: 'working_days', label: 'Days', section: 'C', type: 'weekdays', default: ['MON', 'TUE'], required: true, editableBy: ['principal'] },
    { key: 'admission_format', label: 'Adm', section: 'N', type: 'numbering', default: 'ADM-{YYYY}-{SEQ:4}', editableBy: ['principal'] },
    {
      key: 'periods',
      label: 'Periods',
      section: 'T',
      type: 'list',
      default: [],
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'starts', label: 'Starts', type: 'time' },
      ],
      editableBy: ['principal'],
    },
  ],
};

describe('settings engine: keys', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('refuses the key %s, and leaves Object.prototype alone', (key) => {
    const set = JSON.parse(`{"${key}": {"polluted": true}}`);
    const r = applySettingsUpdate(schema, {}, { set }, 'principal');
    expect(r).toMatchObject({ ok: false, reason: 'invalid', errors: [{ key, message: 'is not a setting' }] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(applySettingsUpdate(schema, {}, { resetToDefault: [key] }, 'principal').ok).toBe(false);
  });

  it('refuses any key the schema does not declare, including inside list rows', () => {
    expect(applySettingsUpdate(schema, {}, { set: { unknown_key: 1 } }, 'principal')).toMatchObject({ ok: false, reason: 'invalid' });
    const row = JSON.parse('{"name": "P1", "starts": "08:00", "__proto__": {"x": 1}}');
    expect(applySettingsUpdate(schema, {}, { set: { periods: [row] } }, 'principal')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('ignores stored keys the schema no longer declares', () => {
    const eff = effectiveValues(schema, JSON.parse('{"accent_color": "grape", "old_key": 1, "__proto__": {"x": 1}}'));
    expect(Object.keys(eff).sort()).toEqual(['accent_color', 'admission_format', 'periods', 'working_days']);
    expect(eff.accent_color).toBe('grape');
  });
});

describe('settings engine: values and roles', () => {
  it('stores only what differs from the default and reports each change', () => {
    const r = applySettingsUpdate(schema, {}, { set: { accent_color: 'grape', working_days: ['MON', 'TUE'] } }, 'principal');
    expect(r).toEqual({ ok: true, values: { accent_color: 'grape' }, changes: [{ key: 'accent_color', from: null, to: 'grape' }] });
    const back = applySettingsUpdate(schema, { accent_color: 'grape' }, { resetToDefault: ['accent_color'] }, 'principal');
    expect(back).toEqual({ ok: true, values: {}, changes: [{ key: 'accent_color', from: 'grape', to: null }] });
  });

  it('refuses a field the role may not edit, as forbidden', () => {
    expect(applySettingsUpdate(schema, {}, { set: { working_days: ['MON'] } }, 'school_admin')).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(applySettingsUpdate(schema, {}, { set: { accent_color: 'grape' } }, 'teacher')).toMatchObject({ ok: false, reason: 'forbidden' });
  });

  it('validates every type', () => {
    const f = (key: string) => schema.fields.find((x) => x.key === key)!;
    expect(validateValue(f('accent_color'), '#ff0000')).not.toBeNull();
    expect(validateValue(f('accent_color'), 'toString')).not.toBeNull();
    expect(validateValue(f('working_days'), ['MON', 'MON'])).not.toBeNull();
    expect(validateValue(f('working_days'), [])).not.toBeNull();
    expect(validateValue(f('admission_format'), 'ADM-{SEQ:4}-{SEQ:2}')).not.toBeNull();
    expect(validateValue(f('admission_format'), 'adm-{SEQ:4}')).not.toBeNull();
    expect(validateValue(f('admission_format'), 'ADM/{YY}/{SEQ:5}')).toBeNull();
    expect(validateValue(f('periods'), [{ name: 'P1', starts: '25:00' }])).not.toBeNull();
    expect(validateValue(f('periods'), [{ name: 'P1', starts: '08:00' }])).toBeNull();
    expect(validateValue({ ...f('periods'), type: 'date', default: '' }, '2026-02-30')).not.toBeNull();
    expect(validateValue({ ...f('periods'), type: 'number', default: 0, min: 1, max: 9 }, 10)).not.toBeNull();
  });

  it('refuses an empty update and a key both set and reset', () => {
    expect(applySettingsUpdate(schema, {}, {}, 'principal').ok).toBe(false);
    expect(applySettingsUpdate(schema, {}, { set: { accent_color: 'grape' }, resetToDefault: ['accent_color'] }, 'principal').ok).toBe(false);
  });

  it('a rule between fields is held on the values that would be in force, whichever field is touched (C209)', () => {
    const num = (key: string, def: number) => ({ key, label: key, section: 'S', type: 'number' as const, default: def, min: 1, max: 100, editableBy: ['principal'] as const });
    const pair: ModuleSettingsSchema = {
      moduleId: 'setup',
      version: 1,
      fields: [num('low', 10), num('high', 30)],
      check: (v) => (Number(v.low) > Number(v.high) ? [{ key: 'low', message: 'cannot be more than high' }] : []),
    };
    expect(schemaProblems(pair)).toEqual([]);
    // Setting either field, or putting one back to its default, is judged with the other as it stands.
    expect(applySettingsUpdate(pair, {}, { set: { low: 31 } }, 'principal')).toEqual({ ok: false, reason: 'invalid', errors: [{ key: 'low', message: 'cannot be more than high' }] });
    expect(applySettingsUpdate(pair, {}, { set: { high: 9 } }, 'principal')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(applySettingsUpdate(pair, { low: 40, high: 50 }, { resetToDefault: ['high'] }, 'principal')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(applySettingsUpdate(pair, {}, { set: { low: 30 } }, 'principal')).toMatchObject({ ok: true, values: { low: 30 } });
    expect(applySettingsUpdate(pair, {}, { set: { low: 40, high: 50 } }, 'principal')).toMatchObject({ ok: true, values: { low: 40, high: 50 } });
    expect(applySettingsUpdate(pair, { low: 40, high: 50 }, { resetToDefault: ['low', 'high'] }, 'principal')).toMatchObject({ ok: true, values: {} });
    // A field's own range is still refused first, and a schema whose defaults break its own rule is reported.
    expect(applySettingsUpdate(pair, {}, { set: { low: 0 } }, 'principal')).toMatchObject({ ok: false, errors: [{ key: 'low', message: 'must be at least 1' }] });
    expect(schemaProblems({ ...pair, fields: [num('low', 40), num('high', 30)] })).toEqual(['low: the defaults cannot stand together (cannot be more than high)']);
  });
});

describe('registered schemas', () => {
  it('every registered schema is valid and each module has at most one', () => {
    for (const s of SETTINGS_SCHEMAS) expect(schemaProblems(s)).toEqual([]);
    expect(new Set(SETTINGS_SCHEMAS.map((s) => s.moduleId)).size).toBe(SETTINGS_SCHEMAS.length);
  });
});
