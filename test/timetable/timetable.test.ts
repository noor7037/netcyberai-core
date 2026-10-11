import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { parseTimetableCsv, periodsFromSetting, planImport, teacherClash, weekdayOf, type Lookups, type Slot } from '@/lib/timetable/plan';
import { clearEntry, entriesForClass, entriesForTeacher, importTimetable, periodsPerDay, putEntry } from '@/lib/timetable/timetable';

// The timetable (docs/20 5c, C145): the clash guard and the CSV plan as pure
// rules, then the same on the whole real schema (every migration replayed on
// PGlite), as app_user in the school's context with the caller's role.

const A = 'e1000000-0000-4000-8000-000000000001';
const B = 'e1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'e1000000-0000-4000-8000-0000000000a1';
const T1 = 'e1000000-0000-4000-8000-0000000000a2'; // class teacher of 5-A
const T2 = 'e1000000-0000-4000-8000-0000000000a3'; // no class of their own
const PRINCIPAL_B = 'e1000000-0000-4000-8000-0000000000b1';
const C5 = 'e1000000-0000-4000-8000-0000000000c1';
const C6 = 'e1000000-0000-4000-8000-0000000000c2';
const CB = 'e1000000-0000-4000-8000-0000000000c3';
const MATHS = 'e1000000-0000-4000-8000-0000000000d1';
const HINDI = 'e1000000-0000-4000-8000-0000000000d2';
const SUBJECT_B = 'e1000000-0000-4000-8000-0000000000d3';

