import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { disclosureCsv, loadDisclosure, removeDisclosure, saveDisclosure } from '@/lib/compliance/disclosure';
import { deskInPlan, endingCount, importRegister, loadRegister, saveQualification } from '@/lib/compliance/qualifications';
import { computeForm6Advisory } from '@/lib/compliance/form6';
import { addSqaafFile, addSqaafNote, fileLabel, loadSqaaf, removeSqaafEvidence, sqaafFileUrl } from '@/lib/compliance/sqaaf';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { blankTeacher, teachersToCsv } from '@/lib/free-tools/teacher-register';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';
import { TODAY_PROVIDERS } from '@/lib/today/cards';

// The compliance desk on the whole schema, as the app's database role (docs/28 row 10d, C227). Acceptance:
//   - a qualification expiring within the window shows on My Day and on the desk;
//   - disclosure data exports exactly what is kept;
//   - (Form 6 reads the fee structures, never a typed copy: test/compliance/routes.test.ts);
//   - each evidence row names its standard;
//   - only the office reads staff qualifications.
// And: a TET certificate has no end date unless the school types one; no Aadhaar number anywhere, by the app and by
// the database; who else can read or write a row (another school, a teacher, the accountant, the academic
// coordinator, the platform role); audit rows hold ids, codes and booleans only. Every name is made up.

