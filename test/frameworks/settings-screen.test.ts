import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { applySettingsUpdate } from '@/lib/frameworks/settings-engine';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readAllSettings, saveSettings } from '@/lib/frameworks/settings-store';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// The school's Settings screen is generated from the module settings
// schemas (17 §1a, C166). These tests hold the two things a generated
// screen depends on: every field has its words in both languages, and the
// list a person gets is cut by entitlement and role.

describe('every setting has its words, in English and Hindi', () => {
  const E = en as Record<string, string>;
  const H = hi as Record<string, string>;
  it('a label and a plain sentence for each field; the English is the schema’s own', () => {
    for (const schema of SETTINGS_SCHEMAS) {
      for (const f of schema.fields) {
        const base = `set.${schema.moduleId}.${f.key}`;
        expect(E[`${base}.label`], `${base}.label`).toBe(f.label);
        expect(E[`${base}.help`], `${base}.help`).toBe(f.help);
        for (const part of ['label', 'help']) expect(/[ऀ-ॿ]/.test(H[`${base}.${part}`] ?? ''), `${base}.${part} in Hindi`).toBe(true);
      }
      expect(E[`module.${schema.moduleId}`], `module.${schema.moduleId}`).toBeTruthy();
    }
  });
  it('no words are left for a setting that no longer exists', () => {
    const known = new Set(SETTINGS_SCHEMAS.flatMap((s) => s.fields.flatMap((f) => [`set.${s.moduleId}.${f.key}.label`, `set.${s.moduleId}.${f.key}.help`])));
    expect(Object.keys(E).filter((k) => /^set\.[a-z-]+\.[a-z_]+\.(label|help)$/.test(k) && !known.has(k))).toEqual([]);
  });
});

describe('the on/off field type', () => {
  const fees = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees')!;
  it('the late fee is an on/off setting, off by default, beside its amount', () => {
    expect(fees.fields.find((f) => f.key === 'late_fee_enabled')).toMatchObject({ type: 'boolean', default: false });
    expect(fees.fields.find((f) => f.key === 'late_fee_rupees')).toMatchObject({ type: 'number', default: 0 });
  });
  it('takes true or false and nothing else; resetting puts it back to off', () => {
    expect(applySettingsUpdate(fees, {}, { set: { late_fee_enabled: true } }, 'principal')).toMatchObject({ ok: true, values: { late_fee_enabled: true } });
    for (const bad of ['yes', 1, 'true']) expect(applySettingsUpdate(fees, {}, { set: { late_fee_enabled: bad } }, 'principal'), String(bad)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(applySettingsUpdate(fees, { late_fee_enabled: true }, { resetToDefault: ['late_fee_enabled'] }, 'principal')).toMatchObject({ ok: true, values: {} });
    expect(applySettingsUpdate(fees, {}, { set: { late_fee_enabled: true } }, 'accountant')).toMatchObject({ ok: false, reason: 'forbidden' });
  });
});

const A = 'd1000000-0000-4000-8000-000000000001';
const B = 'd1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'd1000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd1000000-0000-4000-8000-0000000000a2';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (school: string, role: string, user: string, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', role], ['app.current_user_id', user]]) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });

describe('what a person gets on the Settings screen (whole schema, as the app’s role)', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A');
      insert into school_entitlements (school_id, plan, access_mode) values ('${A}', 'standard', 'full'), ('${B}', 'standard', 'full') on conflict (school_id) do update set plan = 'standard', access_mode = 'full';
      insert into school_module_entitlements (school_id, module_id, enabled, source)
      select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array['setup', 'students', 'attendance', 'recovery', 'fees', 'timetable']) m
      on conflict (school_id, module_id) do update set enabled = true;
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('the principal gets every module’s settings the school has, each field at its default and open to change', async () => {
    const all = await as(A, 'principal', PRINCIPAL, (c) => readAllSettings(c, { schoolId: A, role: 'principal' }));
    expect(all.map((m: { moduleId: string }) => m.moduleId)).toEqual(['setup', 'students', 'attendance', 'recovery', 'fees', 'timetable']);
    expect(all.every((m: { revision: number; fields: { isDefault: boolean; mayEdit: boolean }[] }) => m.revision === 0 && m.fields.every((f) => f.isDefault && f.mayEdit))).toBe(true);
  });

  it('a module switched off for the school is left out', async () => {
    await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'fees'`, [A]);
    const all = await as(A, 'principal', PRINCIPAL, (c) => readAllSettings(c, { schoolId: A, role: 'principal' }));
    expect(all.map((m: { moduleId: string }) => m.moduleId)).not.toContain('fees');
    await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'fees'`, [A]);
  });

  it('a teacher gets only the modules a teacher can open, and may change nothing; the store refuses a save as well', async () => {
    const all = await as(A, 'teacher', TEACHER, (c) => readAllSettings(c, { schoolId: A, role: 'teacher' }));
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((m: { moduleId: string }) => m.moduleId)).not.toContain('fees');
    expect(all.every((m: { fields: { mayEdit: boolean }[] }) => m.fields.every((f) => !f.mayEdit))).toBe(true);
    const attendance = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'attendance')!;
    expect(await as(A, 'teacher', TEACHER, (c) => saveSettings(c, { schoolId: A, userId: TEACHER, role: 'teacher' }, attendance, { moduleId: 'attendance', baseRevision: 0, set: { correction_window_days: 30 } }))).toMatchObject({ ok: false, reason: 'forbidden' });
  });

  it('a saved value shows as the school’s own, with its history and audit row; another school still has the default', async () => {
    const fees = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'fees')!;
    expect(await as(A, 'principal', PRINCIPAL, (c) => saveSettings(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, fees, { moduleId: 'fees', baseRevision: 0, set: { late_fee_enabled: true, late_fee_rupees: 50 } }))).toMatchObject({ ok: true });
    const mine = (await as(A, 'principal', PRINCIPAL, (c) => readAllSettings(c, { schoolId: A, role: 'principal' }))).find((m: { moduleId: string }) => m.moduleId === 'fees');
    expect(mine.revision).toBe(1);
    expect(Object.fromEntries(mine.fields.map((f: { def: { key: string }; value: unknown; isDefault: boolean }) => [f.def.key, [f.value, f.isDefault]]))).toMatchObject({ late_fee_enabled: [true, false], late_fee_rupees: [50, false], late_fee_grace_days: [0, true], due_day: [10, true] });
    const theirs = (await as(B, 'principal', PRINCIPAL, (c) => readAllSettings(c, { schoolId: B, role: 'principal' }))).find((m: { moduleId: string }) => m.moduleId === 'fees');
    expect(theirs.fields.every((f: { isDefault: boolean }) => f.isDefault)).toBe(true);
    expect((await db.pg.query(`select count(*)::int as n from school_setting_changes where school_id = $1 and module_id = 'fees'`, [A])).rows[0].n).toBe(2);
    expect((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'settings.changed'`, [A])).rows[0].n).toBe(1);
    // A stale page cannot overwrite it.
    expect(await as(A, 'principal', PRINCIPAL, (c) => saveSettings(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' }, fees, { moduleId: 'fees', baseRevision: 0, set: { due_day: 5 } }))).toMatchObject({ ok: false, reason: 'stale_revision' });
  });
});
