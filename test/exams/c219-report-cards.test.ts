import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { coScholasticOf, saveCoScholastic } from '@/lib/exams/co-scholastic';
import { makeExam } from '@/lib/exams/exams';
import { saveMarks } from '@/lib/exams/marks';
import { publishClass, reopenClass, reportCardsScreen } from '@/lib/exams/publish';
import { reportCards, type ReportCardSet } from '@/lib/exams/report-card';
import { blocksText, reportCardBlocks } from '@/lib/exams/report-card-text';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// C219, two gaps of the report card (docs/27 row 9c):
//   "co-scholastic grades are recorded and shown": the grading scheme's co-scholastic areas and grades (9a), entered
//     per child for an exam by the class teacher or the office, frozen with the class's publication like remarks, and
//     shown on the report card where the kept scheme's layout says so;
//   "attendance on a card is frozen at publish": each child's attendance for the session up to the publish day is kept
//     in the publication, and the card is drawn from it, so a later attendance correction never changes it.
// On the whole schema as the app's own database role, through the app's code and route, and by going to the database
// directly. Every name, mark and day here is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));

import { POST as postScreen } from '@/app/api/app/exams/[examId]/classes/[classId]/report-cards/route';

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `c2190000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, T_MATHS, T_CLASS, T_OTHER, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(21)];
const [C5A, C5B, MATHS, SESSION] = [u(31), u(32), u(41), u(51)];
const [K1, K2, B1] = [u(71), u(72), u(81)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 5-A; not its class teacher
const tClass: Who = { role: 'teacher', user: T_CLASS, school: A }; // class teacher of 5-A
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 5-B only
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const attempt = (who: Who, sql: string, params: unknown[] = []) =>
  as(who, (c) => c.query(sql, params).then((r: { rowCount: number }) => `changed ${r.rowCount}`, (e: Error) => e.message));
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

// The school's scheme (made up): whole percents, a pass mark, two co-scholastic areas graded A to C, every part of the
// card shown.
const LAYOUT = { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: true };
const CO = { areas: ['Work Education', 'Art Education'], grades: [{ grade: 'A', meaning: 'Outstanding', pass: true }, { grade: 'B', meaning: null, pass: true }, { grade: 'C', meaning: null, pass: true }] };
const SCHEME = (layout = LAYOUT) => ({
  bands: [{ from: 50, to: 100, grade: 'P', meaning: null }, { from: 0, to: 49, grade: 'R', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [],
  terms: [],
  layout,
  coScholastic: CO,
});
let EXAM = '';
const papers = { m5a: '', m5b: '' };
const grade = (studentId: string, area: string, g: string | null) => ({ studentId, area, grade: g });
const save = (who: Who, entries: unknown, classId = C5A) => as(who, (c) => saveCoScholastic(c, actor(who), EXAM, classId, entries));
const cardsOf = async (who: Who = principal): Promise<ReportCardSet> => {
  const r = await as(who, (c) => reportCards(c, actor(who), EXAM, C5A, null));
  if (!r.ok) throw new Error(`no cards: ${r.reason}`);
  return r.set;
};
const textOf = (set: ReportCardSet, studentId: string, lang: 'en' | 'hi' = 'en') => blocksText(reportCardBlocks(set, set.cards.find((c) => c.studentId === studentId)!, lang));
const publish = async () => expect(await as(principal, (c) => publishClass(c, actor(principal), EXAM, C5A))).toMatchObject({ ok: true });
const reopen = async () => expect(await as(principal, (c) => reopenClass(c, actor(principal), EXAM, C5A, 'a correction is needed'))).toMatchObject({ ok: true });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'Made-up School A', 'IN-HR'), ('${B}', 'Made-up School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@a.example', 'school_admin', 'Asif Admin', true),
      ('${COORDINATOR}', '${A}', 'coordinator@a.example', 'academic_coordinator', 'Chitra Coordinator', true),
      ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true), ('${T_CLASS}', '${A}', 'kiran@a.example', 'teacher', 'Kiran Classteacher', true),
      ('${T_OTHER}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'accounts@a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5A}', '${A}', '5', '5', 'A', '${T_CLASS}'), ('${C5B}', '${A}', '5', '5', 'B', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C5A}'::uuid), ('${T_OTHER}', '${MATHS}', '${C5B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-01', 'Meera Madeup', '${C5A}', '1', 'active'), ('${K2}', '${A}', 'A-02', 'Zoya Madeup', '${C5A}', '2', 'active'), ('${B1}', '${A}', 'B-01', 'Kabir Madeup', '${C5B}', '1', 'active');
    -- Meera: present, late and absent in August; one day before the session began (not counted).
    insert into attendance (school_id, student_id, class_id, date, status) values
      ('${A}', '${K1}', '${C5A}', '2026-08-03', 'present'), ('${A}', '${K1}', '${C5A}', '2026-08-04', 'late'), ('${A}', '${K1}', '${C5A}', '2026-08-05', 'absent'),
      ('${A}', '${K1}', '${C5A}', '2026-03-20', 'present');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME()), PRINCIPAL]);
  const made = await as(principal, (c) =>
    makeExam(c, actor(principal), {
      name: 'Half-yearly',
      sessionId: SESSION,
      term: null,
      papers: [
        { classId: C5A, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 50 } },
        { classId: C5B, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 50 } },
      ],
    })
  );
  if (!made.ok) throw new Error('exam not made');
  EXAM = made.examId;
  const rows = await owner(`select paper_id, class_id from exam_papers where exam_id = $1`, [EXAM]);
  papers.m5a = rows.find((r: { class_id: string }) => r.class_id === C5A).paper_id;
  papers.m5b = rows.find((r: { class_id: string }) => r.class_id === C5B).paper_id;
  const entered = await as(tMaths, (c) => saveMarks(c, actor(tMaths), papers.m5a, [{ studentId: K1, component: 'marks', kind: 'score', score: 40 }, { studentId: K2, component: 'marks', kind: 'score', score: 30 }]));
  expect(entered).toMatchObject({ ok: true, complete: true });
  state.tenant = (claims: { role: string; sub: string; schoolId: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
}, 120_000);
afterAll(async () => db?.stop());

describe('co-scholastic grades are recorded', () => {
  it('the class teacher records a grade for each child in each of the scheme’s areas, audited with how many, never the grades', async () => {
    expect(await save(tClass, [grade(K1, 'Work Education', 'A'), grade(K1, 'Art Education', 'B'), grade(K2, 'Work Education', 'C')])).toEqual({ ok: true, saved: 3, cleared: 0 });
    expect(Object.fromEntries(await as(principal, (c) => coScholasticOf(c, A, EXAM, C5A)))).toEqual({ [K1]: { 'Work Education': 'A', 'Art Education': 'B' }, [K2]: { 'Work Education': 'C' } });
    expect(await owner(`select written_by from co_scholastic_grades where student_id = $1 and area = 'Work Education'`, [K1])).toEqual([{ written_by: T_CLASS }]);
    const audit = await owner(`select actor_user_id, after_state from audit_log where event_action = 'exam.co_scholastic_saved'`);
    expect(audit).toEqual([{ actor_user_id: T_CLASS, after_state: { exam_id: EXAM, class_id: C5A, saved: 3, cleared: 0 } }]);
    expect(JSON.stringify(audit)).not.toMatch(/Work Education|"A"/);
  });

  it('the office records them too; an empty grade clears one; nothing changed is nothing saved', async () => {
    expect(await save(coordinator, [grade(K2, 'Art Education', 'A')])).toEqual({ ok: true, saved: 1, cleared: 0 });
    expect(await save(admin, [grade(K2, 'Art Education', '')])).toEqual({ ok: true, saved: 0, cleared: 1 });
    expect(await save(principal, [grade(K2, 'Art Education', 'B')])).toEqual({ ok: true, saved: 1, cleared: 0 });
    expect(await save(principal, [grade(K2, 'Art Education', 'B')])).toEqual({ ok: true, saved: 0, cleared: 0 });
    // The screen offers the scheme's areas and grades, and says who may record them.
    const screen = (who: Who) => as(who, (c) => reportCardsScreen(c, actor(who), EXAM, C5A));
    const office = (await screen(principal))!;
    expect(office.coScholastic).toEqual(CO);
    expect(office.children.map((c) => [c.name, c.coScholastic])).toEqual([['Meera Madeup', { 'Work Education': 'A', 'Art Education': 'B' }], ['Zoya Madeup', { 'Work Education': 'C', 'Art Education': 'B' }]]);
    expect([(await screen(principal))!.mayWriteCoScholastic, (await screen(coordinator))!.mayWriteCoScholastic, (await screen(tClass))!.mayWriteCoScholastic, (await screen(tMaths))!.mayWriteCoScholastic]).toEqual([true, true, true, false]);
  });

  it('only a grade of the scheme, for an area of the scheme, for a child of the class: the app and the database refuse anything else', async () => {
    expect(await save(tClass, [grade(K1, 'Work Education', 'Z')])).toEqual({ ok: false, reason: 'co_grade', at: 0 });
    expect(await save(tClass, [grade(K1, 'Sports', 'A')])).toEqual({ ok: false, reason: 'co_grade', at: 0 });
    expect(await save(tClass, [grade(B1, 'Work Education', 'A')])).toEqual({ ok: false, reason: 'child', at: 0 });
    expect(await save(tClass, [grade(K1, 'Work Education', 'A'), grade(K1, 'Work Education', 'B')])).toEqual({ ok: false, reason: 'co_entries', at: 1 });
    expect(await save(tClass, [])).toEqual({ ok: false, reason: 'co_entries' });
    const insert = (who: Who, g: string, area = 'Work Education', student = K2) =>
      attempt(who, `insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by) values ($1, $2, $3, $4, $5, $6, $7)`, [A, EXAM, C5A, student, area, g, who.user]);
    await owner(`delete from co_scholastic_grades where student_id = $1 and area = 'Work Education'`, [K2]);
    expect(await insert(tClass, 'Z')).toMatch(/one of the grading scheme's/);
    expect(await insert(tClass, 'A', 'Sports')).toMatch(/one of the grading scheme's/);
    expect(await insert(tClass, 'A', 'Work Education', B1)).toMatch(/a child of that class/);
    expect(await insert(tClass, 'C')).toBe('changed 1');
    expect(await attempt(tClass, `update co_scholastic_grades set grade = 'Z' where student_id = $1`, [K2])).toMatch(/one of the grading scheme's/);
  });

  it('nobody else records or reads them: a teacher who is not the class teacher, a teacher of another class, the accountant, another school', async () => {
    expect(await save(tMaths, [grade(K1, 'Work Education', 'C')])).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await save(accountant, [grade(K1, 'Work Education', 'C')])).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await save(tOther, [grade(K1, 'Work Education', 'C')])).toEqual({ ok: false, reason: 'not_found' });
    // Straight to the database: refused, in their own name or another's.
    for (const who of [tMaths, tOther, accountant]) {
      expect(await attempt(who, `insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by) values ($1, $2, $3, $4, 'Art Education', 'A', $5)`, [A, EXAM, C5A, K1, who.user]), who.role).toMatch(/row-level security|violates|a co-scholastic grade is for/);
      expect(await attempt(who, `update co_scholastic_grades set grade = 'C' where school_id = $1`, [A]), who.role).toBe('changed 0');
      expect(await attempt(who, `delete from co_scholastic_grades where school_id = $1`, [A]), who.role).toBe('changed 0');
    }
    expect(await attempt(tClass, `insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by) values ($1, $2, $3, $4, 'Art Education', 'A', $5)`, [A, EXAM, C5A, K1, PRINCIPAL])).toMatch(/row-level security|violates|duplicate/);
    // Who reads: the office and a teacher of the class; nobody else.
    const count = (who: Who) => as(who, async (c) => (await c.query(`select count(*)::int as n from co_scholastic_grades`)).rows[0].n);
    expect([await count(principal), await count(coordinator), await count(tClass), await count(tMaths), await count(tOther), await count(accountant), await count(bPrincipal)]).toEqual([4, 4, 4, 4, 0, 0, 0]);
    // The platform role holds no right on them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const platformRead = db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return tx.query(`select count(*) from co_scholastic_grades`);
    });
    await expect(platformRead).rejects.toThrow(/permission denied/);
  });

  it('through the route: the class teacher saves; another teacher is refused', async () => {
    const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
    const post = async (who: Who, body: unknown) => {
      state.claims = claims(who);
      const res = await postScreen(new NextRequest(`http://localhost/api/app/exams/${EXAM}/classes/${C5A}/report-cards`, { method: 'POST', body: JSON.stringify(body) }), { params: { examId: EXAM, classId: C5A } });
      return { status: res.status, body: await res.json() };
    };
    expect(await post(tClass, { action: 'co_scholastic', grades: [grade(K2, 'Work Education', 'B')] })).toEqual({ status: 200, body: { ok: true, saved: 1, cleared: 0 } });
    expect(await post(tMaths, { action: 'co_scholastic', grades: [grade(K2, 'Work Education', 'A')] })).toMatchObject({ status: 403 });
    expect(await post(tClass, { action: 'co_scholastic', grades: [grade(K2, 'Work Education', 'Z')] })).toMatchObject({ status: 400, body: { code: 'co_grade' } });
  });
});

