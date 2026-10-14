import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { changeExam, examsScreen, makeExam } from '@/lib/exams/exams';
import { percent } from '@/lib/exams/grading';
import { paperEntry, saveMarks } from '@/lib/exams/marks';
import { ownRecognition } from '@/lib/exams/own-progress';
import { TO_ENTER_SQL } from '@/lib/exams/papers';
import { publishClass, reopenClass, reportCardsScreen, saveRemarks } from '@/lib/exams/publish';
import { reportCards, type ReportCardSet } from '@/lib/exams/report-card';
import { blocksText, reportCardBlocks } from '@/lib/exams/report-card-text';
import { classResult } from '@/lib/exams/results';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { computeRecognition } from '@/lib/recognition';

// Publish, report cards, Personal Best and Most Improved (docs/27 row 9c, C215). The acceptance test: "After
// publish, no mark of that class and exam can change (app and database) until the principal reopens it with a
// reason. Each child's PDF shows marks and grades by the kept scheme and its layout; with the feature, their own
// Personal Best and Most Improved, and without it neither line. No rank, position or comparison with another child
// appears anywhere: a test reads the source and the PDF text." Each sentence is proven on the whole schema as the
// app's own database role: through the app's code and its routes, and by going to the database directly. The PDF is
// drawn in the browser from the card's blocks of words (report-card-text.ts); the PDF text read here is those
// blocks. Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));

