import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { helpArticle } from '@/content/help/articles';
import { recordTaught } from '@/lib/academics/taught';
import { MODULE_REGISTRY, moduleById } from '@/lib/contracts/modules';
import { TOURS } from '@/lib/contracts/tours';
import { classGap, gapScreen } from '@/lib/curriculum-gap/curriculum-gap';
import { changeExam, makeExam } from '@/lib/exams/exams';
import { readModuleFor } from '@/lib/frameworks/write-guard';
import { t } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// The Curriculum Gap Detector (docs/27 row 9d, C216). The acceptance test: "For a class and subject with a map, every
// unit appears once in the right state with its dates. Teaching it, or adding it to a paper, moves it. A class with no
// map says "not set up", never zero. A teacher sees only their classes." Each sentence is proven on the whole schema as
// the app's own database role: through the app's code and its route, and by going to the database directly. Lessons
// are recorded through "Taught today" (recordTaught) and papers through Exams (makeExam, changeExam), as the app does.
// Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/i18n/server', () => ({ getLang: () => ({ lang: 'en' }) }));

import { GET as getGap } from '@/app/api/app/curriculum-gap/route';
import CurriculumGapPage from '@/app/(school)/app/curriculum-gap/page';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `9d000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, T_MATHS, T_SUB, T_CLASS, T_OTHER, ACCOUNTANT, PARENT, B_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(18), u(19), u(21), u(91)];
const [C5A, C5B, C6A, CB] = [u(31), u(32), u(33), u(34)];
const [MATHS, ENGLISH, B_MATHS] = [u(41), u(42), u(43)];
// 5-A Mathematics: six units. 5-B Mathematics: two. School B: one. 5-A English and 6-A: no map.
const [U1, U2, U3, U4, U5, U6, V1, V2, W1] = [u(61), u(62), u(63), u(64), u(65), u(66), u(71), u(72), u(81)];
const MAP_5A = [U1, U2, U3, U4, U5, U6];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 5-A
const tSub: Who = { role: 'teacher', user: T_SUB, school: A }; // also teaches Mathematics in 5-A (a second teacher of it)
const tClass: Who = { role: 'teacher', user: T_CLASS, school: A }; // class teacher of 5-A, teaches English in 5-B; no Mathematics
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 5-B only
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const parent: Who = { role: 'parent', user: PARENT, school: A };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    for (const [k, v] of [['app.current_tenant_id', '00000000-0000-0000-0000-000000000000'], ['app.current_role', 'super_admin'], ['app.current_user_id', FOUNDER]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
// The reader, called straight in the database as the person.
const direct = (who: Who, classId: string, subjectId: string) =>
  as(who, async (c) => (await c.query(`select unit_id, taught_first::text as taught_first, lessons, papers from public.curriculum_gap_units($1, $2)`, [classId, subjectId])).rows);

// "Taught today", as the teacher taps it.
const teach = async (who: Who, unitId: string | null, date: string, status: 'taught' | 'partial' | 'delayed' | 'not_taught' = 'taught') => {
  const done = await as(who, (c) => recordTaught(c, actor(who), { classId: C5A, subjectId: MATHS, topic: `Lesson of ${date}`, status, date, teacherId: null, unitId, note: null }));
  expect(done.kind).toBe('ok');
};

// The routes, as the app's own session calls them.
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(82) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: Who, query = ''): Promise<{ status: number; body: any }> => {
  state.claims = claims(who);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn2: (x: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn2);
  const res = await getGap(new NextRequest(`http://localhost/api/app/curriculum-gap${query}`, { method: 'GET' }));
  return { status: res.status, body: await res.json() };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const statesOf = (body: any) => body.gap.units.map((x: { unitId: string; state: string }) => [x.unitId, x.state]);
const maths5A = `?classId=${C5A}&subjectId=${MATHS}`;

