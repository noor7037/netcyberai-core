import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { changeHistory, cleanReason, isChange } from '@/lib/timetable/changes';
import { clearEntry, importTimetable, putEntry } from '@/lib/timetable/timetable';

// The history of timetable changes (W21-M3): a change writes its row, the view filters it, a teacher sees their own
// classes' history only, and the table is append-only. Every name is made up.

const A = 'e2000000-0000-4000-8000-000000000001';
const B = 'e2000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'e2000000-0000-4000-8000-0000000000a1';
const T1 = 'e2000000-0000-4000-8000-0000000000a2'; // class teacher of 5-A
const T2 = 'e2000000-0000-4000-8000-0000000000a3'; // no class of their own
const PRINCIPAL_B = 'e2000000-0000-4000-8000-0000000000b1';
const C5 = 'e2000000-0000-4000-8000-0000000000c1';
const C6 = 'e2000000-0000-4000-8000-0000000000c2';
const MATHS = 'e2000000-0000-4000-8000-0000000000d1';
const HINDI = 'e2000000-0000-4000-8000-0000000000d2';

type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
const otherSchool: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
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
const put = (classId: string, weekday: number, period: number, teacher: string, subject = MATHS, reason: string | null = null) =>
  as(principal, (c) => putEntry(c, actor(principal), { classId, weekday, period, subjectId: subject, teacherUserId: teacher }, reason));
const history = (who: Who, filter: { classId?: string; teacherUserId?: string } = {}) => as(who, (c) => changeHistory(c, who.school, filter));

describe('the rules of a change, pure', () => {
  it('a period left as it was is not a change; a reason is trimmed and bounded', () => {
    const slot = { subjectId: MATHS, teacherUserId: T1 };
    expect(isChange({ before: slot, after: { ...slot } })).toBe(false);
    expect(isChange({ before: slot, after: { ...slot, subjectId: HINDI } })).toBe(true);
    expect(isChange({ before: null, after: slot })).toBe(true);
    expect(cleanReason('  Teacher on leave  ')).toBe('Teacher on leave');
    expect(cleanReason('   ')).toBeNull();
    expect(cleanReason(42)).toBeNull();
    expect(cleanReason('x'.repeat(500))).toHaveLength(200);
  });
});

describe('the timetable history, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'),
        ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${T1}'), ('${C6}', '${A}', '6-A', null);
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${HINDI}', '${A}', 'Hindi');
    `);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a change writes its history row: what it was, what it became, who, when, and the reason if given', async () => {
    expect(await put(C5, 1, 1, T1, MATHS, 'First draft of the week')).toMatchObject({ ok: true });
    expect(await put(C5, 1, 1, T2, HINDI, '  Teacher One is on leave  ')).toMatchObject({ ok: true });
    expect(await put(C5, 1, 1, T2, HINDI)).toMatchObject({ ok: true }); // the same again: nothing changed, no row
    const h = await history(principal);
    expect(h.days).toBe(30);
    expect(h.changes).toHaveLength(2);
    expect(h.changes[0]).toMatchObject({ kind: 'set', class_name: '5-A', weekday: 1, period: 1, before_subject: 'Maths', before_teacher: 'Teacher One', after_subject: 'Hindi', after_teacher: 'Teacher Two', changed_by_name: 'Principal A', reason: 'Teacher One is on leave' });
    expect(h.changes[1]).toMatchObject({ before_subject: null, after_subject: 'Maths', reason: 'First draft of the week' });
    expect(await as(principal, (c) => clearEntry(c, actor(principal), { classId: C5, weekday: 1, period: 1 }, 'Period dropped'))).toBe(true);
    const cleared = (await history(principal)).changes[0];
    expect(cleared).toMatchObject({ kind: 'cleared', before_subject: 'Hindi', after_subject: null, reason: 'Period dropped' });
    // Not in the audit log: the reason is the office's words, kept only on the history row.
    const audit = (await db.pg.query(`select before_state, after_state from audit_log where event_action like 'timetable.%'`)).rows;
    expect(JSON.stringify(audit)).not.toMatch(/on leave|Period dropped|First draft/);
  });

  it('an import writes a row for each period it changes', async () => {
    const r = await as(principal, (c) => importTimetable(c, actor(principal), 'class,day,period,subject,teacher\n5-A,Tue,2,Maths,t1@a.invalid\n6-A,Tue,2,Hindi,t2@a.invalid\n'));
    expect(r).toEqual({ ok: true, imported: 2 });
    const imported = (await history(principal)).changes.filter((c) => c.kind === 'imported');
    expect(imported.map((c) => [c.class_name, c.after_subject]).sort()).toEqual([['5-A', 'Maths'], ['6-A', 'Hindi']]);
  });

  it('the view filters by class or by teacher', async () => {
    const all = await history(principal);
    const only6 = await history(principal, { classId: C6 });
    expect(only6.changes.length).toBeGreaterThan(0);
    expect(only6.changes.every((c) => c.class_name === '6-A')).toBe(true);
    expect(only6.changes.length).toBeLessThan(all.changes.length);
    const ofT2 = await history(principal, { teacherUserId: T2 });
    expect(ofT2.changes.every((c) => c.before_teacher === 'Teacher Two' || c.after_teacher === 'Teacher Two')).toBe(true);
    expect(ofT2.changes.length).toBeGreaterThan(0);
    const both = await history(principal, { classId: C5, teacherUserId: T2 });
    expect(both.changes.every((c) => c.class_name === '5-A')).toBe(true);
  });

  it('only the last 30 days are shown', async () => {
    await db.pg.exec(`set session_replication_role = replica; update timetable_changes set created_at = now() - interval '31 days' where class_id = '${C6}'; set session_replication_role = origin;`);
    expect((await history(principal, { classId: C6 })).changes).toHaveLength(0);
    expect((await history(principal)).changes.length).toBeGreaterThan(0);
  });

  it('a teacher sees their own classes’ history only; another school sees none; nobody changes or deletes a row', async () => {
    const own = await history(t1);
    expect(own.changes.length).toBeGreaterThan(0);
    expect(own.changes.every((c) => c.class_id === C5)).toBe(true);
    expect((await history(t1, { classId: C6 })).changes).toHaveLength(0); // asking for another class gets nothing
    expect((await history(t2)).changes).toHaveLength(0); // no class of their own
    expect((await history(otherSchool)).changes).toHaveLength(0);
    for (const sql of [`update timetable_changes set reason = 'x'`, `delete from timetable_changes`]) {
      await expect(as(principal, (c) => c.query(sql))).rejects.toThrow(/permission denied/);
    }
    // A teacher cannot write one either.
    await expect(as(t1, (c) => c.query(`insert into timetable_changes (school_id, class_id, weekday, period, kind, after_subject_id, after_teacher_user_id, changed_by) values ('${A}', '${C5}', 1, 1, 'set', '${MATHS}', '${T1}', '${T1}')`))).rejects.toThrow();
  });
});