import { GET as getScreen, POST as postScreen } from '@/app/api/app/exams/[examId]/classes/[classId]/report-cards/route';
import { GET as getCards } from '@/app/api/app/exams/[examId]/classes/[classId]/report-cards/cards/route';
import { POST as postPaper } from '@/app/api/app/exams/papers/[paperId]/route';

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `9c000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, T_MATHS, T_CLASS, T_OTHER, ACCOUNTANT, B_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(21), u(91)];
const [C5A, C5B, CB] = [u(31), u(32), u(34)];
const [MATHS, ENGLISH, SCIENCE] = [u(41), u(42), u(44)];
const SESSION = u(51);
const [K1, K2, K3, B1] = [u(71), u(72), u(73), u(81)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 5-A; not a class teacher
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    for (const [k, v] of [['app.current_tenant_id', '00000000-0000-0000-0000-000000000000'], ['app.current_role', 'super_admin'], ['app.current_user_id', FOUNDER]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { rows: any[]; rowCount: number };
const run = (who: Who, sql: string, params: unknown[] = []) => as<Result>(who, (c) => c.query(sql, params));
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

// The school's scheme (made up): Theory 80 and Internal 20 of a subject; four bands; every part of the card shown.
const LAYOUT = { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false };
const scheme = (bands: { from: number; to: number; grade: string }[], layout = LAYOUT) => ({
  bands: bands.map((b) => ({ ...b, meaning: null })),
  decimals: 0,
  passMark: 33,
  components: [
    { key: 'theory', kind: 'theory', name: 'Theory', share: 80, passMark: null, parts: [] },
    { key: 'internal', kind: 'internal', name: 'Internal', share: 20, passMark: null, parts: [] },
  ],
  terms: [{ name: 'Term 1' }, { name: 'Term 2' }],
  layout,
  coScholastic: null,
});
const V1 = scheme([{ from: 75, to: 100, grade: 'A' }, { from: 50, to: 74, grade: 'B' }, { from: 33, to: 49, grade: 'C' }, { from: 0, to: 32, grade: 'D' }]);
// Version 2: other bands, and a card without the components' columns or attendance.
const V2 = scheme([{ from: 85, to: 100, grade: 'A' }, { from: 60, to: 84, grade: 'B' }, { from: 33, to: 59, grade: 'C' }, { from: 0, to: 32, grade: 'D' }], { ...LAYOUT, components: false, attendance: false });

const score = (studentId: string, component: string, value: number) => ({ studentId, component, kind: 'score', score: value });
const mark = (studentId: string, component: string, kind: 'absent' | 'exempt' | 'clear') => ({ studentId, component, kind, score: null });
const E1 = { id: '', m5a: '', e5a: '', m5b: '' };
const E2 = { id: '', m5a: '', e5a: '' };
const paperOf = async (examId: string, cls: string, subj: string) => (await owner(`select paper_id from exam_papers where exam_id = $1 and class_id = $2 and subject_id = $3`, [examId, cls, subj]))[0].paper_id as string;
const cardsOf = async (who: Who, examId: string, studentId: string | null = null): Promise<ReportCardSet> => {
  const r = await as(who, (c) => reportCards(c, actor(who), examId, C5A, studentId));
  if (!r.ok) throw new Error(`no cards: ${r.reason}`);
  return r.set;
};
const textOf = (set: ReportCardSet, studentId: string, lang: 'en' | 'hi' = 'en') => blocksText(reportCardBlocks(set, set.cards.find((c) => c.studentId === studentId)!, lang));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board) values ('${A}', 'School A', 'IN-HR', 'CBSE'), ('${B}', 'School B', 'IN-DL', 'CBSE');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
      ('${T_MATHS}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Maths', true), ('${T_CLASS}', '${A}', 'kiran@school-a.example', 'teacher', 'Kiran Classteacher', true),
      ('${T_OTHER}', '${A}', 'omar@school-a.example', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true), ('${FOUNDER}', null, 'founder@platform.example', 'super_admin', 'Farid Founder', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5A}', '${A}', '5', '5', 'A', '${T_CLASS}'), ('${C5B}', '${A}', '5', '5', 'B', null), ('${CB}', '${B}', '5', '5', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English'), ('${SCIENCE}', '${A}', 'Science');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C5A}'::uuid), ('${T_OTHER}', '${MATHS}', '${C5B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K2}', '${A}', 'A-02', 'Zoya Madeup', '${C5A}', '2', 'active'), ('${K3}', '${A}', 'A-03', 'Dev Madeup', '${C5A}', '3', 'active'),
      ('${K1}', '${A}', 'A-01', 'Meera Madeup', '${C5A}', '1', 'active'), ('${B1}', '${A}', 'B-01', 'Kabir Madeup', '${C5B}', '1', 'active');
    insert into attendance (school_id, student_id, class_id, date, status) values
      ('${A}', '${K1}', '${C5A}', '2026-08-03', 'present'), ('${A}', '${K1}', '${C5A}', '2026-08-04', 'late'), ('${A}', '${K1}', '${C5A}', '2026-08-05', 'absent'),
      ('${A}', '${K1}', '${C5A}', '2026-08-06', 'present'), ('${A}', '${K1}', '${C5A}', '2026-03-20', 'present');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
    insert into school_subscriptions (school_id, plan_id) values ('${A}', 'compass');
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(V1), PRINCIPAL]);
  // Unit test 1: 5-A Mathematics (Theory 40, Internal 10) and English (Theory 50); 5-B Mathematics.
  const made = await as(principal, (c) =>
    makeExam(c, actor(principal), {
      name: 'Unit test 1',
      sessionId: SESSION,
      term: 'Term 1',
      papers: [
        { classId: C5A, subjectId: MATHS, date: '2026-07-10', unitIds: [], maxima: { theory: 40, internal: 10 } },
        { classId: C5A, subjectId: ENGLISH, date: '2026-07-11', unitIds: [], maxima: { theory: 50 } },
        { classId: C5B, subjectId: MATHS, date: '2026-07-10', unitIds: [], maxima: { theory: 40, internal: 10 } },
      ],
    })
  );
  E1.id = (made as { examId: string }).examId;
  [E1.m5a, E1.e5a, E1.m5b] = [await paperOf(E1.id, C5A, MATHS), await paperOf(E1.id, C5A, ENGLISH), await paperOf(E1.id, C5B, MATHS)];
  // Meera: Mathematics 20 and 5 (50 percent), English 30 of 50 (60). Zoya: 30 and 8 (76), English 20 (40). Dev was
  // absent throughout. English waits for Dev for now.
  await as(tMaths, (c) => saveMarks(c, actor(tMaths), E1.m5a, [score(K1, 'theory', 20), score(K1, 'internal', 5), score(K2, 'theory', 30), score(K2, 'internal', 8), mark(K3, 'theory', 'absent'), mark(K3, 'internal', 'absent')]));
  await as(tClass, (c) => saveMarks(c, actor(tClass), E1.e5a, [score(K1, 'theory', 30), score(K2, 'theory', 20)]));
}, 120_000);
afterAll(async () => db?.stop());

describe('publishing an exam for a class', () => {
  it('the office publishes only when every paper of the class is entered; a teacher, the accountant and another school cannot', async () => {
    expect(await as(coordinator, (c) => publishClass(c, actor(coordinator), E1.id, C5A))).toEqual({ ok: false, reason: 'not_entered' });
    await expect(run(principal, `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ($1, $2, $3, 1, 1, '{}', $4)`, [A, E1.id, C5A, PRINCIPAL])).rejects.toThrow(/only when every paper of it is entered/);
    await as(tClass, (c) => saveMarks(c, actor(tClass), E1.e5a, [mark(K3, 'theory', 'absent')]));
    for (const who of [tClass, tMaths, accountant]) {
      expect(await as(who, (c) => publishClass(c, actor(who), E1.id, C5A)), who.user).toEqual({ ok: false, reason: 'not_allowed' });
      // The accountant reads no paper, so for them the class has none to publish; a teacher is refused by the policy.
      await expect(run(who, `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ($1, $2, $3, 1, 1, '{}', $4)`, [A, E1.id, C5A, who.user]), who.user).rejects.toThrow(who === accountant ? /a class it has papers for/ : /row-level security/);
    }
    expect(await as(bPrincipal, (c) => publishClass(c, actor(bPrincipal), E1.id, C5A))).toEqual({ ok: false, reason: 'not_found' });
    // Published in one's own name only.
    await expect(run(admin, `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ($1, $2, $3, 1, 1, '{}', $4)`, [A, E1.id, C5A, PRINCIPAL])).rejects.toThrow(/row-level security/);
  });

  it('the coordinator publishes: version 1, with the scheme in force kept as it is, each child’s own progress kept, and audited', async () => {
    expect(await as(coordinator, (c) => publishClass(c, actor(coordinator), E1.id, C5A))).toEqual({ ok: true, version: 1 });
    const [row] = await owner(`select version, scheme_version, scheme, recognition, published_by, reopened_at from exam_publications where exam_id = $1 and class_id = $2`, [E1.id, C5A]);
    expect(row).toMatchObject({ version: 1, scheme_version: 1, published_by: COORDINATOR, reopened_at: null });
    expect(row.scheme).toEqual(V1);
    // A first published exam for every child.
    expect(row.recognition).toEqual({ [K1]: { first: true }, [K2]: { first: true }, [K3]: { first: true } });
    const audit = await owner(`select actor_user_id, after_state from audit_log where event_action = 'exam.published'`);
    expect(audit).toEqual([{ actor_user_id: COORDINATOR, after_state: { exam_id: E1.id, class_id: C5A, version: 1, scheme_version: 1, papers: 2 } }]);
    // Once in force, not twice.
    expect(await as(principal, (c) => publishClass(c, actor(principal), E1.id, C5A))).toEqual({ ok: false, reason: 'published' });
    await expect(run(principal, `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ($1, $2, $3, 2, 1, '{}', $4)`, [A, E1.id, C5A, PRINCIPAL])).rejects.toThrow(/already published/);
  });
});

describe('“After publish, no mark of that class and exam can change (app and database) until the principal reopens it with a reason.”', () => {
  it('the app: marks entry is closed for the class, its papers wait for nobody, and no paper of it is added, changed or removed', async () => {
    for (const who of [tMaths, principal]) expect(await as(who, (c) => saveMarks(c, actor(who), E1.m5a, [score(K1, 'theory', 21)])), who.user).toEqual({ ok: false, reason: 'closed' });
    const entry = (await as(tMaths, (c) => paperEntry(c, actor(tMaths), E1.m5a)))!;
    expect(entry).toMatchObject({ mayEnter: false, exam: { status: 'published' } });
    const screen = (await as(principal, (c) => examsScreen(c, actor(principal), null)))!;
    const papers = screen.exams.find((e) => e.examId === E1.id)!.papers;
    expect(papers.map((p) => [p.classId, p.published, p.mayEnter]).sort()).toEqual([[C5A, true, false], [C5A, true, false], [C5B, false, true]].sort());
    // A published class's paper waits for nobody's marks, even with a child on the roll still without one.
    await owner(`insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values ($1, $2, 'A-09', 'Late Joiner', $3, '9', 'active')`, [u(79), A, C5A]);
    expect((await run(tMaths, TO_ENTER_SQL, [A])).rows.map((r) => r.paper_id)).not.toContain(E1.m5a);
    await owner(`delete from students where student_id = $1`, [u(79)]);
    expect(await as(principal, (c) => changeExam(c, actor(principal), E1.id, { action: 'add_paper', paper: { classId: C5A, subjectId: SCIENCE, date: null, unitIds: [], maxima: { theory: 20 } } }))).toEqual({ ok: false, reason: 'published' });
    expect(await as(principal, (c) => changeExam(c, actor(principal), E1.id, { action: 'paper', paperId: E1.m5a, date: '2026-07-12', unitIds: [] }))).toEqual({ ok: false, reason: 'published' });
    expect(await as(principal, (c) => changeExam(c, actor(principal), E1.id, { action: 'remove_paper', paperId: E1.m5a }))).toEqual({ ok: false, reason: 'published' });
    // The route says so.
    expect(await call(claims(tMaths), () => postPaper(req('POST', `/api/app/exams/papers/${E1.m5a}`, { marks: [score(K1, 'theory', 21)] }), { params: { paperId: E1.m5a } }))).toMatchObject({ status: 409, body: { code: 'closed' } });
  });

  it('the database: no mark or paper of the class changes, whoever writes, the table’s owner too', async () => {
    const frozen = /the (marks|papers) of a published class are frozen/;
    await expect(run(principal, `update marks set score = 21 where paper_id = $1 and student_id = $2 and component = 'theory'`, [E1.m5a, K1])).rejects.toThrow(frozen);
    await expect(run(tMaths, `update marks set score = 21 where paper_id = $1 and student_id = $2 and component = 'theory'`, [E1.m5a, K1])).rejects.toThrow(frozen);
    await expect(run(principal, `delete from marks where paper_id = $1 and student_id = $2`, [E1.m5a, K3])).rejects.toThrow(frozen);
    await expect(run(tClass, `update marks set kind = 'score', score = 10 where paper_id = $1 and student_id = $2`, [E1.e5a, K3])).rejects.toThrow(frozen);
    await expect(owner(`update marks set score = 21 where paper_id = $1 and student_id = $2 and component = 'theory'`, [E1.m5a, K1])).rejects.toThrow(frozen);
    await expect(run(principal, `update exam_papers set paper_date = '2026-07-12' where paper_id = $1`, [E1.m5a])).rejects.toThrow(frozen);
    await expect(run(principal, `insert into exam_papers (school_id, exam_id, class_id, subject_id, components, created_by) values ($1, $2, $3, $4, '[{"key": "theory", "name": "Theory", "max": 20, "share": 80}]', $5)`, [A, E1.id, C5A, SCIENCE, PRINCIPAL])).rejects.toThrow(frozen);
    expect(await owner(`select score::text from marks where paper_id = $1 and student_id = $2 and component = 'theory'`, [E1.m5a, K1])).toEqual([{ score: '20' }]);
  });

  it('only that class: 5-B of the same exam still takes marks; the database fills in the scheme kept, whatever is sent', async () => {
    expect(await as(tOther, (c) => saveMarks(c, actor(tOther), E1.m5b, [score(B1, 'theory', 10), score(B1, 'internal', 2)]))).toMatchObject({ ok: true, complete: true });
    const [made] = (await run(principal, `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ($1, $2, $3, 7, 1, '{"forged": true}', $4) returning version, scheme_version, scheme`, [A, E1.id, C5B, PRINCIPAL])).rows;
    expect(made).toEqual({ version: 1, scheme_version: 1, scheme: V1 });
  });

  it('only the principal reopens, with a reason; the reopening is audited; the marks then change; publishing again makes version 2', async () => {
    const reason = '  Meera’s Mathematics theory was entered as 20; her paper says 21.  ';
    for (const who of [admin, coordinator, tClass]) expect(await as(who, (c) => reopenClass(c, actor(who), E1.id, C5A, reason)), who.user).toEqual({ ok: false, reason: 'not_allowed' });
    // Directly: the school admin's update touches no row; the principal's needs a reason, in their own name.
    expect((await run(admin, `update exam_publications set reopened_by = $2, reopen_reason = 'a good reason' where exam_id = $1 and class_id = '${C5A}'`, [E1.id, ADMIN])).rowCount).toBe(0);
    await expect(run(principal, `update exam_publications set reopened_by = $2 where exam_id = $1 and class_id = '${C5A}'`, [E1.id, PRINCIPAL])).rejects.toThrow(/with a reason/);
    await expect(run(principal, `update exam_publications set reopened_by = $2, reopen_reason = 'a good reason' where exam_id = $1 and class_id = '${C5A}'`, [E1.id, ADMIN])).rejects.toThrow(/row-level security/);
    await expect(run(principal, `update exam_publications set scheme = '{}' where exam_id = $1 and class_id = '${C5A}'`, [E1.id])).rejects.toThrow(/what was published never changes/);
    expect(await as(principal, (c) => reopenClass(c, actor(principal), E1.id, C5A, 'oops'))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(principal, (c) => reopenClass(c, actor(principal), E1.id, C5A, reason))).toEqual({ ok: true, version: 1 });
    const [row] = await owner(`select reopened_by, reopen_reason, reopened_at from exam_publications where exam_id = $1 and class_id = $2 and version = 1`, [E1.id, C5A]);
    expect(row).toMatchObject({ reopened_by: PRINCIPAL, reopen_reason: reason.trim() });
    expect(row.reopened_at).not.toBeNull();
    expect(await owner(`select actor_user_id, after_state from audit_log where event_action = 'exam.reopened'`)).toEqual([
      { actor_user_id: PRINCIPAL, after_state: { exam_id: E1.id, class_id: C5A, version: 1, reasoned: true } }, // the words are on the publication (C224)
    ]);
    // Reopened: the mark is corrected (Mathematics 21 and 5: 52 percent).
    expect(await as(tMaths, (c) => saveMarks(c, actor(tMaths), E1.m5a, [score(K1, 'theory', 21)]))).toMatchObject({ ok: true, saved: 1 });
    expect(await as(principal, (c) => reopenClass(c, actor(principal), E1.id, C5A, reason))).toEqual({ ok: false, reason: 'not_published' });
    // A reopened publication never changes, and none is removed.
    await expect(run(principal, `update exam_publications set reopen_reason = 'another reason' where exam_id = $1 and class_id = '${C5A}' and version = 1`, [E1.id])).rejects.toThrow(/reopened publication does not change/);
    await expect(run(principal, `delete from exam_publications where exam_id = $1`, [E1.id])).rejects.toThrow(/permission denied/);
    // Published again: version 2, frozen again.
    expect(await as(admin, (c) => publishClass(c, actor(admin), E1.id, C5A))).toEqual({ ok: true, version: 2 });
    await expect(run(principal, `update marks set score = 22 where paper_id = $1 and student_id = $2 and component = 'theory'`, [E1.m5a, K1])).rejects.toThrow(/frozen/);
    const screen = (await as(tMaths, (c) => reportCardsScreen(c, actor(tMaths), E1.id, C5A)))!;
    expect(screen.history.map((h) => [h.version, h.publishedBy, h.reopenedBy, h.reason])).toEqual([[2, 'Asif Admin', null, null], [1, 'Chitra Coordinator', 'Priya Principal', reason.trim()]]);
    expect(screen).toMatchObject({ inForce: { version: 2 }, mayPublish: false, mayReopen: false, mayDownload: false, mayWriteRemarks: false });
  });
});

describe('“Each child’s PDF shows marks and grades by the kept scheme and its layout”', () => {
  it('the office and the class teacher download, only while the result is published; a subject teacher, the accountant and another school do not', async () => {
    expect((await cardsOf(tClass, E1.id)).cards.map((c) => c.rollNo)).toEqual(['1', '2', '3']);
    expect((await cardsOf(coordinator, E1.id, K2)).cards.map((c) => c.studentId)).toEqual([K2]);
    expect(await as(tMaths, (c) => reportCards(c, actor(tMaths), E1.id, C5A, null))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(accountant, (c) => reportCards(c, actor(accountant), E1.id, C5A, null))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(bPrincipal, (c) => reportCards(c, actor(bPrincipal), E1.id, C5A, null))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(principal, (c) => reportCards(c, actor(principal), E1.id, C5A, B1))).toEqual({ ok: false, reason: 'not_found' }); // not of 5-A
    expect(await call(claims(tMaths), () => getCards(req('GET', `/api/app/exams/${E1.id}/classes/${C5A}/report-cards/cards`), { params: { examId: E1.id, classId: C5A } }))).toMatchObject({ status: 403 });
    expect(await call(claims(accountant), () => getCards(req('GET', `/api/app/exams/${E1.id}/classes/${C5A}/report-cards/cards`), { params: { examId: E1.id, classId: C5A } }))).toMatchObject({ status: 403 });
    const ok = await call(claims(tClass), () => getCards(req('GET', `/api/app/exams/${E1.id}/classes/${C5A}/report-cards/cards?student=${K1}`), { params: { examId: E1.id, classId: C5A } }));
    expect(ok.status).toBe(200);
    expect(ok.body.cards.map((c: { studentId: string }) => c.studentId)).toEqual([K1]);
  });

  it('marks, total, percent and grade by the scheme kept at publishing, laid out as it says, with attendance and the remark; a later scheme changes nothing', async () => {
    // The principal saves version 2 (other bands, no components' columns, no attendance) after Unit test 1 was published.
    await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 2, $2::jsonb, $3)`, [A, JSON.stringify(V2), PRINCIPAL]);
    const set = await cardsOf(principal, E1.id);
    expect(set.publication).toMatchObject({ version: 2, schemeVersion: 1, publishedBy: 'Asif Admin' });
    expect(set.layout).toEqual(LAYOUT);
    const zoya = set.cards.find((c) => c.studentId === K2)!;
    // Zoya, Mathematics: Theory 30 of 40, Internal 8 of 10, weighed 80 and 20: 76 percent, an A by version 1 (a B by version 2).
    const maths = zoya.subjects.find((s) => s.subjectId === MATHS)!;
    expect(maths.result).toMatchObject({ percent: percent([{ score: 30, max: 40, share: 80 }, { score: 8, max: 10, share: 20 }]), rounded: 76, grade: { kind: 'grade', grade: 'A' } });
    expect(maths.total).toEqual({ score: 38, max: 50 });
    const text = textOf(set, K2);
    expect(text).toContain('Subject | Theory | Internal | Total | Percent | Grade');
    expect(text).toContain('Mathematics | 30 of 40 | 8 of 10 | 38 of 50 | 76% | A');
    expect(text).toContain('English | 20 of 50 | Not in this paper | 20 of 50 | 40% | C');
    expect(text).toContain('Grades by the school’s grading scheme, version 1, kept with this publication.');
    expect(text).toContain('Publication 2 of this result');
    // The class result agrees: graded by the kept version 1.
    const result = (await as(principal, (c) => classResult(c, actor(principal), E1.id, C5A)))!;
    expect(result).toMatchObject({ scheme: { version: 1 }, publication: { version: 2 } });
    // Dev was absent: absent is not a mark, so no percent, never zero.
    expect(textOf(set, K3)).toContain('Mathematics | Absent | Absent | No total | No percent | no marks');
    // Meera: attendance for the session up to publishing (present, late, absent, present: 3 of 4; a day before the session is not counted).
    expect(textOf(set, K1)).toContain('Attendance this session: present on 3 of the 4 days marked');
    expect(textOf(set, K1)).toContain('No remark was written.');
  });

  it('the next exam is published by the scheme then in force, version 2: its own bands, no components’ columns and no attendance', async () => {
    const made = await as(principal, (c) =>
      makeExam(c, actor(principal), {
        name: 'Half-yearly',
        sessionId: SESSION,
        term: 'Term 2',
        papers: [
          { classId: C5A, subjectId: MATHS, date: '2026-09-20', unitIds: [], maxima: { theory: 40, internal: 10 } },
          { classId: C5A, subjectId: ENGLISH, date: '2026-09-21', unitIds: [], maxima: { theory: 50 } },
        ],
      })
    );
    E2.id = (made as { examId: string }).examId;
    [E2.m5a, E2.e5a] = [await paperOf(E2.id, C5A, MATHS), await paperOf(E2.id, C5A, ENGLISH)];
    // Meera: Mathematics 32 and 8 (80), English 31 (62). Zoya: 28 and 7 (70), English 22 (44). Dev: 20 and 5 (50), English 25 (50).
    await as(tMaths, (c) => saveMarks(c, actor(tMaths), E2.m5a, [score(K1, 'theory', 32), score(K1, 'internal', 8), score(K2, 'theory', 28), score(K2, 'internal', 7), score(K3, 'theory', 20), score(K3, 'internal', 5)]));
    await as(tClass, (c) => saveMarks(c, actor(tClass), E2.e5a, [score(K1, 'theory', 31), score(K2, 'theory', 22), score(K3, 'theory', 25)]));
    expect(await as(principal, (c) => reportCards(c, actor(principal), E2.id, C5A, null))).toEqual({ ok: false, reason: 'not_published' });
  });

  it('publishing and writing a class’s marks take turns: a writer holds the exam and class’s lock shared, the publisher exclusive', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locks = async (c: any) => (await c.query(`select mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted order by mode`)).rows.map((r: { mode: string }) => r.mode);
    expect(await as(tMaths, async (c) => (await saveMarks(c, actor(tMaths), E2.m5a, [score(K1, 'theory', 32)]), await locks(c)))).toEqual(['ShareLock']);
    expect(await as(principal, async (c) => (await publishClass(c, actor(principal), E1.id, C5A), await locks(c)))).toEqual(['ExclusiveLock']);
  });
});

