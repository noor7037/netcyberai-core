import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { minorToRupees, rupeesToMinor, yearlyTotalMinor } from '@/lib/fees/money';
import { addHead, addStructureVersion, listHeads, listStructures, setHeadActive, structureInForce } from '@/lib/fees/structures';

// Fee heads and structures (docs/23 6a, C157): money as whole paise, then
// the rules on the whole real schema as app_user.

describe('money is whole paise', () => {
  it('rupees typed by a person become paise, exactly', () => {
    expect(['1500', '1500.5', '1500.50', '1,500.50', ' 0.01 ', '0', '99999999.99'].map(rupeesToMinor)).toEqual([150000, 150050, 150050, 150050, 1, 0, 9999999999]);
    // 0.1 + 0.2 is not 0.3 in floating point; here ten paise and twenty paise are thirty.
    expect(rupeesToMinor('0.10')! + rupeesToMinor('0.20')!).toBe(rupeesToMinor('0.30'));
    for (const bad of ['', '-5', '1.234', 'abc', '1e3', '12.', '.5', '1 500', '9999999999', '100000000', null, 1500]) expect(rupeesToMinor(bad), String(bad)).toBeNull();
  });

  it('paise are shown as rupees in the Indian grouping', () => {
    expect([0, 1, 100, 150050, 12345678, 1000000000, -50050].map(minorToRupees)).toEqual(['0', '0.01', '1', '1,500.50', '1,23,456.78', '1,00,00,000', '-500.50']);
  });

  it('a structure’s yearly total is whole-number arithmetic', () => {
    // By hand: 1,500 a month (18,000) + 2,000 a quarter (8,000) + 5,000 once + 333.33 half-yearly (666.66) = 31,666.66
    expect(yearlyTotalMinor([{ amount_minor: 150000, frequency: 'monthly' }, { amount_minor: 200000, frequency: 'quarterly' }, { amount_minor: 500000, frequency: 'one_time' }, { amount_minor: 33333, frequency: 'half_yearly' }])).toBe(3166666);
  });
});

const A = 'ad000000-0000-4000-8000-000000000001';
const B = 'ad000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'ad000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'ad000000-0000-4000-8000-0000000000a2';
const TEACHER = 'ad000000-0000-4000-8000-0000000000a3';
const COORD = 'ad000000-0000-4000-8000-0000000000a4';
const PRINCIPAL_B = 'ad000000-0000-4000-8000-0000000000b1';
const C5 = 'ad000000-0000-4000-8000-0000000000c1';
const CB = 'ad000000-0000-4000-8000-0000000000c2';
const SESSION = 'ad000000-0000-4000-8000-0000000000e1';
const SESSION_B = 'ad000000-0000-4000-8000-0000000000e2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const coord: Who = { role: 'academic_coordinator', user: COORD, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
let tuition = '';
let transport = '';
const version = (who: Who, effectiveFrom: string, items: { headId: string; amountMinor: number; frequency: 'monthly' | 'annual' | 'quarterly' | 'half_yearly' | 'one_time' }[], more = {}) =>
  as(who, (c) => addStructureVersion(c, actor(who), { classId: C5, sessionId: SESSION, effectiveFrom, items, ...more }));