const PAPER_DAY = '2026-07-10';
let examId = '';
let paperId = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
      ('${T_MATHS}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Maths', true), ('${T_SUB}', '${A}', 'sohan@school-a.example', 'teacher', 'Sohan Second', true),
      ('${T_CLASS}', '${A}', 'kiran@school-a.example', 'teacher', 'Kiran Classteacher', true), ('${T_OTHER}', '${A}', 'omar@school-a.example', 'teacher', 'Omar Other', true),
      ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true), ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder', true);
    insert into teachers (teacher_id, school_id, user_id, name) values
      (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_SUB}', 'Sohan Second'),
      (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values
      ('${C5A}', '${A}', '5', '5', 'A', '${T_CLASS}'), ('${C5B}', '${A}', '5', '5', 'B', null), ('${C6A}', '${A}', '6', '6', 'A', null), ('${CB}', '${B}', '5', '5', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t
        join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C5A}'::uuid), ('${T_SUB}', '${MATHS}', '${C5A}'), ('${T_CLASS}', '${ENGLISH}', '${C5B}'), ('${T_OTHER}', '${MATHS}', '${C5B}')) x(user_id, subject_id, class_id)
          on x.user_id = t.user_id;
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${U1}', '${A}', '${C5A}', '${MATHS}', 1, 'Fractions', 'Halves and quarters'),
      ('${U2}', '${A}', '${C5A}', '${MATHS}', 2, 'Fractions', 'Comparing two fractions'),
      ('${U3}', '${A}', '${C5A}', '${MATHS}', 3, 'Fractions', 'Fractions on the number line'),
      ('${U4}', '${A}', '${C5A}', '${MATHS}', 4, 'Decimals', 'Tenths'),
      ('${U5}', '${A}', '${C5A}', '${MATHS}', 5, 'Decimals', 'Hundredths'),
      ('${U6}', '${A}', '${C5A}', '${MATHS}', 6, 'Measurement', 'Measurement'),
      ('${V1}', '${A}', '${C5B}', '${MATHS}', 1, 'Fractions', 'Halves and quarters'),
      ('${V2}', '${A}', '${C5B}', '${MATHS}', 2, 'Decimals', 'Tenths'),
      ('${W1}', '${B}', '${CB}', '${B_MATHS}', 1, 'Fractions', 'Halves and quarters');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'curriculum-gap', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('a class and subject with a map: every unit once, in the right state, with its dates', () => {
  it('nothing taught and nothing assessed: every unit, once and in the map’s order, is not taught yet', async () => {
    const got = await call(principal, maths5A);
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ wholeSchool: true, classId: C5A, subjectId: MATHS, gap: { setUp: true, total: 6 } });
    expect(statesOf(got.body)).toEqual(MAP_5A.map((id) => [id, 'not-yet-taught']));
    expect(got.body.gap.counts).toEqual({ 'assessed-before-taught': 0, 'taught-assessed': 0, 'taught-not-assessed': 0, skipped: 0, 'not-yet-taught': 6 });
  });

  it('teaching a unit moves it: taught, and the units before it that were not taught are skipped, with the day the later one was taught', async () => {
    await teach(tMaths, U1, '2026-07-01');
    let got = await call(principal, maths5A);
    expect(statesOf(got.body)).toEqual([[U1, 'taught-not-assessed'], [U2, 'not-yet-taught'], [U3, 'not-yet-taught'], [U4, 'not-yet-taught'], [U5, 'not-yet-taught'], [U6, 'not-yet-taught']]);
    expect(got.body.gap.units[0]).toMatchObject({ taughtFirst: '2026-07-01', taughtLast: '2026-07-01', lessons: 1, papers: [] });

    // A second teacher of the subject teaches unit 3: unit 2 is now skipped, and says why and since when.
    await teach(tSub, U3, '2026-07-08');
    // Unit 1 again, a week later: still one unit, with its first and last day.
    await teach(tMaths, U1, '2026-07-15');
    got = await call(principal, maths5A);
    expect(statesOf(got.body)).toEqual([[U1, 'taught-not-assessed'], [U2, 'skipped'], [U3, 'taught-not-assessed'], [U4, 'not-yet-taught'], [U5, 'not-yet-taught'], [U6, 'not-yet-taught']]);
    expect(got.body.gap.units[0]).toMatchObject({ taughtFirst: '2026-07-01', taughtLast: '2026-07-15', lessons: 2 });
    expect(got.body.gap.units[1]).toMatchObject({ taughtFirst: null, laterTaught: { unitId: U3, topic: 'Fractions on the number line', day: '2026-07-08' } });

    // A lesson marked partly taught, delayed or not taught does not make a unit taught.
    await teach(tMaths, U2, '2026-07-16', 'not_taught');
    await teach(tMaths, U6, '2026-07-17', 'partial');
    got = await call(principal, maths5A);
    expect(statesOf(got.body)).toEqual([[U1, 'taught-not-assessed'], [U2, 'skipped'], [U3, 'taught-not-assessed'], [U4, 'not-yet-taught'], [U5, 'not-yet-taught'], [U6, 'not-yet-taught']]);
  });

  it('adding a unit to a paper moves it: taught before the paper is taught and assessed; on a paper and not taught is assessed before it was taught', async () => {
    const made = await as(principal, (c) =>
      makeExam(c, actor(principal), { name: 'Unit test 1', sessionId: null, term: null, papers: [{ classId: C5A, subjectId: MATHS, date: PAPER_DAY, unitIds: [U1, U4], maxima: { marks: 50 } }] })
    );
    expect(made.ok).toBe(true);
    examId = made.ok ? made.examId : '';
    paperId = (await owner(`select paper_id from exam_papers where exam_id = $1`, [examId]))[0].paper_id;
    let got = await call(principal, maths5A);
    expect(statesOf(got.body)).toEqual([[U1, 'taught-assessed'], [U2, 'skipped'], [U3, 'taught-not-assessed'], [U4, 'assessed-before-taught'], [U5, 'not-yet-taught'], [U6, 'not-yet-taught']]);
    const paper = { paperId, examId, examName: 'Unit test 1', date: PAPER_DAY };
    expect(got.body.gap.units[0]).toMatchObject({ papers: [paper], papersBefore: [] });
    expect(got.body.gap.units[3]).toMatchObject({ taughtFirst: null, papers: [paper], papersBefore: [paper] });

    // The office adds unit 3 to the paper's chapters: taught on 8 July, before the paper of 10 July.
    expect(await as(principal, (c) => changeExam(c, actor(principal), examId, { action: 'paper', paperId, date: PAPER_DAY, unitIds: [U1, U3, U4] }))).toMatchObject({ ok: true });
    got = await call(principal, maths5A);
    expect(statesOf(got.body)).toEqual([[U1, 'taught-assessed'], [U2, 'skipped'], [U3, 'taught-assessed'], [U4, 'assessed-before-taught'], [U5, 'not-yet-taught'], [U6, 'not-yet-taught']]);

    // And taking a unit off the paper moves it back.
    expect(await as(principal, (c) => changeExam(c, actor(principal), examId, { action: 'paper', paperId, date: PAPER_DAY, unitIds: [U1, U4] }))).toMatchObject({ ok: true });
    expect(statesOf((await call(principal, maths5A)).body)[2]).toEqual([U3, 'taught-not-assessed']);
    expect(await as(principal, (c) => changeExam(c, actor(principal), examId, { action: 'paper', paperId, date: PAPER_DAY, unitIds: [U1, U3, U4] }))).toMatchObject({ ok: true });
  });

  it('teaching a unit after the paper that assessed it keeps it assessed before it was taught, with both days; a later unit taught leaves no skip behind it', async () => {
    await teach(tMaths, U4, '2026-08-01');
    await teach(tSub, U5, '2026-08-02');
    // A second exam, with no date yet, assesses unit 3 too: a paper with no date is not before a lesson.
    const second = await as(coordinator, (c) =>
      makeExam(c, actor(coordinator), { name: 'Unit test 2', sessionId: null, term: null, papers: [{ classId: C5A, subjectId: MATHS, date: null, unitIds: [U3], maxima: { marks: 25 } }] })
    );
    expect(second.ok).toBe(true);
    const got = await call(principal, maths5A);
    expect(statesOf(got.body)).toEqual([[U1, 'taught-assessed'], [U2, 'skipped'], [U3, 'taught-assessed'], [U4, 'assessed-before-taught'], [U5, 'taught-not-assessed'], [U6, 'not-yet-taught']]);
    expect(got.body.gap.counts).toEqual({ 'assessed-before-taught': 1, 'taught-assessed': 2, 'taught-not-assessed': 1, skipped: 1, 'not-yet-taught': 1 });
    expect(got.body.gap.total).toBe(6);
    // Every unit once.
    expect(got.body.gap.units.map((x: { unitId: string }) => x.unitId)).toEqual(MAP_5A);
    const [, , u3, u4] = got.body.gap.units;
    expect(u4).toMatchObject({ taughtFirst: '2026-08-01', lessons: 1, papersBefore: [{ paperId, date: PAPER_DAY }] });
    expect(u3.papers.map((p: { examName: string; date: string | null }) => [p.examName, p.date])).toEqual([['Unit test 1', PAPER_DAY], ['Unit test 2', null]]);
    expect(u3.papersBefore).toEqual([]);
    // The skip still rests on unit 3's day: of the units after unit 2, the one taught first.
    expect(got.body.gap.units[1].laterTaught).toMatchObject({ unitId: U3, day: '2026-07-08' });
  });

  it('the office, the coordinator and the teachers of the class see the same states: lessons recorded by any teacher of the class count', async () => {
    const office = statesOf((await call(principal, maths5A)).body);
    for (const who of [admin, coordinator, tMaths, tSub, tClass]) {
      const got = await call(who, maths5A);
      expect(got.status, who.user).toBe(200);
      expect(statesOf(got.body), who.user).toEqual(office);
    }
    // Why the reader has its own rule: under the table's own policy the class teacher, who does not teach
    // Mathematics, reads none of these lessons, and Tara reads only her own.
    const lessons = (who: Who) => as(who, async (c) => (await c.query(`select count(*)::int as n from syllabus_progress where class_id = $1 and subject_id = $2 and status = 'taught'`, [C5A, MATHS])).rows[0].n);
    expect(await lessons(tClass)).toBe(0);
    expect(await lessons(tMaths)).toBe(3);
    expect(await lessons(principal)).toBe(5);
    expect((await direct(tClass, C5A, MATHS)).map((r: { unit_id: string; lessons: number }) => [r.unit_id, r.lessons])).toEqual([[U1, 2], [U2, 0], [U3, 1], [U4, 1], [U5, 1], [U6, 0]]);
  });

  it('the reader gives units, days and exam names only: no child, no mark, no lesson note, no teacher', async () => {
    const row = await as(principal, async (c) => (await c.query(`select * from public.curriculum_gap_units($1, $2) limit 1`, [C5A, MATHS])).rows[0]);
    expect(Object.keys(row).sort()).toEqual(['added_at', 'chapter', 'lessons', 'papers', 'place', 'taught_first', 'taught_last', 'topic', 'unit_id']);
    expect(Object.keys(row.papers[0]).sort()).toEqual(['date', 'examId', 'examName', 'paperId']);
  });
});