describe('the class teacher’s remarks', () => {
  it('only the class teacher writes a remark, while the result is not published; audited without its words', async () => {
    expect(await as(tClass, (c) => saveRemarks(c, actor(tClass), E2.id, C5A, [{ studentId: K1, remark: '  Meera reads with care and asks good questions. ' }, { studentId: K2, remark: 'Zoya helps others with sums.' }]))).toEqual({ ok: true, saved: 2, cleared: 0 });
    expect(await as(tClass, (c) => saveRemarks(c, actor(tClass), E2.id, C5A, [{ studentId: K2, remark: '' }]))).toEqual({ ok: true, saved: 0, cleared: 1 });
    for (const who of [tMaths, principal, coordinator]) expect(await as(who, (c) => saveRemarks(c, actor(who), E2.id, C5A, [{ studentId: K3, remark: 'Kind.' }])), who.user).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(tClass, (c) => saveRemarks(c, actor(tClass), E2.id, C5A, [{ studentId: B1, remark: 'Not mine.' }]))).toEqual({ ok: false, reason: 'child', at: 0 });
    expect(await as(tClass, (c) => saveRemarks(c, actor(tClass), E2.id, C5A, [{ studentId: K3, remark: 'x'.repeat(501) }]))).toEqual({ ok: false, reason: 'remark', at: 0 });
    for (const who of [tMaths, principal]) {
      await expect(run(who, `insert into report_remarks (school_id, exam_id, class_id, student_id, remark, written_by) values ($1, $2, $3, $4, 'Kind.', $5)`, [A, E2.id, C5A, K3, who.user]), who.user).rejects.toThrow(/row-level security/);
    }
    await expect(run(tClass, `insert into report_remarks (school_id, exam_id, class_id, student_id, remark, written_by) values ($1, $2, $3, $4, 'Kind.', $5)`, [A, E2.id, C5A, K3, PRINCIPAL])).rejects.toThrow(/row-level security/);
    expect(await owner(`select student_id, remark, written_by from report_remarks`)).toEqual([{ student_id: K1, remark: 'Meera reads with care and asks good questions.', written_by: T_CLASS }]);
    const audit = await owner(`select actor_user_id, after_state from audit_log where event_action = 'exam.remarks_saved' order by audit_id`);
    expect(audit.map((a: { after_state: Record<string, unknown> }) => Object.keys(a.after_state).sort())).toEqual([['class_id', 'cleared', 'exam_id', 'saved'], ['class_id', 'cleared', 'exam_id', 'saved']]);
    expect(JSON.stringify(audit)).not.toContain('reads with care');
  });
});

