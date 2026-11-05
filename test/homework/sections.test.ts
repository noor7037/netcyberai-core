import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { addSections, createHomework, eligibleSections, sectionCompletion, setCompletion, listAssignments } from '@/lib/homework/homework';

// Homework completion by section, and "send to more sections" (W20-D, H4), on the whole real schema as app_user.
// Completion is what the school side stores in homework_status (setCompletion); a family's phone only reads it.

const A = 'b9000000-0000-4000-8000-000000000001';
const PRINCIPAL = 'b9000000-0000-4000-8000-0000000000a1';
const T1 = 'b9000000-0000-4000-8000-0000000000a2'; // class teacher of 5-A and 5-B; teaches Maths in 5-C
const T2 = 'b9000000-0000-4000-8000-0000000000a3'; // class teacher of 6-A
const T1_PROFILE = 'b9000000-0000-4000-8000-0000000000f2';
const C5A = 'b9000000-0000-4000-8000-0000000000c1';
const C5B = 'b9000000-0000-4000-8000-0000000000c2';
const C5C = 'b9000000-0000-4000-8000-0000000000c3';
const C5D = 'b9000000-0000-4000-8000-0000000000c4';
const C6A = 'b9000000-0000-4000-8000-0000000000c5';
const MATHS = 'b9000000-0000-4000-8000-0000000000d1';
const HINDI = 'b9000000-0000-4000-8000-0000000000d2';
const sid = (n: number) => `b9000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const TODAY = '2026-10-12';
const DUE = '2026-10-14';
const text = { title: 'Fractions worksheet', details: 'Questions 1 to 5', dueDate: DUE };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
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
const set = (who: Who, classIds: string[], subjectId = MATHS) => as(who, (c) => createHomework(c, actor(who), { ...text, subjectId, classIds }));
const reset = () => db.pg.exec(`delete from homework_status; delete from homework_attachments; delete from homework_targets; delete from homework;`);
const homeworkId = async () => (await db.pg.query(`select homework_id from homework`)).rows[0].homework_id as string;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two');
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T1_PROFILE}', '${A}', '${T1}', 'Teacher One');
    insert into classes (class_id, school_id, name, class_teacher_id) values
      ('${C5A}', '${A}', '5-A', '${T1}'), ('${C5B}', '${A}', '5-B', '${T1}'), ('${C5C}', '${A}', '5-C', null), ('${C5D}', '${A}', '5-D', null), ('${C6A}', '${A}', '6-A', '${T2}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${HINDI}', '${A}', 'Hindi');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T1_PROFILE}', '${MATHS}', '${C5C}'), ('${A}', '${T1_PROFILE}', '${HINDI}', '${C5D}');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no) values
      ('${sid(1)}', '${A}', 'A-1', 'Asha Rao', '${C5A}', '1'), ('${sid(2)}', '${A}', 'A-2', 'Bilal Khan', '${C5A}', '2'), ('${sid(3)}', '${A}', 'A-3', 'Chitra Nair', '${C5A}', '3'),
      ('${sid(4)}', '${A}', 'A-4', 'Dev Sharma', '${C5B}', '1'), ('${sid(5)}', '${A}', 'A-5', 'Esha Gupta', '${C5B}', '2'),
      ('${sid(6)}', '${A}', 'A-6', 'Farah Ali', '${C5C}', '1');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('completion by section', () => {
  it('counts done over the roll for each section, names those who have not by first name, and a teacher sees only their own classes', async () => {
    await reset();
    await set(principal, [C5A, C5B, C6A]);
    const hw = await homeworkId();
    const all = await as(principal, (c) => listAssignments(c, A, TODAY));
    const target = (name: string) => all.find((a) => a.class_name === name)!.target_id;
    // The school side stores the marks: Asha done, Bilal "not done", Chitra not yet checked; 5-B: Dev done.
    await as(t1, (c) => setCompletion(c, actor(t1), target('5-A'), [{ studentId: sid(1), done: true }, { studentId: sid(2), done: false }]));
    await as(t1, (c) => setCompletion(c, actor(t1), target('5-B'), [{ studentId: sid(4), done: true }]));

    const office = await as(principal, (c) => sectionCompletion(c, A, hw));
    expect(office.map((s) => [s.class_name, s.done, s.students, s.notYet])).toEqual([['5-A', 1, 3, ['Bilal', 'Chitra']], ['5-B', 1, 2, ['Esha']], ['6-A', 0, 0, []]]);
    // Each section's number is the Homework screen's own.
    expect((await as(principal, (c) => listAssignments(c, A, TODAY))).map((a) => [a.class_name, a.done, a.students])).toEqual(office.map((s) => [s.class_name, s.done, s.students]));

    expect((await as(t1, (c) => sectionCompletion(c, A, hw))).map((s) => s.class_name)).toEqual(['5-A', '5-B']);
    expect((await as(t2, (c) => sectionCompletion(c, A, hw))).map((s) => s.class_name)).toEqual(['6-A']);
  });
});

describe('send to more sections', () => {
  it('copies the text and due date to sections of the same class level the teacher teaches, once each', async () => {
    await reset();
    await set(t1, [C5A]);
    const hw = await homeworkId();
    // 5-B is theirs as class teacher; 5-C they teach Maths in. 5-D they teach only Hindi in. 6-A is another level.
    expect((await as(t1, (c) => eligibleSections(c, actor(t1), hw))).map((c) => c.name)).toEqual(['5-B', '5-C']);
    expect((await as(principal, (c) => eligibleSections(c, actor(principal), hw))).map((c) => c.name)).toEqual(['5-B', '5-C', '5-D']);

    const sent = await as(t1, (c) => addSections(c, actor(t1), hw, [C5B, C5C]));
    expect(sent).toMatchObject({ ok: true });
    const rows = (await db.pg.query(`select c.name, t.title, t.details, t.due_date::text as due_date from homework_targets t join classes c on c.class_id = t.class_id where t.homework_id = $1 order by c.name`, [hw])).rows;
    expect(rows).toEqual([
      { name: '5-A', title: text.title, details: text.details, due_date: DUE },
      { name: '5-B', title: text.title, details: text.details, due_date: DUE },
      { name: '5-C', title: text.title, details: text.details, due_date: DUE },
    ]);
    expect((await db.pg.query(`select count(*)::int as n from homework where homework_id = $1`, [hw])).rows[0].n).toBe(1);
    // A section already given it is no longer offered, and cannot be sent twice.
    expect(await as(t1, (c) => addSections(c, actor(t1), hw, [C5B]))).toEqual({ ok: false, reason: 'not_eligible' });
    expect((await db.pg.query(`select event_action from audit_log where event_action = 'homework.sections_added'`)).rows).toHaveLength(1);
  });

  it('refuses a section the teacher does not teach, another class level, nothing, and a teacher who has no part in the homework', async () => {
    await reset();
    await set(t1, [C5A]);
    const hw = await homeworkId();
    expect(await as(t1, (c) => addSections(c, actor(t1), hw, [C5D]))).toEqual({ ok: false, reason: 'not_eligible' });
    expect(await as(t1, (c) => addSections(c, actor(t1), hw, [C6A]))).toEqual({ ok: false, reason: 'not_eligible' });
    expect(await as(t1, (c) => addSections(c, actor(t1), hw, []))).toEqual({ ok: false, reason: 'no_sections' });
    expect(await as(t2, (c) => addSections(c, actor(t2), hw, [C5B]))).toEqual({ ok: false, reason: 'not_found' });
    expect((await db.pg.query(`select count(*)::int as n from homework_targets`)).rows[0].n).toBe(1);
    // The office may send it to any section of the level.
    expect(await as(principal, (c) => addSections(c, actor(principal), hw, [C5D]))).toMatchObject({ ok: true });
  });
});