const A = 'c2270000-0000-4000-8000-0000000000a1';
const B = 'c2270000-0000-4000-8000-0000000000b1';
const u = (n: number) => `c2270000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TEACHER, TEACHER2, COORDINATOR, ACCOUNTANT, PRINCIPAL_B, TEACHER_B, LEFT] = [u(1), u(2), u(3), u(4), u(5), u(6), u(7), u(8), u(9)];
const TODAY = indiaDate();
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacher: Who = { role: 'teacher', user: TEACHER };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
const OUTSIDE = [teacher, coordinator, accountant];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const actor = (w: Who) => ({ schoolId: w.school ?? A, userId: w.user, role: w.role as any });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T = any,>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T = any,>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const row = (over: Record<string, string> = {}) => ({ stage: '', subjects: '', degree: '', postgraduate_degree: '', professional_qualification: '', tet_type: '', tet_paper: '', tet_certificate_date: '', tet_valid_until: '', other_approval: '', other_valid_until: '', ...over });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const audits = async (prefix = 'compliance_desk.'): Promise<any[]> => (await db.pg.query(`select event_action, target_id, before_state, after_state from audit_log where school_id = $1 and event_action like $2 order by audit_id`, [A, `${prefix}%`])).rows;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'compliance', true, 'plan'), ('${B}', 'compliance', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@a.example', 'school_admin', 'Asif Admin'),
      ('${TEACHER}', '${A}', 't@a.example', 'teacher', 'Tara Teacher'), ('${TEACHER2}', '${A}', 't2@a.example', 'teacher', 'Tanvi Teacher'),
      ('${COORDINATOR}', '${A}', 'co@a.example', 'academic_coordinator', 'Kiran Coordinator'), ('${ACCOUNTANT}', '${A}', 'acc@a.example', 'accountant', 'Anil Accountant'),
      ('${PRINCIPAL_B}', '${B}', 'p@b.example', 'principal', 'Bela Principal'), ('${TEACHER_B}', '${B}', 't@b.example', 'teacher', 'Tara Teacher');
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${LEFT}', '${A}', 'left@a.example', 'teacher', 'Lata Left', false);
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('teacher qualifications and TET', () => {
  it('the office records a row; a TET certificate issued after 2021 has no end date unless the school types one', async () => {
    const saved = await as(principal, (c) => saveQualification(c, actor(principal), TEACHER, row({ stage: 'primary', subjects: 'EVS, Hindi', degree: 'B.A.', professional_qualification: 'D.El.Ed', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-06-01' })));
    expect(saved).toEqual({ ok: true, changed: ['stage', 'subjects', 'degree', 'professional_qualification', 'tet_type', 'tet_paper', 'tet_certificate_date'] });
    const reg = (await as(principal, (c) => loadRegister(c, actor(principal))))!;
    expect(reg.staff.map((s) => s.name)).toEqual(['Asif Admin', 'Kiran Coordinator', 'Priya Principal', 'Tanvi Teacher', 'Tara Teacher']); // active teaching staff; no accountant, no one who left
    const tara = reg.staff.find((s) => s.user_id === TEACHER)!;
    expect([tara.gaps, tara.endings, tara.updated_by]).toEqual([[], [], 'Priya Principal']);
    expect(tara.qualification).toMatchObject({ stage: 'primary', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-06-01', tet_valid_until: null });
    // Saving the same row again changes nothing and writes no audit row.
    expect(await as(admin, (c) => saveQualification(c, actor(admin), TEACHER, row({ stage: 'primary', subjects: 'EVS, Hindi', degree: 'B.A.', professional_qualification: 'D.El.Ed', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-06-01' })))).toEqual({ ok: true, changed: [] });
    expect((await audits()).filter((a) => a.event_action === 'compliance_desk.qualification_saved')).toHaveLength(1);
  });

  it('a qualification expiring within the window shows on the desk and on My Day, for the office only; one passed counts too', async () => {
    const soon = addDays(TODAY, 20);
    const passed = addDays(TODAY, -3);
    expect((await as(admin, (c) => saveQualification(c, actor(admin), TEACHER2, row({ stage: 'upper', tet_type: 'State TET', tet_paper: 'II', tet_certificate_date: addDays(TODAY, -400), tet_valid_until: soon, other_approval: 'District approval', other_valid_until: passed })))).ok).toBe(true);
    const reg = (await as(principal, (c) => loadRegister(c, actor(principal))))!;
    expect(reg.endings.map((e) => [e.name, e.kind, e.label, e.until, e.days])).toEqual([
      ['Tanvi Teacher', 'other', 'District approval', passed, -3],
      ['Tanvi Teacher', 'tet', 'State TET', soon, 20],
    ]);
    expect(reg.totals).toMatchObject({ staff: 5, recorded: 2, ending: 1, passed: 1 });
    expect(await endingCount(db.pg, A)).toBe(2);
    const provider = TODAY_PROVIDERS.find((p) => p.type === 'qualifications-ending')!;
    const load = (who: Who) => as(who, (c) => provider.load(c, { schoolId: A, userId: who.user, role: who.role, sunday: false } as never));
    expect(provider.roles).toEqual(['principal', 'school_admin']);
    expect(await load(principal)).toEqual([{ id: 'qualifications-ending', type: 'qualifications-ending', moduleId: 'compliance', state: 'todo', count: 2, href: '/app/compliance/desk' }]);
    expect(await load(admin)).toHaveLength(1);
    // A teacher's own session reads no row, so would count nothing (and the card is not theirs).
    expect(await as(teacher, (c) => endingCount(c, A))).toBe(0);
  });

  it('the window is the school’s setting: a date 75 days ahead is listed at 90 days, not at 60', async () => {
    await as(principal, (c) => saveQualification(c, actor(principal), PRINCIPAL, row({ stage: 'secondary', other_approval: 'Board approval', other_valid_until: addDays(TODAY, 75) })));
    const ends = async () => (await as(principal, (c) => loadRegister(c, actor(principal))))!.endings.filter((e) => e.user_id === PRINCIPAL).length;
    expect(await ends()).toBe(1);
    const schema = settingsSchemaFor('compliance')!;
    expect(await as(principal, (c) => saveSettings(c, actor(principal) as never, schema, { moduleId: 'compliance', baseRevision: 0, set: { expiry_window: '60', secondary_degree: true } }))).toMatchObject({ ok: true });
    expect(await ends()).toBe(0);
    const reg = (await as(principal, (c) => loadRegister(c, actor(principal))))!;
    expect(reg.settings.window).toBe(60);
    expect(reg.staff.find((s) => s.user_id === PRINCIPAL)!.gaps).toEqual(['degree']);
    expect(await as(teacher, (c) => saveSettings(c, actor(teacher) as never, schema, { moduleId: 'compliance', baseRevision: 1, set: { expiry_window: '30' } }))).toMatchObject({ ok: false });
    expect(await as(principal, (c) => saveSettings(c, actor(principal) as never, schema, { moduleId: 'compliance', baseRevision: 1, resetToDefault: ['expiry_window', 'secondary_degree'] }))).toMatchObject({ ok: true });
  });

  it('only the office reads staff qualifications: a teacher, the coordinator, the accountant, another school and the platform role read nothing and write nothing', async () => {
    for (const who of OUTSIDE) {
      expect(await as(who, (c) => loadRegister(c, actor(who))), who.role).toBeNull();
      expect(await as(who, (c) => saveQualification(c, actor(who), TEACHER, row({ stage: 'pre' }))), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect((await as(who, (c) => c.query(`select * from staff_qualifications`))).rows, who.role).toEqual([]);
      await expect(as(who, (c) => c.query(`insert into staff_qualifications (school_id, user_id, updated_by, stage) values ($1, $2, $3, 'pre')`, [A, COORDINATOR, who.user])), who.role).rejects.toThrow(/row-level security|policy/);
      expect((await as(who, (c) => c.query(`update staff_qualifications set stage = 'pre'`))).affectedRows ?? 0, who.role).toBe(0);
    }
    // A teacher's own row is the office's too: the teacher reads not even their own.
    expect((await as(teacher, (c) => c.query(`select * from staff_qualifications where user_id = $1`, [TEACHER]))).rows).toEqual([]);
    expect((await as(principalB, (c) => c.query(`select * from staff_qualifications`))).rows).toEqual([]);
    expect(await as(principalB, (c) => saveQualification(c, actor(principalB), TEACHER, row({ stage: 'pre' })))).toEqual({ ok: false, reason: 'not_staff' });
    await expect(platform((c) => c.query(`select * from staff_qualifications`))).rejects.toThrow(/permission denied/);
    // In one's own name only.
    await expect(as(principal, (c) => c.query(`update staff_qualifications set updated_by = $1 where user_id = $2`, [ADMIN, TEACHER]))).rejects.toThrow(/row-level security|policy/);
  });

  it('the database holds the rules too: no Aadhaar number, no TET paper or date without a TET, no certificate after today, no end before the start, teaching staff only', async () => {
    expect(await as(principal, (c) => saveQualification(c, actor(principal), TEACHER, row({ stage: 'primary', degree: 'B.A. 1234 5678 9012' })))).toMatchObject({ ok: false, reason: 'aadhaar', field: 'degree' });
    const insert = (cols: Record<string, string>) =>
      as(principal, (c) => c.query(`insert into staff_qualifications (school_id, user_id, updated_by, ${Object.keys(cols).join(', ')}) values ($1, $2, $3, ${Object.keys(cols).map((_, i) => `$${i + 4}`).join(', ')})`, [A, COORDINATOR, PRINCIPAL, ...Object.values(cols)]));
    await expect(insert({ degree: 'B.Ed 123456789012' })).rejects.toThrow(/check/);
    await expect(insert({ subjects: 'Maths १२३४ ५६७८ ९०१२' })).rejects.toThrow(/check/);
    await expect(insert({ tet_paper: 'I' })).rejects.toThrow(/check/);
    await expect(insert({ tet_type: 'CTET', tet_certificate_date: addDays(TODAY, 1) })).rejects.toThrow(/a day that has come/);
    await expect(insert({ tet_type: 'CTET', tet_certificate_date: '2024-01-01', tet_valid_until: '2023-01-01' })).rejects.toThrow(/check/);
    await expect(as(principal, (c) => c.query(`insert into staff_qualifications (school_id, user_id, updated_by, stage) values ($1, $2, $3, 'pre')`, [A, ACCOUNTANT, PRINCIPAL]))).rejects.toThrow(/teaching staff/);
    await expect(as(principal, (c) => c.query(`insert into staff_qualifications (school_id, user_id, updated_by, stage) values ($1, $2, $3, 'pre')`, [A, TEACHER_B, PRINCIPAL]))).rejects.toThrow(/foreign key|teaching staff/);
    expect(await as(principal, (c) => saveQualification(c, actor(principal), ACCOUNTANT, row({ stage: 'pre' })))).toEqual({ ok: false, reason: 'not_staff' });
    expect(await as(principal, (c) => saveQualification(c, actor(principal), LEFT, row({ stage: 'pre' })))).toEqual({ ok: false, reason: 'not_staff' });
  });

  it('the CSV import in the tool’s own columns: a preview saves nothing; saving keeps only the lines that are ready, each audited', async () => {
    const csv = teachersToCsv([
      { ...blankTeacher(), name: 'tanvi  teacher', stage: 'upper', degree: 'B.Sc.', professional: 'B.Ed', tetType: 'CTET', tetPaper: 'II', tetDate: '2021-09-10' },
      { ...blankTeacher(), name: 'Kiran Coordinator', stage: 'secondary', degree: 'M.A. 1234-5678-9012' },
      { ...blankTeacher(), name: 'Nobody Here', stage: 'pre' },
      { ...blankTeacher(), name: 'Anil Accountant', stage: 'pre' },
    ]);
    const before = await audits();
    const preview = await as(principal, (c) => importRegister(c, actor(principal), csv, false));
    expect(preview).toMatchObject({ ok: true, saved: null });
    if (!preview.ok) throw new Error('refused');
    expect(preview.rows.map((r) => [r.name, r.status, r.replaces])).toEqual([['tanvi  teacher', 'ready', true], ['Kiran Coordinator', 'aadhaar', false], ['Nobody Here', 'no_account', false], ['Anil Accountant', 'no_account', false]]);
    expect(await audits()).toEqual(before);
    const done = await as(principal, (c) => importRegister(c, actor(principal), csv, true));
    expect(done).toMatchObject({ ok: true, saved: 1 });
    const tanvi = (await as(principal, (c) => loadRegister(c, actor(principal))))!.staff.find((s) => s.user_id === TEACHER2)!;
    expect(tanvi.qualification).toMatchObject({ stage: 'upper', degree: 'B.Sc.', professional_qualification: 'B.Ed', tet_type: 'CTET', tet_paper: 'II', tet_certificate_date: '2021-09-10', tet_valid_until: null, other_approval: null });
    expect(tanvi.endings).toEqual([]);
    expect((await audits()).slice(-1)[0]).toMatchObject({ event_action: 'compliance_desk.qualification_saved', target_id: TEACHER2, after_state: { via: 'import', first: false } });
    expect(await as(teacher, (c) => importRegister(c, actor(teacher), csv, true))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => importRegister(c, actor(principal), 'stage,degree\r\nprimary,B.A.\r\n', false))).toEqual({ ok: false, reason: 'no_name_column' });
    expect(await as(principal, (c) => importRegister(c, actor(principal), 'name,stage\r\n', false))).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('the mandatory public disclosure', () => {
  let first = '';
  let second = '';
  it('an item is kept with every version, who changed it and when; a removed item stays removed', async () => {
    const a = await as(principal, (c) => saveDisclosure(c, actor(principal), { itemId: null, heading: 'Name of the school', value: 'School A', source: 'Affiliation letter of 2019' }));
    const b = await as(admin, (c) => saveDisclosure(c, actor(admin), { itemId: null, heading: 'Number of teachers', value: '24', source: 'Staff register, 1 April' }));
    if (!a.ok || !b.ok) throw new Error('not saved');
    [first, second] = [a.itemId, b.itemId];
    expect(await as(admin, (c) => saveDisclosure(c, actor(admin), { itemId: second, heading: 'Number of teachers', value: '25', source: 'Staff register, 1 July' }))).toEqual({ ok: true, itemId: second });
    expect(await as(admin, (c) => saveDisclosure(c, actor(admin), { itemId: second, heading: 'Number of teachers', value: '25', source: 'Staff register, 1 July' }))).toEqual({ ok: false, reason: 'unchanged' });
    const items = (await as(principal, (c) => loadDisclosure(c, actor(principal))))!;
    expect(items.map((i) => [i.heading, i.value, i.source, i.changed_by, i.earlier.length])).toEqual([
      ['Name of the school', 'School A', 'Affiliation letter of 2019', 'Priya Principal', 0],
      ['Number of teachers', '25', 'Staff register, 1 July', 'Asif Admin', 1],
    ]);
    expect(items[1].earlier[0]).toMatchObject({ value: '24', source: 'Staff register, 1 April', changed_by: 'Asif Admin' });
    expect(await as(principal, (c) => removeDisclosure(c, actor(principal), first))).toEqual({ ok: true, itemId: first });
    expect(await as(principal, (c) => removeDisclosure(c, actor(principal), first))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(principal, (c) => saveDisclosure(c, actor(principal), { itemId: first, heading: 'Name of the school', value: 'School A', source: 'Again' }))).toEqual({ ok: false, reason: 'not_found' });
    await expect(as(principal, (c) => c.query(`insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by) values ($1, $2, 'Name', 'School A', 'Again', $3)`, [A, first, PRINCIPAL]))).rejects.toThrow(/stays removed/);
    // Nothing is overwritten: no right to change or remove an entry.
    await expect(as(principal, (c) => c.query(`update disclosure_entries set value = 'x'`))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`delete from disclosure_entries`))).rejects.toThrow(/permission denied/);
    // The time is the database's own clock, and in one's own name.
    await expect(as(principal, (c) => c.query(`insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by) values ($1, gen_random_uuid(), 'Fees', 'On the notice board', 'Fee structure', $2)`, [A, ADMIN]))).rejects.toThrow(/row-level security|policy/);
    const at = (await as(principal, (c) => c.query(`insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by, changed_at) values ($1, gen_random_uuid(), 'Fees', 'On the notice board', 'Fee structure', $2, '2001-01-01') returning changed_at`, [A, PRINCIPAL]))).rows[0].changed_at;
    expect(new Date(at).getFullYear()).toBeGreaterThan(2001);
    // Two versions of one item written at once still have two times, in order.
    const times = await as(principal, async (c) => {
      const item = (await c.query(`select gen_random_uuid() as id`)).rows[0].id;
      for (const v of ['one', 'two', 'three']) await c.query(`insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by) values ($1, $2, 'Quick', $3, 'Here', $4)`, [A, item, v, PRINCIPAL]);
      await removeDisclosure(c, actor(principal), item);
      return (await c.query(`select value, changed_at from disclosure_entries where item_id = $1 order by changed_at`, [item])).rows.map((r: { value: string | null }) => r.value);
    });
    expect(times).toEqual(['one', 'two', 'three', null]);
  });

  it('the export is exactly what is kept, item by item', async () => {
    const items = (await as(principal, (c) => loadDisclosure(c, actor(principal))))!;
    const kept = (await db.pg.query(
      `select distinct on (item_id) item_id, heading, value, source, removed from disclosure_entries where school_id = $1 order by item_id, changed_at desc`,
      [A]
    )).rows.filter((r: { removed: boolean }) => !r.removed);
    const csv = disclosureCsv('en', items);
    expect(csv.header).toEqual(['No.', 'Item', 'What the school discloses', 'Where it comes from', 'Last changed by', 'Last changed on']);
    expect(csv.rows.map((r) => [r[1], r[2], r[3]]).sort()).toEqual(kept.map((r: { heading: string; value: string; source: string }) => [r.heading, r.value, r.source]).sort());
    expect(csv.rows.map((r) => r[0])).toEqual(items.map((_, i) => i + 1));
    expect(csv.rows.every((r) => r[5] === TODAY)).toBe(true);
    expect(disclosureCsv('hi', items).header[1]).toBe('मद');
  });

  it('never an Aadhaar number, by the app and by the database; the office only', async () => {
    expect(await as(principal, (c) => saveDisclosure(c, actor(principal), { itemId: null, heading: 'Trust registration', value: 'Registered; trustee Aadhaar 1234 5678 9012', source: 'Trust deed' }))).toEqual({ ok: false, reason: 'aadhaar', field: 'value' });
    expect(await as(principal, (c) => saveDisclosure(c, actor(principal), { itemId: null, heading: ' ', value: 'x', source: 'y' }))).toMatchObject({ ok: false, reason: 'heading' });
    await expect(as(principal, (c) => c.query(`insert into disclosure_entries (school_id, item_id, heading, value, source, changed_by) values ($1, gen_random_uuid(), 'Trust', 'Trustee 123412341234', 'Deed', $2)`, [A, PRINCIPAL]))).rejects.toThrow(/check/);
    for (const who of OUTSIDE) {
      expect(await as(who, (c) => loadDisclosure(c, actor(who))), who.role).toBeNull();
      expect((await as(who, (c) => c.query(`select * from disclosure_entries`))).rows, who.role).toEqual([]);
      expect(await as(who, (c) => saveDisclosure(c, actor(who), { itemId: null, heading: 'H', value: 'V', source: 'S' })), who.role).toEqual({ ok: false, reason: 'not_allowed' });
    }
    expect((await as(principalB, (c) => c.query(`select * from disclosure_entries`))).rows).toEqual([]);
    expect(await as(principalB, (c) => saveDisclosure(c, actor(principalB), { itemId: second, heading: 'Taken', value: 'Over', source: 'B' }))).toEqual({ ok: false, reason: 'not_found' });
    await expect(platform((c) => c.query(`select * from disclosure_entries`))).rejects.toThrow(/permission denied/);
  });
});

describe('SQAAF evidence', () => {
  const storage = new MemoryFileStorage();
  it('the standards are the document’s: 7 domains, 48 sub-domains, 84 standards, with its URL and the day it was read; the office reads them', async () => {
    const sq = (await as(principal, (c) => loadSqaaf(c, actor(principal))))!;
    expect(sq.source).toEqual({ title: 'CBSE School Quality Assessment and Assurance Framework (April 2023)', url: 'https://cbseacademic.nic.in/sqaa/doc/handbook.pdf', readOn: '2026-10-14' });
    expect(sq.domains.map((d) => [d.no, d.subDomains.length, d.standards])).toEqual([[1, 7, 26], [2, 12, 20], [3, 5, 10], [4, 5, 7], [5, 10, 10], [6, 3, 5], [7, 6, 6]]);
    expect(sq.totals).toEqual({ standards: 84, withEvidence: 0, pieces: 0 });
    expect(sq.domains[0].subDomains[0].standards[0]).toEqual({ code: '1.1.1', statement: 'Principal and teachers are familiar with the spirit and content of NCF and recommendations of NEP.', evidence: [] });
    for (const who of [...OUTSIDE]) expect((await as(who, (c) => c.query(`select count(*)::int as n from sqaaf_standards`))).rows[0].n, who.role).toBe(0);
    await expect(as(principal, (c) => c.query(`insert into sqaaf_standards (code, position, domain_no, domain, sub_domain_code, sub_domain, statement, source_title, source_url, source_read_on) values ('7.9.9', 499, 7, 'D', '7.9', 'S', 'Made up', 'T', 'https://example.invalid', '2026-10-14')`))).rejects.toThrow(/permission denied/);
  });

  it('each piece of evidence names its standard: a note, or a photo or PDF kept under the school’s own folder', async () => {
    const note = await as(principal, (c) => addSqaafNote(c, actor(principal), { standardCode: '2.8.1', note: 'Fire drill held each term; register in the office.' }));
    expect(note.ok).toBe(true);
    const file = await as(admin, (c) => addSqaafFile(c, storage, actor(admin), { standardCode: '2.8.1', note: null, name: 'fire-noc 2026.pdf', bytes: PDF }, () => 'f1'));
    expect(file.ok).toBe(true);
    expect([...storage.files.keys()]).toEqual([`${A}/sqaaf/f1.pdf`]);
    const sq = (await as(principal, (c) => loadSqaaf(c, actor(principal))))!;
    const std = sq.domains[1].subDomains.find((s) => s.code === '2.8')!.standards[0];
    expect(std.evidence.map((e) => [e.note, e.file_name, e.mime_type, e.added_by])).toEqual([
      ['Fire drill held each term; register in the office.', null, null, 'Priya Principal'],
      [null, 'fire-noc 2026.pdf', 'application/pdf', 'Asif Admin'],
    ]);
    expect(sq.totals).toEqual({ standards: 84, withEvidence: 1, pieces: 2 });
    expect(await as(principal, (c) => sqaafFileUrl(c, storage, actor(principal), file.ok ? file.evidenceId : ''))).toBe(`memory://${A}/sqaaf/f1.pdf?ttl=300`);
    // Every row names a standard of the list, by the app and by the database.
    expect(await as(principal, (c) => addSqaafNote(c, actor(principal), { standardCode: '9.9.9', note: 'x' }))).toEqual({ ok: false, reason: 'unknown_standard' });
    await expect(as(principal, (c) => c.query(`insert into sqaaf_evidence (school_id, standard_code, note, added_by) values ($1, '1.1.9', 'x', $2)`, [A, PRINCIPAL]))).rejects.toThrow(/foreign key/);
    await expect(as(principal, (c) => c.query(`insert into sqaaf_evidence (school_id, standard_code, note, added_by) values ($1, null, 'x', $2)`, [A, PRINCIPAL]))).rejects.toThrow(/null/);
    expect((await db.pg.query(`select count(*)::int as n from sqaaf_evidence e where not exists (select 1 from sqaaf_standards s where s.code = e.standard_code)`)).rows[0].n).toBe(0);
  });

  it('never an Aadhaar number in a note or a file’s name; never a file that is not a photo or a PDF; never another school’s folder', async () => {
    expect(await as(principal, (c) => addSqaafNote(c, actor(principal), { standardCode: '1.6.1', note: 'Child 1234 5678 9012 attended' }))).toEqual({ ok: false, reason: 'aadhaar' });
    await expect(as(principal, (c) => c.query(`insert into sqaaf_evidence (school_id, standard_code, note, added_by) values ($1, '1.6.1', 'id 123456789012', $2)`, [A, PRINCIPAL]))).rejects.toThrow(/check/);
    const named = await as(principal, (c) => addSqaafFile(c, storage, actor(principal), { standardCode: '1.6.1', note: 'Attendance register', name: 'aadhaar 1234 5678 9012.pdf', bytes: PDF }, () => 'f2'));
    expect(named.ok).toBe(true);
    expect((await db.pg.query(`select file_name from sqaaf_evidence where storage_key = $1`, [`${A}/sqaaf/f2.pdf`])).rows[0].file_name).toBe('evidence.pdf');
    expect(await as(principal, (c) => addSqaafFile(c, storage, actor(principal), { standardCode: '1.6.1', note: null, name: 'x.exe', bytes: new Uint8Array([0x4d, 0x5a, 1, 2, 3]) }))).toEqual({ ok: false, reason: 'not_a_photo_or_pdf' });
    await expect(as(principal, (c) => c.query(`insert into sqaaf_evidence (school_id, standard_code, storage_key, file_name, mime_type, size_bytes, added_by) values ($1, '1.6.1', $2, 'x.pdf', 'application/pdf', 9, $3)`, [A, `${B}/sqaaf/x.pdf`, PRINCIPAL]))).rejects.toThrow(/own school/);
  });

  it('a wrong piece is removed with its file, audited; the office only', async () => {
    const id = (await db.pg.query(`select evidence_id from sqaaf_evidence where storage_key = $1`, [`${A}/sqaaf/f2.pdf`])).rows[0].evidence_id;
    for (const who of OUTSIDE) {
      expect(await as(who, (c) => removeSqaafEvidence(c, storage, actor(who), id)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      expect(await as(who, (c) => loadSqaaf(c, actor(who))), who.role).toBeNull();
      expect((await as(who, (c) => c.query(`select * from sqaaf_evidence`))).rows, who.role).toEqual([]);
      expect(await as(who, (c) => addSqaafNote(c, actor(who), { standardCode: '1.1.1', note: 'x' })), who.role).toEqual({ ok: false, reason: 'not_allowed' });
    }
    expect(await as(principalB, (c) => removeSqaafEvidence(c, storage, actor(principalB), id))).toEqual({ ok: false, reason: 'not_found' });
    expect((await as(principalB, (c) => c.query(`select * from sqaaf_evidence`))).rows).toEqual([]);
    await expect(platform((c) => c.query(`select * from sqaaf_evidence`))).rejects.toThrow(/permission denied/);
    expect(await as(principal, (c) => removeSqaafEvidence(c, storage, actor(principal), id))).toEqual({ ok: true, evidenceId: id });
    expect(storage.files.has(`${A}/sqaaf/f2.pdf`)).toBe(false);
    await expect(as(principal, (c) => c.query(`update sqaaf_evidence set note = 'changed'`))).rejects.toThrow(/permission denied/);
  });
});