describe('“with the feature, their own Personal Best and Most Improved, and without it neither line”', () => {
  it('publishing Half-yearly keeps each child’s own progress: Meera beat her own best in Mathematics; Zoya improved in English; Dev’s first', async () => {
    expect(await as(principal, (c) => publishClass(c, actor(principal), E2.id, C5A))).toEqual({ ok: true, version: 1 });
    const [row] = await owner(`select scheme_version, recognition from exam_publications where exam_id = $1 and class_id = $2`, [E2.id, C5A]);
    expect(row.scheme_version).toBe(2);
    expect(row.recognition).toEqual({
      // Mathematics 80 against her own best of 52 (a Personal Best); English 62 against 60 is under the floor.
      // Most Improved: Mathematics, 52 to 80, the larger logitDelta of her own two subjects.
      [K1]: { first: false, personalBest: [{ subjectId: MATHS, now: 80, best: 52 }], mostImproved: { subjectId: MATHS, now: 80, before: 52, examId: E1.id } },
      // Mathematics fell (76 to 70); English 40 to 44 is under the floor, yet her one subject that improved.
      [K2]: { first: false, personalBest: [], mostImproved: { subjectId: ENGLISH, now: 44, before: 40, examId: E1.id } },
      // Absent throughout Unit test 1: no earlier percent of his own, so this is his first.
      [K3]: { first: true },
    });
    // Remarks are frozen with the marks.
    expect(await as(tClass, (c) => saveRemarks(c, actor(tClass), E2.id, C5A, [{ studentId: K3, remark: 'Kind.' }]))).toEqual({ ok: false, reason: 'published' });
    await expect(run(tClass, `update report_remarks set remark = 'Changed.' where exam_id = $1`, [E2.id])).rejects.toThrow(/remarks of a published class are frozen/);
  });

  it('on each card, laid out by version 2: their own lines, and the first exam says so', async () => {
    const set = await cardsOf(tClass, E2.id);
    expect(set).toMatchObject({ recognitionOn: true, publication: { schemeVersion: 2 }, layout: V2.layout });
    const meera = textOf(set, K1);
    expect(meera).toContain('Subject | Total | Percent | Grade');
    expect(meera).not.toContain('Theory');
    expect(meera).toContain('Mathematics | 40 of 50 | 80% | B'); // 80 is a B by version 2
    expect(meera).not.toContain('Attendance');
    expect(meera).toContain('Meera reads with care and asks good questions.');
    expect(meera).toContain('Personal Best: Mathematics, 80%, above their own earlier best of 52%.');
    expect(meera).toContain('Most Improved: Mathematics, from 52% in Unit test 1 to 80%.');
    expect(meera).toContain('These compare Meera Madeup only with their own earlier published exams.');
    const zoya = textOf(set, K2);
    expect(zoya).not.toContain('Personal Best');
    expect(zoya).toContain('Most Improved: English, from 40% in Unit test 1 to 44%.');
    const dev = textOf(set, K3);
    expect(dev).toContain('This is Dev Madeup’s first published exam');
    expect(dev).not.toMatch(/Personal Best:|Most Improved:/);
    // In Hindi too.
    expect(textOf(set, K1, 'hi')).toContain('पर्सनल बेस्ट: Mathematics, 80%');
    expect(textOf(set, K3, 'hi')).toContain('यह Dev Madeup की पहली प्रकाशित परीक्षा है');
    // Unit test 1 was everyone's first.
    const first = await cardsOf(principal, E1.id);
    for (const c of first.cards) expect(textOf(first, c.studentId)).toContain(`This is ${c.name}’s first published exam`);
  });

  it('without the feature on the school’s plan, neither line, nor the first-exam line; the plan is read when the card is drawn', async () => {
    await owner(`update school_subscriptions set plan_id = 'growth' where school_id = $1`, [A]);
    try {
      for (const examId of [E1.id, E2.id]) {
        const set = await cardsOf(principal, examId);
        expect(set.recognitionOn).toBe(false);
        for (const c of set.cards) {
          expect(c.recognition).toBeNull();
          for (const lang of ['en', 'hi'] as const) expect(textOf(set, c.studentId, lang)).not.toMatch(/Personal Best|Most Improved|first published exam|पर्सनल बेस्ट|मोस्ट इम्प्रूव्ड|पहली प्रकाशित/);
        }
      }
      expect((await as(principal, (c) => reportCardsScreen(c, actor(principal), E2.id, C5A)))!.recognitionOn).toBe(false);
    } finally {
      await owner(`update school_subscriptions set plan_id = 'compass' where school_id = $1`, [A]);
    }
  });

  it('each child is compared only with themselves: another child’s marks change nothing of theirs', async () => {
    const before = (await owner(`select recognition from exam_publications where exam_id = $1 and class_id = $2 and reopened_at is null`, [E2.id, C5A]))[0].recognition;
    // Zoya's Mathematics in Unit test 1 is reopened and corrected far above everyone's; then Half-yearly is republished.
    await as(principal, (c) => reopenClass(c, actor(principal), E1.id, C5A, 'Zoya’s Mathematics was entered wrongly.'));
    await as(tMaths, (c) => saveMarks(c, actor(tMaths), E1.m5a, [score(K2, 'theory', 40), score(K2, 'internal', 10)]));
    await as(principal, (c) => publishClass(c, actor(principal), E1.id, C5A));
    await as(principal, (c) => reopenClass(c, actor(principal), E2.id, C5A, 'Taking in the corrected Unit test 1.'));
    await as(principal, (c) => publishClass(c, actor(principal), E2.id, C5A));
    const after = (await owner(`select recognition from exam_publications where exam_id = $1 and class_id = $2 and reopened_at is null`, [E2.id, C5A]))[0].recognition;
    expect(after[K1]).toEqual(before[K1]);
    expect(after[K3]).toEqual(before[K3]);
    // Zoya's own Most Improved now rests on her own corrected marks only: Mathematics fell from 100 to 70.
    expect(after[K2]).toEqual({ first: false, personalBest: [], mostImproved: { subjectId: ENGLISH, now: 44, before: 40, examId: E1.id } });
    // The rule is a function of one child's own percents and nothing else.
    expect(ownRecognition([{ subjectId: 'm', percent: 80 }, { subjectId: 'e', percent: 62 }], [{ examId: 'x', subjects: [{ subjectId: 'm', percent: 52 }, { subjectId: 'e', percent: 60 }] }])).toEqual({
      first: false,
      personalBest: [{ subjectId: 'm', now: 80, best: 52 }],
      mostImproved: { subjectId: 'm', now: 80, before: 52, examId: 'x' },
    });
  });

  it('Personal Best’s noise floor is the constitution’s, decided by recognition.ts, never copied', () => {
    for (const now of [60, 62, 64, 64.9, 65, 66, 90]) {
      const own = ownRecognition([{ subjectId: 's', percent: now }], [{ examId: 'x', subjects: [{ subjectId: 's', percent: 60 }] }]);
      const engine = computeRecognition({ fortnightId: 'f', current: [{ studentId: 's', classId: 'c', score: now, attendanceInWindow: 1, assessmentCount: 2 }], baseline: [{ studentId: 's', classId: 'c', score: 60, attendanceInWindow: 1, assessmentCount: 2 }] });
      expect(own.first === false && own.personalBest.length > 0, String(now)).toBe(engine.some((e) => e.type === 'personal_best'));
    }
    // Against their own best of several earlier exams, not the last one.
    const best = ownRecognition([{ subjectId: 's', percent: 70 }], [{ examId: 'a', subjects: [{ subjectId: 's', percent: 68 }] }, { examId: 'b', subjects: [{ subjectId: 's', percent: 50 }] }]);
    expect(best).toEqual({ first: false, personalBest: [], mostImproved: { subjectId: 's', now: 70, before: 50, examId: 'b' } });
    expect(ownRecognition([{ subjectId: 's', percent: 70 }], [])).toEqual({ first: true });
    expect(ownRecognition([{ subjectId: 's', percent: 70 }], [{ examId: 'a', subjects: [{ subjectId: 's', percent: null }] }])).toEqual({ first: true });
  });
});

