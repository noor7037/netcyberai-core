import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { standInProvider } from '@/lib/ai/provider';
import { approveNote, draft, listNotes } from '@/lib/copilot/copilot';
import { taughtToday } from '@/lib/copilot/today';
import { HOMEWORK_DETAILS_MAX, HOMEWORK_TITLE_MAX, homeworkDetails, homeworkTitle, nextDay, withoutAnswers } from '@/lib/copilot/use';
import { createHomework, MAX_DETAILS, MAX_TITLE } from '@/lib/homework/homework';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// The teacher's hour (W20-C, docs/42 H3): Copilot starts from what was taught today, and an approved draft is used:
// kept as a lesson plan, set as homework, or put into today's Pulse. On the whole real schema as app_user.

const A = 'c2000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'c2000000-0000-4000-8000-0000000000a1';
const T1 = 'c2000000-0000-4000-8000-0000000000a2';
const T2 = 'c2000000-0000-4000-8000-0000000000a3';
const C5A = 'c2000000-0000-4000-8000-0000000000c1';
const C5B = 'c2000000-0000-4000-8000-0000000000c2';
const C6A = 'c2000000-0000-4000-8000-0000000000c3';
const MATHS = 'c2000000-0000-4000-8000-0000000000d1';
const U5A = 'c2000000-0000-4000-8000-0000000000e1';
const U5B = 'c2000000-0000-4000-8000-0000000000e2';
const U6A = 'c2000000-0000-4000-8000-0000000000e3';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let today = '';
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
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
const switchOn = (tokens: number) =>
  db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'teacher-copilot', true, 'founder_override', $2::jsonb) on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits`, [A, JSON.stringify({ monthly_tokens: tokens })]);
const lessons = (who: Who) => as(who, (c) => taughtToday(c, actor(who), today)).then((rows) => rows.map((r) => `${r.class_name} ${r.topic}`));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  today = (await db.pg.query(`select (now() at time zone 'Asia/Kolkata')::date::text as d`)).rows[0].d;
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values
      ('${C5A}', '${A}', '5-A', '5', 'A', '${T1}'), ('${C5B}', '${A}', '5-B', '5', 'B', '${T1}'), ('${C6A}', '${A}', '6-A', '6', 'A', '${T2}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T1}', 'Teacher One'), (gen_random_uuid(), '${A}', '${T2}', 'Teacher Two');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T1}'::uuid, '${MATHS}'::uuid, '${C5A}'::uuid), ('${T1}', '${MATHS}', '${C5B}'), ('${T2}', '${MATHS}', '${C6A}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${U5A}', '${A}', '${C5A}', '${MATHS}', 1, 'Fractions', 'Comparing two fractions'), ('${U5B}', '${A}', '${C5B}', '${MATHS}', 1, 'Fractions', 'Adding fractions'),
      ('${U6A}', '${A}', '${C6A}', '${MATHS}', 1, 'Integers', 'Negative numbers');
    insert into students (school_id, admission_no, name, class_id) values ('${A}', 'A-1', 'Zubeida Qureshi', '${C5A}');
  `);
  // Today: 5-A and 6-A taught from the map; 5-B with a typed topic only (nothing to draft from); 5-A yesterday too.
  await db.pg.query(
    `insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id)
     select $1, t.teacher_id, x.class_id, $2, x.topic, 'taught', x.day::date, x.unit_id from teachers t
       join (values ($3::uuid, $4::uuid, 'Comparing two fractions', $8::text, $5::uuid), ($3, $6, 'A typed topic', $8, null), ($7, $9, 'Negative numbers', $8, $10), ($3, $4, 'Comparing two fractions', ($8::date - 1)::text, $5)) x(user_id, class_id, topic, day, unit_id) on x.user_id = t.user_id`,
    [A, MATHS, T1, C5A, U5A, C5B, T2, today, C6A, U6A]
  );
  await switchOn(100_000);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('taught today is where Copilot starts', () => {
  it('a teacher sees only today’s lessons of their own classes, drawn from the syllabus map; the office sees every one', async () => {
    expect(await lessons(t1)).toEqual(['5-A Comparing two fractions']);
    expect(await lessons(t2)).toEqual(['6-A Negative numbers']);
    expect(await lessons(principal)).toEqual(['5-A Comparing two fractions', '6-A Negative numbers']);
  });
});

