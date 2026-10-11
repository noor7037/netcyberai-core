import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { catchUpDates, decidePlan, decidedPlans, findCandidates, recoverySettings, windowStart } from '@/lib/recovery/recovery';

// Homework Recovery v1 (docs/20 5g, C152): the window and the catch-up
// dates as pure rules, then the list and the decisions on the whole real
// schema as app_user.

describe('the window and the catch-up dates', () => {
  it('a window counts school days only, ending today', () => {
    // 2026-10-12 is a Monday. Ten school days (Mon to Sat) back, counting today: Thursday 1 October.
    expect(windowStart('2026-10-12', 10)).toBe('2026-10-01');
    expect(windowStart('2026-10-12', 1)).toBe('2026-10-12');
    // A five-day week: ten school days back from Monday 12 October is Tuesday 29 September.
    expect(windowStart('2026-10-12', 10, ['MON', 'TUE', 'WED', 'THU', 'FRI'])).toBe('2026-09-29');
    // Today is a Sunday: the window still holds ten school days.
    expect(windowStart('2026-10-11', 10)).toBe('2026-09-30');
  });

  it('catch-up dates are the next school days, one each', () => {
    expect(catchUpDates('2026-10-16', 3)).toEqual(['2026-10-17', '2026-10-19', '2026-10-20']); // Friday → Sat, Mon, Tue
    expect(catchUpDates('2026-10-16', 2, ['MON', 'TUE', 'WED', 'THU', 'FRI'])).toEqual(['2026-10-19', '2026-10-20']);
    expect(catchUpDates('2026-10-16', 0)).toEqual([]);
  });
});

const A = 'ab000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'ab000000-0000-4000-8000-0000000000a1';
const T1 = 'ab000000-0000-4000-8000-0000000000a2';
const T2 = 'ab000000-0000-4000-8000-0000000000a3';
const ACCOUNTANT = 'ab000000-0000-4000-8000-0000000000a4';
const C5 = 'ab000000-0000-4000-8000-0000000000c1';
const C6 = 'ab000000-0000-4000-8000-0000000000c2';
const MATHS = 'ab000000-0000-4000-8000-0000000000d1';
const sid = (n: number) => `ab000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), dev: sid(4), sixth: sid(10) };
const TODAY = '2026-10-12';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
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
const list = (who: Who, today = TODAY) => as(who, (c) => findCandidates(c, A, today));
// One homework for a class due on `due`; `notDone` students are marked not done, `done` students done.
let n = 0;
async function homework(classId: string, due: string, notDone: string[], done: string[] = []) {
  n += 1;
  const hw = `ab000000-0000-4000-8000-0000007000${String(n).padStart(2, '0')}`;
  const target = `ab000000-0000-4000-8000-0000008000${String(n).padStart(2, '0')}`;
  await db.pg.query(`insert into homework (homework_id, school_id, subject_id, title, due_date, created_by) values ($1, $2, $3, $4, $5, $6)`, [hw, A, MATHS, `Worksheet ${n}`, due, T1]);
  await db.pg.query(`insert into homework_targets (target_id, school_id, homework_id, class_id, title, due_date, assigned_at) values ($1, $2, $3, $4, $5, $6, $6::date - 1)`, [target, A, hw, classId, `Worksheet ${n}`, due]);
  for (const [students, isDone] of [[notDone, false], [done, true]] as const) for (const s of students) await db.pg.query(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by) values ($1, $2, $3, $4, $5, $6)`, [A, target, classId, s, isDone, T1]);
  return target;
}