describe('the rules, with no database', () => {
  const slot = (classId: string, weekday: number, period: number, teacherUserId: string, subjectId = MATHS): Slot => ({ classId, weekday, period, subjectId, teacherUserId });
  const lookups: Lookups = { classes: new Map([['5-a', C5], ['6-a', C6]]), subjects: new Map([['maths', MATHS], ['hindi', HINDI]]), teachers: new Map([['t1@a.invalid', T1], ['t2@a.invalid', T2]]) };
  const plan = (csv: string, existing: Slot[] = [], periods = 8) => planImport(existing, parseTimetableCsv(csv).rows, lookups, periods);
  const H = 'class,day,period,subject,teacher\n';

  it('a teacher in two places at once is a clash; the class’s own slot being replaced is not', () => {
    const saved = [slot(C5, 1, 1, T1)];
    expect(teacherClash(saved, slot(C6, 1, 1, T1))).toEqual(saved[0]);
    expect(teacherClash(saved, slot(C5, 1, 1, T1, HINDI))).toBeNull(); // the same class slot, replaced
    expect(teacherClash(saved, slot(C6, 1, 2, T1))).toBeNull();
    expect(teacherClash(saved, slot(C6, 2, 1, T1))).toBeNull();
    expect(teacherClash(saved, slot(C6, 1, 1, T2))).toBeNull();
  });

  it('days and periods', () => {
    expect(['MON', 'monday', ' Tue ', 'sat', 'SUNDAY'].map(weekdayOf)).toEqual([1, 1, 2, 6, 7]);
    expect(['', 'someday', '1'].map(weekdayOf)).toEqual([null, null, null]);
    expect([8, 1, 12, 0, 13, 6.9, 'x', undefined].map(periodsFromSetting)).toEqual([8, 1, 12, 8, 8, 6, 8, 8]);
  });

  it('the file must start with the header, and every line needs its five values', () => {
    expect(parseTimetableCsv('5-A,MON,1,Maths,t1@a.invalid').problems).toEqual([{ line: 1, code: 'header' }]);
    expect(parseTimetableCsv('').problems).toEqual([{ line: 1, code: 'header' }]);
    const parsed = parseTimetableCsv(`﻿${H}5-A,MON,1,Maths,t1@a.invalid\r\n\r\n5-A,MON,2,Maths\n"6-A", Tue ,3,"Hindi",t2@a.invalid\n`);
    expect(parsed.problems).toEqual([{ line: 4, code: 'columns' }]);
    expect(parsed.rows.map((r) => [r.line, r.class, r.day, r.period, r.subject])).toEqual([[2, '5-A', 'MON', '1', 'Maths'], [5, '6-A', 'Tue', '3', 'Hindi']]);
  });

  it('a clean file is planned line by line; names match whatever their case or spacing', () => {
    const p = plan(`${H}5-a,MON,1,MATHS,T1@A.invalid\n6-A,monday,1,Hindi,t2@a.invalid\n`);
    expect(p).toEqual({ ok: true, slots: [{ line: 2, classId: C5, weekday: 1, period: 1, subjectId: MATHS, teacherUserId: T1 }, { line: 3, classId: C6, weekday: 1, period: 1, subjectId: HINDI, teacherUserId: T2 }] });
  });

  it('with any problem nothing is planned, and every problem is listed by its line', () => {
    const p = plan(`${H}7-Z,MON,1,Maths,t1@a.invalid\n5-A,Funday,1,Maths,t1@a.invalid\n5-A,MON,9,Maths,t1@a.invalid\n5-A,MON,2,Art,nobody@a.invalid\n`);
    expect(p).toEqual({ ok: false, problems: [
      { line: 2, code: 'unknown_class', value: '7-Z' },
      { line: 3, code: 'bad_day', value: 'Funday' },
      { line: 4, code: 'bad_period', value: '9' },
      { line: 5, code: 'unknown_subject', value: 'Art' },
      { line: 5, code: 'unknown_teacher', value: 'nobody@a.invalid' },
    ] });
  });

  it('clashes inside the file and with what is saved are named with the other line', () => {
    // Two lines for one class slot; one teacher in two classes at once.
    expect(plan(`${H}5-A,MON,1,Maths,t1@a.invalid\n5-A,MON,1,Hindi,t2@a.invalid\n6-A,MON,1,Maths,t1@a.invalid\n`)).toEqual({ ok: false, problems: [{ line: 3, code: 'class_clash', with: 2 }, { line: 4, code: 'teacher_clash', with: 2 }] });
    // The teacher is already saved in another class at that time.
    expect(plan(`${H}6-A,TUE,3,Maths,t1@a.invalid\n`, [slot(C5, 2, 3, T1)])).toEqual({ ok: false, problems: [{ line: 2, code: 'teacher_clash', with: 'saved' }] });
  });

  it('a file may move a teacher: the saved entry it replaces is not a clash', () => {
    const saved = [slot(C5, 1, 1, T1), slot(C6, 1, 1, T2)];
    // The two teachers swap classes in one file.
    expect(plan(`${H}5-A,MON,1,Maths,t2@a.invalid\n6-A,MON,1,Maths,t1@a.invalid\n`, saved).ok).toBe(true);
    // Only one half of the swap: T2 would be in both classes.
    expect(plan(`${H}5-A,MON,1,Maths,t2@a.invalid\n`, saved)).toEqual({ ok: false, problems: [{ line: 2, code: 'teacher_clash', with: 'saved' }] });
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
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
const put = (who: Who, classId: string, weekday: number, period: number, teacherUserId: string, subjectId = MATHS) => as(who, (c) => putEntry(c, actor(who), { classId, weekday, period, subjectId, teacherUserId }));
const saved = async () => (await db.pg.query(`select class_id, weekday::int as weekday, period::int as period, subject_id, teacher_user_id from timetable_entries where school_id = $1 order by class_id, weekday, period`, [A])).rows;
const H = 'class,day,period,subject,teacher\n';

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'),
        ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${T1}'), ('${C6}', '${A}', '6-A', null), ('${CB}', '${B}', '5-A', null);
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${HINDI}', '${A}', 'Hindi'), ('${SUBJECT_B}', '${B}', 'Maths');
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('the office fills a period; filling it again replaces it; each change is in the audit log', async () => {
    expect(await put(principal, C5, 1, 1, T1)).toMatchObject({ ok: true, entry: { class_name: '5-A', subject_name: 'Maths', teacher_name: 'Teacher One', weekday: 1, period: 1 } });
    expect(await put(principal, C5, 1, 1, T1, HINDI)).toMatchObject({ ok: true, entry: { subject_name: 'Hindi' } });
    expect(await saved()).toEqual([{ class_id: C5, weekday: 1, period: 1, subject_id: HINDI, teacher_user_id: T1 }]);
    const audit = (await db.pg.query(`select event_action, before_state, after_state from audit_log where school_id = $1 and event_action like 'timetable.%' order by audit_id`, [A])).rows;
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({ event_action: 'timetable.set', before_state: { subject_id: MATHS, teacher_user_id: T1 }, after_state: { subjectId: HINDI } });
  });

  it('a teacher in two places at once is refused, and the answer names the other entry; nothing is saved', async () => {
    const result = await put(principal, C6, 1, 1, T1);
    expect(result).toMatchObject({ ok: false, reason: 'teacher_clash', clash: { class_name: '5-A', subject_name: 'Hindi', teacher_name: 'Teacher One', weekday: 1, period: 1 } });
    expect(await saved()).toHaveLength(1);
    // Another teacher at that time, or the same teacher at another time, is fine.
    expect((await put(principal, C6, 1, 1, T2)).ok).toBe(true);
    expect((await put(principal, C6, 1, 2, T1)).ok).toBe(true);
    // The database refuses a clash on its own too, whatever the code does.
    await expect(db.pg.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, 1, 1, $3, $4)`, [A, C6, MATHS, T1])).rejects.toThrow(/timetable_(class|teacher)_slot/);
  });

  it('only this school’s class, subject and active teacher are accepted, within the school’s periods', async () => {
    expect(await put(principal, CB, 2, 1, T1)).toEqual({ ok: false, reason: 'unknown_class' });
    expect(await put(principal, C5, 2, 1, T1, SUBJECT_B)).toEqual({ ok: false, reason: 'unknown_subject' });
    expect(await put(principal, C5, 2, 1, PRINCIPAL)).toEqual({ ok: false, reason: 'unknown_teacher' });
    expect(await as(principal, (c) => periodsPerDay(c, A))).toBe(8);
    expect(await put(principal, C5, 2, 9, T1)).toEqual({ ok: false, reason: 'bad_period' });
    expect(await saved()).toHaveLength(3);
  });

  it('a teacher sees their own periods and their own classes’ timetable, and nothing else', async () => {
    // T1: class teacher of 5-A, and teaches period 2 in 6-A.
    expect((await as(t1, (c) => entriesForTeacher(c, A, T1))).map((e) => [e.class_name, e.weekday, e.period])).toEqual([['5-A', 1, 1], ['6-A', 1, 2]]);
    expect(await as(t1, (c) => entriesForClass(c, A, C5))).toHaveLength(1);
    // In 6-A, T1 sees only the period they teach, not the other teacher's.
    expect((await as(t1, (c) => entriesForClass(c, A, C6))).map((e) => e.teacher_name)).toEqual(['Teacher One']);
    // T2 has no class of their own: only the period they teach.
    expect((await as(t2, (c) => entriesForClass(c, A, C6))).map((e) => e.teacher_name)).toEqual(['Teacher Two']);
    expect(await as(t2, (c) => entriesForClass(c, A, C5))).toEqual([]);
    // Another teacher's week is not theirs to read.
    expect(await as(t2, (c) => entriesForTeacher(c, A, T1))).toEqual([]);
    // Another school sees nothing of this one.
    expect(await as(principalB, (c) => c.query(`select 1 from timetable_entries`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
  });

  it('a teacher cannot write the timetable: the database refuses it', async () => {
    await expect(as(t1, (c) => c.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, 3, 1, $3, $4)`, [A, C5, MATHS, T1]))).rejects.toThrow(/row-level security/);
    expect(await as(t1, (c) => c.query(`update timetable_entries set period = 5 returning 1`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect(await as(t1, (c) => c.query(`delete from timetable_entries returning 1`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    await expect(as(principalB, (c) => c.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, 3, 1, $3, $4)`, [A, C5, MATHS, T1]))).rejects.toThrow(/row-level security/);
    expect(await saved()).toHaveLength(3);
  });

  it('a CSV with a clash imports nothing and lists the rows', async () => {
    const before = await saved();
    // Line 2 is fine; line 3 puts Teacher One in 6-A when they are saved in 5-A (MON 1).
    const result = await as(principal, (c) => importTimetable(c, actor(principal), `${H}5-A,TUE,1,Maths,t1@a.invalid\n6-A,MON,1,Maths,t1@a.invalid\n6-A,WED,1,Art,t2@a.invalid\n`));
    expect(result).toEqual({ ok: false, problems: [{ line: 3, code: 'teacher_clash', with: 'saved' }, { line: 4, code: 'unknown_subject', value: 'Art' }] });
    expect(await saved()).toEqual(before);
    expect(await as(principal, (c) => importTimetable(c, actor(principal), 'not a timetable'))).toEqual({ ok: false, problems: [{ line: 1, code: 'header' }] });
  });

  it('a clean CSV is imported whole, replaces the slots it names, and may swap two teachers', async () => {
    // Saved: 5-A MON 1 = T1, 6-A MON 1 = T2. The file swaps them and adds Tuesday.
    const result = await as(principal, (c) => importTimetable(c, actor(principal), `${H}5-A,MON,1,Maths,t2@a.invalid\n6-A,MON,1,Hindi,t1@a.invalid\n5-A,TUE,1,Maths,t1@a.invalid\n`));
    expect(result).toEqual({ ok: true, imported: 3 });
    expect(await saved()).toEqual([
      { class_id: C5, weekday: 1, period: 1, subject_id: MATHS, teacher_user_id: T2 },
      { class_id: C5, weekday: 2, period: 1, subject_id: MATHS, teacher_user_id: T1 },
      { class_id: C6, weekday: 1, period: 1, subject_id: HINDI, teacher_user_id: T1 },
      { class_id: C6, weekday: 1, period: 2, subject_id: MATHS, teacher_user_id: T1 },
    ].sort((a, b) => (a.class_id + a.weekday + a.period).localeCompare(b.class_id + b.weekday + b.period)));
    // A teacher cannot import, whatever the file.
    await expect(as(t1, (c) => importTimetable(c, actor(t1), `${H}5-A,WED,1,Maths,t1@a.invalid\n`))).rejects.toThrow(/row-level security/);
  });

  it('the academic coordinator fills the timetable too (C146); an accountant reads it and cannot write', async () => {
    const COORD = 'e1000000-0000-4000-8000-0000000000a7';
    const ACCOUNTANT = 'e1000000-0000-4000-8000-0000000000a8';
    await db.pg.query(`insert into users (user_id, school_id, email, role, display_name) values ($1, $3, 'c@a.invalid', 'academic_coordinator', 'Coordinator'), ($2, $3, 'acc@a.invalid', 'accountant', 'Accountant')`, [COORD, ACCOUNTANT, A]);
    const coord: Who = { role: 'academic_coordinator', user: COORD, school: A };
    const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
    expect((await put(coord, C5, 5, 1, T2)).ok).toBe(true);
    expect(await as(coord, (c) => clearEntry(c, actor(coord), { classId: C5, weekday: 5, period: 1 }))).toBe(true);
    expect((await as(accountant, (c) => entriesForClass(c, A, C5))).length).toBeGreaterThan(0);
    await expect(put(accountant, C5, 5, 1, T2)).rejects.toThrow(/row-level security/);
    for (const file of ['src/app/api/app/timetable/route.ts', 'src/app/api/app/timetable/import/route.ts']) expect(readFileSync(path.resolve(__dirname, '../..', file), 'utf8')).toContain("'academic_coordinator'");
  });

  it('Timetable is switched on for every existing school, once, and a founder’s own switch is left alone (C146)', async () => {
    const statement = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261012090000_p2_office_corrections.sql'), 'utf8').match(/insert into school_module_entitlements[\s\S]*?;/)![0];
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'timetable', false, 'founder_override')`, [B]);
    await db.pg.exec(statement);
    await db.pg.exec(statement);
    expect((await db.pg.query(`select school_id, enabled, source from school_module_entitlements where module_id = 'timetable' order by school_id`)).rows).toEqual([{ school_id: A, enabled: true, source: 'plan' }, { school_id: B, enabled: false, source: 'founder_override' }]);
  });

  it('clearing a period removes it and is audited', async () => {
    expect(await as(principal, (c) => clearEntry(c, actor(principal), { classId: C6, weekday: 1, period: 2 }))).toBe(true);
    expect(await as(principal, (c) => clearEntry(c, actor(principal), { classId: C6, weekday: 1, period: 2 }))).toBe(false);
    expect(await saved()).toHaveLength(3);
    expect((await db.pg.query(`select 1 from audit_log where school_id = $1 and event_action = 'timetable.clear' and actor_user_id = $2`, [A, PRINCIPAL])).rows).toHaveLength(1);
  });
});