describe('a draft, approved, then used', () => {
  it('is metered against the school’s monthly limit', async () => {
    const before = (await db.pg.query(`select count(*)::int as n from ai_usage`)).rows[0].n;
    const made = await as(t1, (c) => draft(c, standInProvider, actor(t1), { kind: 'lesson_plan', classId: C5A, subjectId: MATHS, unitId: U5A }));
    expect(made).toMatchObject({ ok: true, limit: 100_000 });
    if (!made.ok) throw new Error('unreachable');
    expect(made.used).toBeGreaterThan(0);
    expect((await db.pg.query(`select count(*)::int as n from ai_usage where user_id = $1 and kind = 'lesson_plan'`, [T1])).rows[0].n).toBe(before + 1);
  });

  it('“Keep as my lesson plan” keeps the approved words under the teacher’s name', async () => {
    const words = 'Lesson plan (40 minutes)\n1. Recall halves and quarters.\n2. Compare 2/3 and 3/4 on the board.';
    expect(await as(t1, (c) => approveNote(c, actor(t1), { kind: 'lesson_plan', classId: C5A, subjectId: MATHS, unitId: U5A, body: words }))).toMatchObject({ ok: true });
    const kept = await as(t1, (c) => listNotes(c, A));
    expect(kept).toEqual([expect.objectContaining({ kind: 'lesson_plan', class_name: '5-A', title: 'Fractions: Comparing two fractions', body: words, ai_assisted: true })]);
  });

  it('“Set as homework” keeps the worksheet and sets it for the sections ticked, without the answer key', async () => {
    const made = await as(t1, (c) => draft(c, standInProvider, actor(t1), { kind: 'worksheet', classId: C5A, subjectId: MATHS, unitId: U5A, questions: 3 }));
    if (!made.ok) throw new Error('no draft');
    const approved = `${made.text}\n\nAnswers\n1. 3/4 is bigger.`;
    const details = homeworkDetails(approved);
    if (!details.ok) throw new Error('not homework');
    expect(details.details).not.toMatch(/Answers|3\/4 is bigger/);
    expect(details.details).toContain('1. A question on “Comparing two fractions”');
    expect(await as(t1, (c) => approveNote(c, actor(t1), { kind: 'worksheet', classId: C5A, subjectId: MATHS, unitId: U5A, body: approved }))).toMatchObject({ ok: true });
    const set = await as(t1, (c) => createHomework(c, actor(t1), { title: homeworkTitle('Fractions', 'Comparing two fractions'), details: details.details, dueDate: nextDay(today), subjectId: MATHS, classIds: [C5A, C5B] }));
    expect(set).toMatchObject({ ok: true });
    if (!set.ok) throw new Error('unreachable');
    const targets = (await db.pg.query(`select class_id, title, details, due_date::text as due from homework_targets where homework_id = $1 order by class_id`, [set.homeworkId])).rows;
    expect(targets).toEqual([C5A, C5B].map((class_id) => ({ class_id, title: 'Fractions: Comparing two fractions', details: details.details, due: nextDay(today) })));
    // The kept worksheet holds the answers, for the teacher.
    expect((await as(t1, (c) => listNotes(c, A))).find((n) => n.kind === 'worksheet')?.body).toContain('3/4 is bigger');
    // Never for a class that is not the teacher's.
    expect(await as(t1, (c) => createHomework(c, actor(t1), { title: 'x', details: details.details, dueDate: nextDay(today), subjectId: MATHS, classIds: [C6A] }))).toEqual({ ok: false, reason: 'not_your_class' });
  });

  it('a school whose limit is used up is refused, and the screen says so in plain words in both languages', async () => {
    await switchOn(1);
    expect(await as(t1, (c) => draft(c, standInProvider, actor(t1), { kind: 'pulse_message', classId: C5A, subjectId: MATHS, unitId: U5A }))).toEqual({ ok: false, reason: 'over_limit' });
    expect(en['cp.overLimit']).toMatch(/limit .* used up/);
    expect(hi['cp.overLimit']).toMatch(/[ऀ-ॿ]/);
    expect(hi['w20c.chainFailed']).toMatch(/[ऀ-ॿ]/);
  });
});

describe('the use steps’ own rules', () => {
  it('hold homework’s limits', () => {
    expect([HOMEWORK_TITLE_MAX, HOMEWORK_DETAILS_MAX]).toEqual([MAX_TITLE, MAX_DETAILS]);
    expect(homeworkDetails('x'.repeat(MAX_DETAILS + 1))).toEqual({ ok: false, reason: 'too_long' });
    expect(homeworkDetails('Answers\n1. 4')).toEqual({ ok: false, reason: 'empty' });
    expect(homeworkTitle('Integers', 'Integers')).toBe('Integers');
  });
  it('take the answer key off a worksheet, whatever its heading looks like', () => {
    expect(withoutAnswers('1. Q\n2. Q\n**Answers:**\n1. A')).toBe('1. Q\n2. Q');
    expect(withoutAnswers('1. Q\nAnswer key\n1. A')).toBe('1. Q');
    expect(withoutAnswers('1. Which answers are right?\n2. Q')).toBe('1. Which answers are right?\n2. Q');
  });
  it('suggest the next day as the due date', () => {
    expect([nextDay('2026-11-05'), nextDay('2026-11-30'), nextDay('2026-12-31')]).toEqual(['2026-11-06', '2026-12-01', '2027-01-01']);
  });
});