describe('the list and the decisions', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'),
        ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${T1}'), ('${C6}', '${A}', '6-A', '${T2}');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
      insert into students (student_id, school_id, admission_no, name, class_id) values
        ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${C5}'), ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${C5}'), ('${S.dev}', '${A}', 'A-4', 'Dev', '${C5}'),
        ('${S.sixth}', '${A}', 'A-10', 'Sixth', '${C6}');
    `);
    // By hand, with the defaults (3 not done in the last 10 school days, since 1 October):
    //   Asha    not done on 5, 7, 9 October                    → 3: listed
    //   Bilal   not done on 5, 7 October; done on 9            → 2: not listed
    //   Chitra  not done on 28 September (outside), 5, 7       → 2 in the window: not listed
    //   Dev     not done on 5, 7, 9, 10 October                → 4: listed
    //   Sixth   (6-A) not done on 6, 8, 10 October             → 3: listed, in another teacher's class
    await homework(C5, '2026-09-28', [S.chitra]);
    await homework(C5, '2026-10-05', [S.asha, S.bilal, S.chitra, S.dev]);
    await homework(C5, '2026-10-07', [S.asha, S.bilal, S.chitra, S.dev]);
    await homework(C5, '2026-10-09', [S.asha, S.dev], [S.bilal, S.chitra]);
    await homework(C5, '2026-10-10', [S.dev], [S.asha]);
    for (const due of ['2026-10-06', '2026-10-08', '2026-10-10']) await homework(C6, due, [S.sixth]);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('the defaults are 3 homeworks in 10 school days, and a school can change both', async () => {
    expect(await as(principal, (c) => recoverySettings(c, A))).toEqual({ threshold: 3, windowDays: 10, working: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] });
  });

  it('with seeded homework results the list is exactly the students over the threshold, by name', async () => {
    const found = await list(principal);
    expect(found.from).toBe('2026-10-01');
    expect(found.candidates.map((c) => [c.student_name, c.class_name, c.missed.length])).toEqual([['Asha', '5-A', 3], ['Dev', '5-A', 4], ['Sixth', '6-A', 3]]);
    // The plan: the oldest first, one a school day from tomorrow.
    expect(found.candidates[1].plan.map((p) => [p.dueDate, p.catchUpBy])).toEqual([['2026-10-05', '2026-10-13'], ['2026-10-07', '2026-10-14'], ['2026-10-09', '2026-10-15'], ['2026-10-10', '2026-10-16']]);
    expect(found.candidates[0].plan[0]).toMatchObject({ subject: 'Maths', title: 'Worksheet 2' });
  });

  it('a teacher sees only the students of their own classes', async () => {
    expect((await list(t1)).candidates.map((c) => c.student_name)).toEqual(['Asha', 'Dev']);
    expect((await list(t2)).candidates.map((c) => c.student_name)).toEqual(['Sixth']);
  });

  it('a stricter or looser setting changes who is listed', async () => {
    await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'recovery', 1, '{"missed_threshold": 2, "window_school_days": 12}')`, [A]);
    // Two is enough, and twelve school days reach 29 September (not the 28th): Bilal and Chitra join.
    expect((await list(principal)).candidates.map((c) => [c.student_name, c.missed.length])).toEqual([['Asha', 3], ['Bilal', 2], ['Chitra', 2], ['Dev', 4], ['Sixth', 3]]);
    await db.pg.query(`update school_settings set setting_values = '{"missed_threshold": 4}' where school_id = $1 and module_id = 'recovery'`, [A]);
    expect((await list(principal)).candidates.map((c) => c.student_name)).toEqual(['Dev']);
    await db.pg.query(`delete from school_settings where school_id = $1 and module_id = 'recovery'`, [A]);
  });

  it('approve and dismiss store the plan the server worked out, are audited, and send nothing', async () => {
    const before = (await db.pg.query(`select (select count(*)::int from communication_log) + (select count(*)::int from jobs) as n`)).rows[0].n;
    const approved = await as(t1, (c) => decidePlan(c, actor(t1), { studentId: S.dev, status: 'approved', note: null, today: TODAY }));
    expect(approved).toMatchObject({ ok: true });
    expect(await as(t1, (c) => decidePlan(c, actor(t1), { studentId: S.asha, status: 'dismissed', note: 'Was away for a family wedding', today: TODAY }))).toMatchObject({ ok: true });
    const plans = (await db.pg.query(`select student_id, status, note, window_from::text as window_from, window_to::text as window_to, jsonb_array_length(items) as items, decided_by from recovery_plans order by decided_at`)).rows;
    expect(plans).toEqual([
      { student_id: S.dev, status: 'approved', note: null, window_from: '2026-10-01', window_to: '2026-10-10', items: 4, decided_by: T1 },
      { student_id: S.asha, status: 'dismissed', note: 'Was away for a family wedding', window_from: '2026-10-01', window_to: '2026-10-09', items: 3, decided_by: T1 },
    ]);
    expect((await db.pg.query(`select event_action, actor_user_id, after_state->>'homeworks' as homeworks from audit_log where school_id = $1 and event_action like 'recovery.%' order by audit_id`, [A])).rows).toEqual([
      { event_action: 'recovery.approved', actor_user_id: T1, homeworks: '4' },
      { event_action: 'recovery.dismissed', actor_user_id: T1, homeworks: '3' },
    ]);
    // Nothing reaches a parent in P2.
    expect((await db.pg.query(`select (select count(*)::int from communication_log) + (select count(*)::int from jobs) as n`)).rows[0].n).toBe(before);
    expect((await as(t1, (c) => decidedPlans(c, A))).map((p) => [p.student_name, p.status]).sort()).toEqual([['Asha', 'dismissed'], ['Dev', 'approved']]);
  });

  it('a decided student leaves the list, and returns only after a newer homework is missed', async () => {
    expect((await list(principal)).candidates.map((c) => c.student_name)).toEqual(['Sixth']);
    expect(await as(t1, (c) => decidePlan(c, actor(t1), { studentId: S.dev, status: 'approved', note: null, today: TODAY }))).toEqual({ ok: false, reason: 'not_a_candidate' });
    await homework(C5, '2026-10-12', [S.dev]);
    expect((await list(principal)).candidates.map((c) => [c.student_name, c.missed.length])).toEqual([['Dev', 5], ['Sixth', 3]]);
  });

  it('a teacher cannot decide for another class, nor an accountant at all; a decision cannot be written in another’s name', async () => {
    expect(await as(t1, (c) => decidePlan(c, actor(t1), { studentId: S.sixth, status: 'approved', note: null, today: TODAY }))).toEqual({ ok: false, reason: 'not_a_candidate' });
    expect(await as(accountant, (c) => decidePlan(c, actor(accountant), { studentId: S.sixth, status: 'approved', note: null, today: TODAY }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(t2, (c) => c.query(`select 1 from recovery_plans`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect(await as(accountant, (c) => c.query(`select 1 from recovery_plans`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    const row = `insert into recovery_plans (school_id, student_id, class_id, window_from, window_to, items, status, decided_by) values ($1, $2, $3, '2026-10-01', '2026-10-10', '[{"x":1}]', 'approved', $4)`;
    await expect(as(t1, (c) => c.query(row, [A, S.sixth, C6, T1]))).rejects.toThrow(/row-level security/);
    await expect(as(t2, (c) => c.query(row, [A, S.sixth, C6, T1]))).rejects.toThrow(/row-level security/);
    expect((await db.pg.query(`select grantee from information_schema.role_table_grants where table_name = 'recovery_plans' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).rows).toEqual([]);
  });

  it('the list is by name and the code holds no score or rank of a child', () => {
    const src = readFileSync(path.resolve(__dirname, '../../src/lib/recovery/recovery.ts'), 'utf8');
    expect(src).toContain('order by st.name, st.student_id');
    expect(src.replace(/It is not a ranking/g, '')).not.toMatch(/\bscore\b|\brank(ing|ed)?\b/i);
  });
});