describe('a class with no map says "not set up", never zero', () => {
  it('5-A English and 6-A: not set up, with no count and no unit', async () => {
    const english = await call(principal, `?classId=${C5A}&subjectId=${ENGLISH}`);
    expect(english.status).toBe(200);
    expect(english.body.gap).toEqual({ setUp: false });
    expect(JSON.stringify(english.body.gap)).not.toMatch(/counts|units|total/);
    const sixA = await call(principal, `?classId=${C6A}`);
    expect(sixA.body).toMatchObject({ classId: C6A, gap: { setUp: false } });
    expect(sixA.body.subjects).toEqual([{ subjectId: ENGLISH, name: 'English', mapped: false }, { subjectId: MATHS, name: 'Mathematics', mapped: false }]);
    // The subject shown first is one the class has a map for.
    const fiveA = await call(principal, `?classId=${C5A}`);
    expect(fiveA.body).toMatchObject({ subjectId: MATHS, gap: { setUp: true } });
    expect(fiveA.body.subjects).toEqual([{ subjectId: ENGLISH, name: 'English', mapped: false }, { subjectId: MATHS, name: 'Mathematics', mapped: true }]);
    // The same through the code the screen uses.
    expect(await as(coordinator, (c) => classGap(c, C6A, MATHS))).toEqual({ setUp: false });
  });
});