describe('the desk as a whole', () => {
  it('a part of the plan: a school whose plan does not have it is refused', async () => {
    expect(await as(principal, (c) => deskInPlan(c, A))).toBe(true);
    await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter') on conflict (school_id) do update set plan_id = 'starter'`, [A]);
    expect(await as(principal, (c) => deskInPlan(c, A))).toBe(false);
    const provider = TODAY_PROVIDERS.find((p) => p.type === 'qualifications-ending')!;
    expect(await as(principal, (c) => provider.load(c, { schoolId: A, userId: PRINCIPAL, role: 'principal', sunday: false } as never))).toEqual([]);
    await db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'growth') on conflict (school_id) do update set plan_id = 'growth'`, [A]);
    expect(await as(principal, (c) => deskInPlan(c, A))).toBe(true);
    await db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);
  });

  it('audit rows hold ids, codes, counts and booleans, never a name, a value or a note; the office or the person who acted reads them', async () => {
    const rows = await audits();
    expect(new Set(rows.map((r) => r.event_action))).toEqual(new Set(['compliance_desk.qualification_saved', 'compliance_desk.disclosure_saved', 'compliance_desk.disclosure_removed', 'compliance_desk.sqaaf_evidence_added', 'compliance_desk.sqaaf_evidence_removed']));
    const text = JSON.stringify(rows.map((r) => [r.before_state, r.after_state]));
    for (const words of ['B.A.', 'D.El.Ed', 'EVS', 'District approval', 'School A', 'Staff register', 'Affiliation', 'Fire drill', 'fire-noc', 'Attendance register', 'Priya', 'Tanvi']) expect(text, words).not.toContain(words);
    expect(rows.find((r) => r.event_action === 'compliance_desk.qualification_saved')!.after_state).toEqual({ fields: ['stage', 'subjects', 'degree', 'professional_qualification', 'tet_type', 'tet_paper', 'tet_certificate_date'], first: true, via: 'form' });
    expect(rows.find((r) => r.event_action === 'compliance_desk.sqaaf_evidence_added')!.after_state).toEqual({ standardCode: '2.8.1', kind: 'note' });
    const seen = async (who: Who) => (await as(who, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'compliance_desk.%'`))).rows[0].n;
    expect(await seen(principal)).toBe(rows.length);
    expect(await seen(teacher)).toBe(0);
    expect(await seen(accountant)).toBe(0);
  });
});