// The words that rank children, in English and Hindi.
const RANK_WORDS = /\b(rank\w*|position\w*|topper\w*|merit\w*|percentile\w*|leaderboard\w*|1st|2nd|3rd)\b|रैंक|स्थान|टॉपर|मेरिट|प्रतिशतक/i;

describe('“No rank, position or comparison with another child appears anywhere: a test reads the source and the PDF text.”', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
  // Code and its words, without comments (a comment may say that children are never ranked).
  const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const SOURCE = [...files(path.join(ROOT, 'src/lib/exams')), ...files(path.join(ROOT, 'src/components/exams'))];

  it('the source of src/lib/exams and src/components/exams names none of those words', () => {
    expect(SOURCE.length).toBeGreaterThan(10);
    const found: string[] = [];
    for (const p of SOURCE) {
      code(p).split('\n').forEach((line, i) => {
        // A chapter's place in the syllabus map is the map's own order, not a child's.
        if (/position/.test(line) && /syllabus_units|\bu\.position\b|\b[ab]\.position\b|topic: string; position: number/.test(line)) return;
        if (RANK_WORDS.test(line)) found.push(`${path.relative(ROOT, p)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('nothing is ordered by marks: every sort and SQL order is by roll, name, date, version or the map', () => {
    const orderings: string[] = [];
    for (const p of SOURCE) {
      const text = code(p);
      for (const m of text.matchAll(/\.sort\(([^\n]*)/g)) orderings.push(m[1]);
      for (const m of text.matchAll(/order by ([^`]*)/gi)) orderings.push(m[1]);
    }
    expect(orderings.length).toBeGreaterThan(5);
    expect(orderings.filter((o) => /score|percent|mark|total|grade|delta|best|recognition/i.test(o))).toEqual([]);
    // Every list of children is in roll order.
    const children = SOURCE.flatMap((p) => [...code(p).matchAll(/from students s[^`]*order by ([^`]*)`/g)].map((m) => m[1].trim()));
    expect(children.length).toBeGreaterThan(2);
    expect(children.every((o) => o.startsWith('${ROLL_ORDER}'))).toBe(true);
  });

  it('the PDF text of every card, in English and Hindi, names none, and a child’s card names no other child; the class’s cards are in roll order', async () => {
    for (const examId of [E1.id, E2.id]) {
      const set = await cardsOf(principal, examId);
      expect(set.cards.map((c) => c.rollNo)).toEqual(['1', '2', '3']);
      for (const c of set.cards) {
        for (const lang of ['en', 'hi'] as const) {
          const text = textOf(set, c.studentId, lang);
          expect(text, `${c.name} ${lang}`).not.toMatch(RANK_WORDS);
          for (const other of set.cards.filter((o) => o.studentId !== c.studentId)) expect(text).not.toContain(other.name.split(' ')[0]);
        }
      }
    }
  });
});

describe('who reads what, directly in the database', () => {
  it('the accountant and another school read no publication or remark; a teacher of another class neither; the platform role holds no right', async () => {
    for (const t of ['exam_publications', 'report_remarks']) {
      expect((await run(accountant, `select count(*)::int as n from ${t}`)).rows[0].n, t).toBe(0);
      expect((await run(bPrincipal, `select count(*)::int as n from ${t}`)).rows[0].n, t).toBe(0);
      expect((await run(principal, `select count(*)::int as n from ${t}`)).rows[0].n, t).toBeGreaterThan(0);
      expect((await run(tClass, `select count(*)::int as n from ${t} where class_id = $1`, [C5A])).rows[0].n, t).toBeGreaterThan(0);
      expect((await run(tOther, `select count(*)::int as n from ${t} where class_id = $1`, [C5A])).rows[0].n, t).toBe(0);
      await expect(platform((c) => c.query(`select 1 from ${t} limit 1`)), t).rejects.toThrow(/permission denied/);
    }
    // The audit rows of publishing follow the exams: the office, or the person who acted.
    const actions = async (who: Who) => (await run(who, `select distinct event_action from audit_log where event_action in ('exam.published', 'exam.reopened', 'exam.remarks_saved') order by 1`)).rows.map((r) => r.event_action);
    expect(await actions(principal)).toEqual(['exam.published', 'exam.remarks_saved', 'exam.reopened']);
    expect(await actions(tClass)).toEqual(['exam.remarks_saved']);
    expect(await actions(tMaths)).toEqual([]);
  });
});

// The routes, as the app's own session calls them.
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) });
const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: any, fn: () => Promise<Response>) => {
  state.claims = who;
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn2: (x: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn2);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};

describe('the routes and the switch', () => {
  const at = (examId: string) => `/api/app/exams/${examId}/classes/${C5A}/report-cards`;
  const params = (examId: string) => ({ params: { examId, classId: C5A } });

  it('every route belongs to the Exams switch; switched off, nothing is read or written', async () => {
    for (const p of [at(u(1)), `${at(u(1))}/cards`]) {
      expect(writeModuleFor(p), p).toBe('exams');
      expect(readModuleFor(p), p).toBe('exams');
    }
    await owner(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'exams'`, [A]);
    try {
      expect(await call(claims(principal), () => getScreen(req('GET', at(E2.id)), params(E2.id)))).toMatchObject({ status: 403, body: { code: 'module_off' } });
      expect(await call(claims(principal), () => getCards(req('GET', `${at(E2.id)}/cards`), params(E2.id)))).toMatchObject({ status: 403, body: { code: 'module_off' } });
      expect(await call(claims(principal), () => postScreen(req('POST', at(E2.id), { action: 'reopen', reason: 'A good reason.' }), params(E2.id)))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    } finally {
      await owner(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'exams'`, [A]);
    }
  });

  it('the screen says what each person may do; publish, reopen and remarks answer as the rules say', async () => {
    const office = await call(claims(admin), () => getScreen(req('GET', at(E2.id)), params(E2.id)));
    expect(office).toMatchObject({ status: 200, body: { inForce: { version: 2 }, mayPublish: true, mayReopen: false, mayDownload: true, mayWriteRemarks: false, recognitionOn: true, classTeacher: 'Kiran Classteacher' } });
    expect(office.body.children.map((c: { rollNo: string }) => c.rollNo)).toEqual(['1', '2', '3']);
    expect((await call(claims(principal), () => getScreen(req('GET', at(E2.id)), params(E2.id)))).body).toMatchObject({ mayReopen: true });
    expect((await call(claims(tClass), () => getScreen(req('GET', at(E2.id)), params(E2.id)))).body).toMatchObject({ mayDownload: true, mayPublish: false });
    expect(await call(claims(accountant), () => getScreen(req('GET', at(E2.id)), params(E2.id)))).toMatchObject({ status: 403 });
    expect(await call(claims(tOther), () => getScreen(req('GET', at(E2.id)), params(E2.id)))).toMatchObject({ status: 404 });
    expect(await call(claims(tMaths), () => postScreen(req('POST', at(E2.id), { action: 'publish' }), params(E2.id)))).toMatchObject({ status: 403 });
    expect(await call(claims(admin), () => postScreen(req('POST', at(E2.id), { action: 'reopen', reason: 'A good reason.' }), params(E2.id)))).toMatchObject({ status: 403 });
    expect(await call(claims(principal), () => postScreen(req('POST', at(E2.id), { action: 'publish' }), params(E2.id)))).toMatchObject({ status: 409, body: { code: 'published' } });
    expect(await call(claims(principal), () => postScreen(req('POST', at(E2.id), { action: 'reopen', reason: 'no' }), params(E2.id)))).toMatchObject({ status: 400, body: { code: 'reason' } });
    expect(await call(claims(principal), () => postScreen(req('POST', at(E2.id), { action: 'something' }), params(E2.id)))).toMatchObject({ status: 400 });
    expect(await call(claims(principal), () => postScreen(req('POST', at(E2.id), { action: 'reopen', reason: 'One more correction.' }), params(E2.id)))).toMatchObject({ status: 200, body: { ok: true, version: 2 } });
    expect(await call(claims(tClass), () => postScreen(req('POST', at(E2.id), { action: 'remarks', remarks: [{ studentId: K3, remark: 'Dev is kind to everyone.' }] }), params(E2.id)))).toMatchObject({ status: 200, body: { ok: true, saved: 1 } });
    expect(await call(claims(principal), () => getCards(req('GET', `${at(E2.id)}/cards`), params(E2.id)))).toMatchObject({ status: 409, body: { code: 'not_published' } });
    expect(await call(claims(coordinator), () => postScreen(req('POST', at(E2.id), { action: 'publish' }), params(E2.id)))).toMatchObject({ status: 200, body: { ok: true, version: 3 } });
    const dev = await call(claims(tClass), () => getCards(req('GET', `${at(E2.id)}/cards?student=${K3}`), params(E2.id)));
    expect(dev.body.cards[0].remark).toBe('Dev is kind to everyone.');
  });
});