describe('a teacher sees only their classes', () => {
  it('each teacher is offered their own classes only; the office and the coordinator every class', async () => {
    const classesOf = async (who: Who) => (await call(who)).body.classes.map((c: { classId: string; name: string }) => [c.classId, c.name]);
    for (const who of [principal, admin, coordinator]) expect(await classesOf(who), who.role).toEqual([[C5A, '5-A'], [C5B, '5-B'], [C6A, '6-A']]);
    expect(await classesOf(tMaths)).toEqual([[C5A, '5-A']]);
    expect(await classesOf(tClass)).toEqual([[C5A, '5-A'], [C5B, '5-B']]);
    expect(await classesOf(tOther)).toEqual([[C5B, '5-B']]);
    expect((await call(tOther)).body).toMatchObject({ wholeSchool: false, classId: C5B, subjectId: MATHS, gap: { setUp: true, total: 2 } });
  });

  it('a class that is not theirs is refused by the app, and the database gives nothing for it', async () => {
    for (const q of [maths5A, `?classId=${C5A}`, `?classId=${C6A}&subjectId=${MATHS}`]) expect(await call(tOther, q), q).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await call(tMaths, `?classId=${C5B}&subjectId=${MATHS}`)).toMatchObject({ status: 404 });
    // Straight to the database: the reader answers nothing for another class, and the tables give nothing either.
    expect(await direct(tOther, C5A, MATHS)).toEqual([]);
    expect((await direct(tOther, C5B, MATHS)).map((r: { unit_id: string }) => r.unit_id)).toEqual([V1, V2]);
    expect(await direct(tMaths, C5B, MATHS)).toEqual([]);
    const tables = await as(tOther, async (c) => ({
      units: (await c.query(`select count(*)::int as n from syllabus_units where class_id = $1`, [C5A])).rows[0].n,
      lessons: (await c.query(`select count(*)::int as n from syllabus_progress where class_id = $1`, [C5A])).rows[0].n,
      papers: (await c.query(`select count(*)::int as n from exam_papers where class_id = $1`, [C5A])).rows[0].n,
    }));
    expect(tables).toEqual({ units: 0, lessons: 0, papers: 0 });
    // Through the code the screen uses, too.
    expect(await as(tOther, (c) => gapScreen(c, actor(tOther), { classId: C5A, subjectId: MATHS }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(tOther, (c) => gapScreen(c, actor(tOther), { classId: 'not-an-id' }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(tOther, (c) => gapScreen(c, actor(tOther), { classId: C5B, subjectId: B_MATHS }))).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a teacher with no class sees no class, and nothing else', async () => {
    await owner(`insert into users (user_id, school_id, email, role, display_name, is_active) values ($1, $2, 'new@school-a.example', 'teacher', 'Nina New', true)`, [u(20), A]);
    const nina: Who = { role: 'teacher', user: u(20), school: A };
    expect((await call(nina)).body).toEqual({ wholeSchool: false, classes: [], subjects: [{ subjectId: ENGLISH, name: 'English', mapped: false }, { subjectId: MATHS, name: 'Mathematics', mapped: false }], classId: null, subjectId: ENGLISH, gap: null });
    expect(await direct(nina, C5A, MATHS)).toEqual([]);
  });

  it('nobody else reads it: the accountant and a parent account are refused, another school sees nothing of this one, the platform role cannot call the reader', async () => {
    expect(await call(accountant, maths5A)).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await direct(accountant, C5A, MATHS)).toEqual([]);
    expect(await direct(parent, C5A, MATHS)).toEqual([]);
    expect(await call(bPrincipal, maths5A)).toMatchObject({ status: 404 });
    expect(await direct(bPrincipal, C5A, MATHS)).toEqual([]);
    const own = await call(bPrincipal);
    expect(own.body.classes).toEqual([{ classId: CB, name: '5-A' }]);
    expect(statesOf(own.body)).toEqual([[W1, 'not-yet-taught']]);
    await expect(platform((c) => c.query(`select * from public.curriculum_gap_units($1, $2)`, [C5A, MATHS]))).rejects.toThrow(/permission denied/);
  });
});

describe('the module', () => {
  it('is partly built for the office, the coordinator and teachers (their own classes), with its read route, tour, guide and words', () => {
    expect(moduleById('curriculum-gap')).toMatchObject({ status: 'partial', teacherScope: 'ownClassesOnly', roles: ['principal', 'school_admin', 'teacher', 'academic_coordinator'] });
    expect(moduleById('curriculum-gap').capabilities).toEqual(['Planned vs taught vs assessed', 'Flags untaught or unassessed chapters per class']);
    expect(MODULE_REGISTRY.filter((m) => m.roles.includes('accountant')).map((m) => m.id)).not.toContain('curriculum-gap');
    expect(readModuleFor('/api/app/curriculum-gap')).toBe('curriculum-gap');
    expect(TOURS['curriculum-gap'].steps).toHaveLength(3);
    const guide = helpArticle('find-curriculum-gaps')!;
    expect(guide.start?.href).toBe('/app/curriculum-gap');
    for (const slug of guide.related) expect(helpArticle(slug), slug).toBeTruthy();
    const mine = (m: Record<string, string>) => Object.entries(m).filter(([k]) => k.startsWith('cg.') || k.startsWith('tour.curriculum-gap.') || k === 'moduleOff.curriculum-gap');
    expect(mine(hi).map(([k]) => k)).toEqual(mine(en).map(([k]) => k));
    expect(en['moduleOff.curriculum-gap'].length).toBeLessThanOrEqual(200);
    expect(hi['moduleOff.curriculum-gap'].length).toBeLessThanOrEqual(200);
    for (const n of [1, 2, 3]) {
      expect(t('en', `tour.curriculum-gap.${n}.title` as never).length).toBeLessThanOrEqual(40);
      expect(t('en', `tour.curriculum-gap.${n}.text` as never).length).toBeLessThanOrEqual(160);
    }
    // No ranking of classes or teachers, and no judging words.
    const english = [...mine(en).map(([, v]) => v), guide.title.en, guide.summary.en, ...guide.steps.map((s) => s.en), ...(guide.tips ?? []).map((s) => s.en)];
    for (const words of english) expect(words).not.toMatch(/\b(rank(ed|ing)?|best|worst|weak|poor|bad|lazy|fail(s|ed|ing|ure)?)\b/i);
  });

  it('switched off: the route answers nothing and the page says it is off; on, the page is the module’s own screen', async () => {
    await owner(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'curriculum-gap'`, [A]);
    try {
      expect(await call(principal, maths5A)).toMatchObject({ status: 403, body: { code: 'module_off' } });
      expect(await call(tMaths, maths5A)).toMatchObject({ status: 403, body: { code: 'module_off' } });
      state.claims = claims(principal);
      expect((await CurriculumGapPage()).type).toBe(ModuleOffPage);
    } finally {
      await owner(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'curriculum-gap'`, [A]);
    }
    for (const who of [principal, tMaths]) {
      state.claims = claims(who);
      const page = await CurriculumGapPage();
      expect(page.type, who.role).toBe(ModulePage);
      expect(page.props, who.role).toMatchObject({ moduleId: 'curriculum-gap', help: 'find-curriculum-gaps', tour: 'curriculum-gap', title: 'Curriculum Gap Detector' });
    }
  });

  it('rules only: no language model, no sender and nothing stored in this slice', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));
    const mine = ['src/lib/curriculum-gap', 'src/app/api/app/curriculum-gap', 'src/components/curriculum-gap', 'src/app/(school)/app/curriculum-gap'].flatMap((d) => files(path.join(ROOT, d)));
    expect(mine.length).toBeGreaterThanOrEqual(5);
    for (const file of mine) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from '@\/lib\/(ai|copilot|parent-ai|whatsapp|jobs\/queue|pulse|communication)/);
      expect(source, file).not.toMatch(/\b(insert into|update \w+ set|delete from)\b/i);
    }
  });
});