describe('review of C227', () => {
  it('a first row with nothing typed is saved and counted', async () => {
    const csv = teachersToCsv([{ ...blankTeacher(), name: 'Kiran Coordinator' }]);
    const done = await as(principal, (c) => importRegister(c, actor(principal), csv, true));
    expect(done).toMatchObject({ ok: true, saved: 1 });
  });

  it('a Hindi file name keeps its vowel signs; an Aadhaar number in it is still refused', () => {
    expect(fileLabel('प्रमाणपत्र सूची.pdf', 'application/pdf')).toBe('प्रमाणपत्र सूची.pdf');
    expect(fileLabel('card 1234 5678 9012.pdf', 'application/pdf')).toBe('evidence.pdf');
  });

  it('Form 6: the filing deadline day itself is not past in India; the day after is', async () => {
    const today = indiaDate();
    const yesterday = indiaDate(new Date(Date.now() - 86_400_000));
    const at = async (deadline: string) => {
      await db.pg.query(
        `insert into compliance_config (school_id, state, filing_deadline, filing_deadline_source) values ($1, 'HR', $2, 'test') on conflict (school_id) do update set filing_deadline = excluded.filing_deadline`,
        [A, deadline]
      );
      return as(principal, (c) => computeForm6Advisory(c, A, 'IN-HR'));
    };
    expect(await at(today)).toMatchObject({ deadlineState: 'before_deadline', filingDeadline: today });
    expect(await at(yesterday)).toMatchObject({ deadlineState: 'past_deadline', filingDeadline: yesterday });
  });
});