describe('heads and structures, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'),
        ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${COORD}', '${A}', 'c@a.invalid', 'academic_coordinator', 'Coordinator A'),
        ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values
        ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true), ('${SESSION_B}', '${B}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}'), ('${CB}', '${B}', '5-A', null);
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('the office adds fee heads; a name is used once per school, whatever its case', async () => {
    const t = await as(accountant, (c) => addHead(c, actor(accountant), { name: '  Tuition   fee ', isMandatory: true }));
    const tr = await as(principal, (c) => addHead(c, actor(principal), { name: 'Transport', isMandatory: false }));
    if (!t.ok || !tr.ok) throw new Error('unreachable');
    tuition = t.head.head_id;
    transport = tr.head.head_id;
    expect(t.head).toMatchObject({ name: 'Tuition fee', is_mandatory: true, is_active: true });
    expect(await as(accountant, (c) => addHead(c, actor(accountant), { name: 'tuition FEE', isMandatory: true }))).toEqual({ ok: false, reason: 'exists' });
    expect(await as(accountant, (c) => addHead(c, actor(accountant), { name: '   ', isMandatory: true }))).toEqual({ ok: false, reason: 'name' });
    // The same name in another school is that school's own.
    expect((await as(principalB, (c) => addHead(c, actor(principalB), { name: 'Tuition fee', isMandatory: true }))).ok).toBe(true);
    expect((await as(principal, (c) => listHeads(c, A))).map((h) => h.name)).toEqual(['Transport', 'Tuition fee']);
  });

  it('a structure changed mid-year leaves the earlier version in place; both are listed with their dates, and each is in force in its own time', async () => {
    const april = await version(accountant, '2026-04-01', [{ headId: tuition, amountMinor: 150000, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }]);
    const october = await version(principal, '2026-10-01', [{ headId: tuition, amountMinor: 165000, frequency: 'monthly' }, { headId: transport, amountMinor: 80000, frequency: 'monthly' }]);
    expect(april.ok && october.ok).toBe(true);
    const all = await as(principal, (c) => listStructures(c, A));
    expect(all.map((s) => [s.class_name, s.academic_year, s.effective_from, s.items.find((i) => i.head_name === 'Tuition fee')!.amount_minor])).toEqual([['5-A', '2026-27', '2026-10-01', 165000], ['5-A', '2026-27', '2026-04-01', 150000]]);
    const tuitionOn = async (date: string) => (await as(accountant, (c) => structureInForce(c, A, C5, SESSION, date)))?.items.find((i) => i.head_name === 'Tuition fee')?.amount_minor ?? null;
    expect([await tuitionOn('2026-03-31'), await tuitionOn('2026-04-01'), await tuitionOn('2026-09-30'), await tuitionOn('2026-10-01'), await tuitionOn('2027-03-31')]).toEqual([null, 150000, 150000, 165000, 165000]);
    // Both changes are in the audit log.
    expect((await db.pg.query(`select actor_user_id, after_state->>'effectiveFrom' as from_date from audit_log where school_id = $1 and event_action = 'fees.structure_version_added' order by audit_id`, [A])).rows).toEqual([{ actor_user_id: ACCOUNTANT, from_date: '2026-04-01' }, { actor_user_id: PRINCIPAL, from_date: '2026-10-01' }]);
  });

  it('a version is refused when it would overwrite one, lies outside the session, has no amount, or names a head that is retired or another school’s', async () => {
    const item = [{ headId: tuition, amountMinor: 170000, frequency: 'monthly' as const }];
    expect(await version(accountant, '2026-10-01', item)).toEqual({ ok: false, reason: 'version_exists' });
    expect(await version(accountant, '2026-03-31', item)).toEqual({ ok: false, reason: 'outside_session' });
    expect(await version(accountant, '2027-04-01', item)).toEqual({ ok: false, reason: 'outside_session' });
    expect(await version(accountant, '2026-11-01', [{ headId: tuition, amountMinor: 0, frequency: 'monthly' }])).toEqual({ ok: false, reason: 'no_items' });
    expect(await version(accountant, '2026-11-01', [{ headId: tuition, amountMinor: 100.5, frequency: 'monthly' }])).toEqual({ ok: false, reason: 'bad_item' });
    expect(await version(accountant, '2026-11-01', [...item, ...item])).toEqual({ ok: false, reason: 'bad_item' });
    expect(await version(accountant, '2026-11-01', item, { classId: CB })).toEqual({ ok: false, reason: 'unknown_class' });
    expect(await version(accountant, '2026-11-01', item, { sessionId: SESSION_B })).toEqual({ ok: false, reason: 'unknown_session' });
    const other = (await db.pg.query(`select head_id from fee_heads where school_id = $1`, [B])).rows[0].head_id;
    expect(await version(accountant, '2026-11-01', [{ headId: other, amountMinor: 100, frequency: 'monthly' }])).toEqual({ ok: false, reason: 'unknown_head' });
    await as(accountant, (c) => setHeadActive(c, actor(accountant), transport, false));
    expect(await version(accountant, '2026-11-01', [{ headId: transport, amountMinor: 80000, frequency: 'monthly' }])).toEqual({ ok: false, reason: 'unknown_head' });
    // The retired head is still on the versions already made.
    expect((await as(principal, (c) => listStructures(c, A)))[0].items.map((i) => i.head_name)).toEqual(['Transport', 'Tuition fee']);
    expect((await as(principal, (c) => listStructures(c, A)))).toHaveLength(2);
  });

  it('a fee rule is never overwritten: the app’s database role cannot change or delete a structure or its items, or delete a head', async () => {
    for (const sql of [`update fee_structures set effective_from = '2026-05-01'`, `delete from fee_structures`, `update fee_structure_items set amount_minor = 1`, `delete from fee_structure_items`, `delete from fee_heads`]) {
      await expect(as(principal, (c) => c.query(sql)), sql).rejects.toThrow(/permission denied/);
    }
    await expect(db.pg.query(`insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency) select school_id, structure_id, head_id, -1, 'monthly' from fee_structure_items limit 1`)).rejects.toThrow(/fee_structure_items_(amount_not_negative|one_per_head)/);
  });

  it('a teacher or a coordinator can read none of it and write none of it; another school sees nothing', async () => {
    for (const who of [teacher, coord]) {
      for (const table of ['fee_heads', 'fee_structures', 'fee_structure_items']) expect(await as(who, (c) => c.query(`select 1 from ${table}`).then((r: { rows: unknown[] }) => r.rows)), `${who.role} ${table}`).toEqual([]);
      expect(await as(who, (c) => addHead(c, actor(who), { name: 'Lab', isMandatory: false }))).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await version(who, '2026-12-01', [{ headId: tuition, amountMinor: 1, frequency: 'monthly' }])).toEqual({ ok: false, reason: 'not_allowed' });
      await expect(as(who, (c) => c.query(`insert into fee_heads (school_id, name) values ($1, 'Lab')`, [A]))).rejects.toThrow(/row-level security/);
    }
    expect(await as(principalB, (c) => listStructures(c, B))).toEqual([]);
    expect((await as(principalB, (c) => listHeads(c, B))).map((h) => h.name)).toEqual(['Tuition fee']);
  });

  it('Fees is switched on for every existing school, once, and a founder’s own switch is left alone', async () => {
    const statement = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261011193133_p3_fee_structures.sql'), 'utf8').match(/insert into school_module_entitlements[\s\S]*?;/)![0];
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'fees', false, 'founder_override')`, [B]);
    await db.pg.exec(statement);
    await db.pg.exec(statement);
    expect((await db.pg.query(`select school_id, enabled, source from school_module_entitlements where module_id = 'fees' order by school_id`)).rows).toEqual([{ school_id: A, enabled: true, source: 'plan' }, { school_id: B, enabled: false, source: 'founder_override' }]);
  });
});