describe('the migration', () => {
  const sql = () => {
    const dir = path.join(ROOT, 'supabase/migrations');
    return readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_p6_curriculum_gap.sql'))!), 'utf8');
  };

  it('adds no table and no policy, and ends by switching the module on for every school there is, keeping a school’s own choice', () => {
    const body = sql().replace(/^\s*--.*$/gm, '');
    expect(body).not.toMatch(/create table|alter table|create policy|drop /i);
    const last = sql().trimEnd();
    expect(last.slice(last.lastIndexOf('insert into school_module_entitlements'))).toBe(
      `insert into school_module_entitlements (school_id, module_id, enabled, source)\nselect s.school_id, 'curriculum-gap', true, 'plan' from schools s\non conflict (school_id, module_id) do nothing;`
    );
  });

  it('on a database with schools, switches it on for each, and leaves a school that had switched it off as it was', async () => {
    const before = `
      insert into schools (school_id, name, jurisdiction) values ('${u(901)}', 'Old School', 'IN-HR'), ('${u(902)}', 'Off School', 'IN-HR');
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${u(902)}', 'curriculum-gap', false, 'founder_override');`;
    const old = await startHarnessDb({ port: 0, before: { migration: '_p6_curriculum_gap.sql', sql: before } });
    try {
      const rows = (await old.pg.query(`select school_id, enabled, source from school_module_entitlements where module_id = 'curriculum-gap' order by school_id`)).rows;
      expect(rows).toEqual([{ school_id: u(901), enabled: true, source: 'plan' }, { school_id: u(902), enabled: false, source: 'founder_override' }]);
    } finally {
      await old.stop();
    }
  });
});