describe('co-scholastic grades are frozen with the publication and shown on the card', () => {
  it('after publish, no grade changes (app and database) until the principal reopens it', async () => {
    await publish();
    expect(await save(tClass, [grade(K1, 'Work Education', 'C')])).toEqual({ ok: false, reason: 'published' });
    expect(await save(principal, [grade(K1, 'Work Education', 'C')])).toEqual({ ok: false, reason: 'published' });
    expect(await attempt(tClass, `update co_scholastic_grades set grade = 'C' where student_id = $1 and area = 'Work Education'`, [K1])).toMatch(/frozen/);
    expect(await attempt(principal, `delete from co_scholastic_grades where student_id = $1`, [K1])).toMatch(/frozen/);
    expect(await attempt(tClass, `insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by) values ($1, $2, $3, $4, 'Art Education', 'A', $5)`, [A, EXAM, C5A, K2, T_CLASS])).toMatch(/frozen/);
    expect((await as(tClass, (c) => reportCardsScreen(c, actor(tClass), EXAM, C5A)))!.mayWriteCoScholastic).toBe(false);
  });

  it('the card shows each area of the kept scheme with the child’s grade and its meaning, in both languages', async () => {
    const set = await cardsOf();
    expect(set.cards.find((c) => c.studentId === K1)!.coScholastic).toEqual([
      { area: 'Work Education', grade: 'A', meaning: 'Outstanding' },
      { area: 'Art Education', grade: 'B', meaning: null },
    ]);
    const text = textOf(set, K1);
    expect(text).toContain('Co-scholastic areas');
    expect(text).toContain('Area | Grade');
    expect(text).toContain('Work Education | A (Outstanding)');
    expect(text).toContain('Art Education | B');
    // Zoya has a grade in one area only: the other says it was not entered, never a grade made up.
    expect(textOf(set, K2)).toContain('Art Education | B');
    expect(textOf(set, K2)).toContain('Work Education | B');
    expect(textOf(set, K1, 'hi')).toContain(hi['rc.card.coTitle']);
    // The class teacher's own download says the same.
    expect(textOf(await cardsOf(tClass), K1)).toBe(text);
  });

  it('reopened, a grade is corrected; published again, the card says the new grade; a layout without them shows none', async () => {
    await reopen();
    expect(await save(tClass, [grade(K1, 'Art Education', 'A'), grade(K2, 'Work Education', '')])).toEqual({ ok: true, saved: 1, cleared: 1 });
    await publish();
    let set = await cardsOf();
    expect(textOf(set, K1)).toContain('Art Education | A (Outstanding)');
    expect(textOf(set, K2)).toContain(`Work Education | ${en['rc.cell.notEntered']}`);
    // A scheme whose report card leaves co-scholastic out: published by it, the card has no such section.
    await reopen();
    await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 2, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME({ ...LAYOUT, coScholastic: false })), PRINCIPAL]);
    await publish();
    set = await cardsOf();
    expect(textOf(set, K1)).not.toContain('Co-scholastic areas');
    // The grades themselves are kept.
    expect((await as(principal, (c) => coScholasticOf(c, A, EXAM, C5A))).get(K1)).toEqual({ 'Work Education': 'A', 'Art Education': 'A' });
    await reopen();
    await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 3, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME()), PRINCIPAL]);
    await publish();
  });
});

describe('attendance on a card is frozen at publish', () => {
  const kept = async () => (await owner(`select attendance from exam_publications where exam_id = $1 and class_id = $2 and reopened_at is null`, [EXAM, C5A]))[0].attendance;

  it('the publication keeps each child’s attendance for the session up to the day it was published, and the card is drawn from it', async () => {
    // Meera: three days marked in the session (the day in March was before it began), in school on two.
    expect(await kept()).toEqual({ [K1]: { present: 2, days: 3 }, [K2]: { present: 0, days: 0 } });
    const set = await cardsOf();
    expect(set.hasSession).toBe(true);
    expect(set.cards.find((c) => c.studentId === K1)!.attendance).toEqual({ present: 2, days: 3 });
    expect(textOf(set, K1)).toContain('present on 2 of the 3 days marked');
  });

  it('a later correction of attendance never changes the published card', async () => {
    // The absent day is corrected to present, and a mark is added for a day before the publish day.
    expect(await attempt(principal, `update attendance set status = 'present' where student_id = $1 and date = '2026-08-05'`, [K1])).toBe('changed 1');
    expect(await attempt(principal, `insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, '2026-08-06', 'present')`, [A, K1, C5A])).toBe('changed 1');
    const set = await cardsOf();
    expect(set.cards.find((c) => c.studentId === K1)!.attendance).toEqual({ present: 2, days: 3 });
    expect(await kept()).toEqual({ [K1]: { present: 2, days: 3 }, [K2]: { present: 0, days: 0 } });
    // Nobody changes what a publication keeps, the office included.
    expect(await attempt(principal, `update exam_publications set attendance = '{}'::jsonb where exam_id = $1 and reopened_at is null`, [EXAM])).toMatch(/only reopened|never changes/);
  });

  it('what a publication keeps is the database’s own count: a publication written straight in is given the real one; published again, the card follows the corrected marks', async () => {
    await reopen();
    // Written straight into the database with an attendance of its own: the trigger counts it again.
    expect(await attempt(principal, `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, attendance, published_by) values ($1, $2, $3, 1, 1, '{}'::jsonb, $4::jsonb, $5)`, [A, EXAM, C5A, JSON.stringify({ [K1]: { present: 99, days: 99 } }), PRINCIPAL])).toBe('changed 1');
    expect(await kept()).toEqual({ [K1]: { present: 4, days: 4 }, [K2]: { present: 0, days: 0 } });
    expect((await cardsOf()).cards.find((c) => c.studentId === K1)!.attendance).toEqual({ present: 4, days: 4 });
  });

  it('an exam with no session keeps no attendance, and its card says so', async () => {
    const made = await as(principal, (c) => makeExam(c, actor(principal), { name: 'Class test', sessionId: null, term: null, papers: [{ classId: C5A, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 10 } }] }));
    if (!made.ok) throw new Error('exam not made');
    const paper = (await owner(`select paper_id from exam_papers where exam_id = $1`, [made.examId]))[0].paper_id;
    await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper, [{ studentId: K1, component: 'marks', kind: 'score', score: 8 }, { studentId: K2, component: 'marks', kind: 'score', score: 6 }]));
    expect(await as(principal, (c) => publishClass(c, actor(principal), made.examId, C5A))).toMatchObject({ ok: true });
    expect((await owner(`select attendance from exam_publications where exam_id = $1`, [made.examId]))[0].attendance).toBeNull();
    const r = await as(principal, (c) => reportCards(c, actor(principal), made.examId, C5A, K1));
    if (!r.ok) throw new Error(r.reason);
    expect(r.set.hasSession).toBe(false);
    expect(blocksText(reportCardBlocks(r.set, r.set.cards[0], 'en'))).toContain(en['rc.card.noSession']);
  });

  it('the publications made before the migration were filled in as their cards showed them: up to the day each was published', async () => {
    // A publication made on 5 August, before this migration, with no attendance kept: the migration's fill-in.
    await owner(`alter table exam_publications disable trigger exam_publications_rules`);
    await owner(`update exam_publications set attendance = null, published_at = '2026-08-05 10:00:00+05:30' where exam_id = $1 and class_id = $2 and reopened_at is null`, [EXAM, C5A]);
    await owner(`alter table exam_publications enable trigger exam_publications_rules`);
    const migration = readFileSync(path.join(ROOT, 'supabase/migrations', readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_c219_p6_closeout.sql'))!), 'utf8');
    const fill = migration.slice(migration.indexOf('alter table exam_publications disable trigger'), migration.indexOf('alter table exam_publications enable trigger'));
    expect(fill).toMatch(/update exam_publications x set attendance = public\.publication_attendance\(/);
    await owner(`alter table exam_publications disable trigger exam_publications_rules`);
    await db.pg.exec(fill.replace(/^alter table exam_publications disable trigger exam_publications_rules;/, ''));
    await owner(`alter table exam_publications enable trigger exam_publications_rules`);
    // Up to 5 August: the 3rd (present), the 4th (late) and the 5th (now corrected to present); not the 6th.
    expect(await kept()).toEqual({ [K1]: { present: 3, days: 3 }, [K2]: { present: 0, days: 0 } });
  });
});
