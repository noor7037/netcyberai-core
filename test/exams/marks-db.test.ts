import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { changeExam, examsScreen, makeExam } from '@/lib/exams/exams';
import { grade, percent } from '@/lib/exams/grading';
import { paperEntry, saveMarks } from '@/lib/exams/marks';
import { classResult, type ClassResult } from '@/lib/exams/results';
import { moduleById } from '@/lib/contracts/modules';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';
import { TODAY_PROVIDERS } from '@/lib/today/cards';
import { indiaDate } from '@/lib/time/india';

// Exams and marks entry (docs/27 row 9b, C214). The acceptance test: "A teacher enters marks only for their own class
// and subject: the app and the database refuse another. A mark above a component's maximum or below zero is refused
// by both. Absent is not zero and is left out of the percent. The class result shows each child's percent and grade
// by the school's scheme, in roll order." Each sentence is proven on the whole schema as the app's own database role:
// through the app's code and its routes, and by going to the database directly. Every name and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));

import { GET as getExams, POST as postExams } from '@/app/api/app/exams/route';
import { POST as postExam } from '@/app/api/app/exams/[examId]/route';
import { GET as getResult } from '@/app/api/app/exams/[examId]/classes/[classId]/route';
import { GET as getPaper, POST as postPaper } from '@/app/api/app/exams/papers/[paperId]/route';

const ROOT = path.resolve(__dirname, '../..');
const u = (n: number) => `9b000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, ADMIN, COORDINATOR, T_MATHS, T_CLASS, T_OTHER, ACCOUNTANT, B_PRINCIPAL, FOUNDER] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(21), u(91)];
const [C5A, C5B, C6A, CB] = [u(31), u(32), u(33), u(34)];
const [MATHS, ENGLISH, B_MATHS] = [u(41), u(42), u(43)];
const [SESSION, B_SESSION] = [u(51), u(52)];
const [UNIT_1, UNIT_2, UNIT_5B] = [u(61), u(62), u(63)];
// 5-A, entered in an order that is neither roll order nor alphabetical: roll 10, 2, 1, 3, and a child whose consent is
// waiting (roll 4). 5-B: two children. A child who left 5-A is not on its roll.
const [K10, K2, K1, K3, K4, B1, B2, LEFT, BK] = [u(70), u(72), u(71), u(73), u(74), u(81), u(82), u(79), u(89)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 5-A only
const tClass: Who = { role: 'teacher', user: T_CLASS, school: A }; // class teacher of 5-A; teaches English in 5-B
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

// The school's scheme (made up): Theory 80 and Internal 20 of a subject; four bands with no gap; two terms.
const LAYOUT = { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false };
const scheme = (bands: { from: number; to: number; grade: string }[]) => ({
  bands: bands.map((b) => ({ ...b, meaning: null })),
  decimals: 0,
  passMark: 33,
  components: [
    { key: 'theory', kind: 'theory', name: 'Theory', share: 80, passMark: null, parts: [] },
    { key: 'internal', kind: 'internal', name: 'Internal', share: 20, passMark: null, parts: [] },
  ],
  terms: [{ name: 'Term 1' }, { name: 'Term 2' }],
  layout: LAYOUT,
  coScholastic: null,
});
const BANDS_V1 = [{ from: 75, to: 100, grade: 'A' }, { from: 50, to: 74, grade: 'B' }, { from: 33, to: 49, grade: 'C' }, { from: 0, to: 32, grade: 'D' }];

let examId = '';
const paper: Record<'m5a' | 'e5a' | 'm5b', string> = { m5a: '', e5a: '', m5b: '' };
const score = (studentId: string, component: string, value: number) => ({ studentId, component, kind: 'score', score: value });
const mark = (studentId: string, component: string, kind: 'absent' | 'exempt' | 'clear') => ({ studentId, component, kind, score: null });

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
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true), ('${B_SESSION}', '${B}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5A}', '${A}', '5', '5', 'A', '${T_CLASS}'), ('${C5B}', '${A}', '5', '5', 'B', null), ('${C6A}', '${A}', '6', '6', 'A', null), ('${CB}', '${B}', '5', '5', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C5A}'::uuid), ('${T_CLASS}', '${ENGLISH}', '${C5B}'), ('${T_OTHER}', '${MATHS}', '${C5B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K10}', '${A}', 'A-10', 'Aarav Madeup', '${C5A}', '10', 'active'), ('${K2}', '${A}', 'A-02', 'Zoya Madeup', '${C5A}', '2', 'active'),
      ('${K1}', '${A}', 'A-01', 'Meera Madeup', '${C5A}', '1', 'active'), ('${K3}', '${A}', 'A-03', 'Dev Madeup', '${C5A}', '3', 'active'),
      ('${K4}', '${A}', 'A-04', 'Neel Madeup', '${C5A}', '4', 'pending_consent'), ('${LEFT}', '${A}', 'A-99', 'Ira Madeup', '${C5A}', '9', 'transferred'),
      ('${B1}', '${A}', 'B-01', 'Kabir Madeup', '${C5B}', '1', 'active'), ('${B2}', '${A}', 'B-02', 'Sana Madeup', '${C5B}', '2', 'active'),
      ('${BK}', '${B}', 'Z-01', 'Rohan Madeup', '${CB}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${UNIT_1}', '${A}', '${C5A}', '${MATHS}', 1, 'Fractions', 'Halves and quarters'), ('${UNIT_2}', '${A}', '${C5A}', '${MATHS}', 2, 'Decimals', 'Tenths'),
      ('${UNIT_5B}', '${A}', '${C5B}', '${MATHS}', 1, 'Fractions', 'Halves and quarters');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(scheme(BANDS_V1)), PRINCIPAL]);
}, 120_000);
afterAll(async () => db?.stop());

describe('making an exam with its papers', () => {
  it('the office makes an exam for a term, with a paper for each class and subject and the scheme’s components and their maxima', async () => {
    const made = await as(principal, (c) =>
      makeExam(c, actor(principal), {
        name: '  Half-yearly   2026 ',
        sessionId: SESSION,
        term: 'Term 1',
        papers: [
          { classId: C5A, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT_2, UNIT_1], maxima: { theory: 80, internal: 20 } },
          { classId: C5A, subjectId: ENGLISH, date: null, unitIds: [], maxima: { theory: 40 } }, // no internal part on this paper
          { classId: C5B, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT_5B], maxima: { theory: 80, internal: 20 } },
        ],
      })
    );
    expect(made.ok).toBe(true);
    examId = (made as { examId: string }).examId;
    const rows = await run(principal, `select p.paper_id, p.class_id, p.subject_id, p.components, p.unit_ids, p.created_by, e.name, e.term, e.status, e.created_by as exam_by
                                         from exam_papers p join exams e using (school_id, exam_id) where p.exam_id = $1`, [examId]);
    const find = (cls: string, subj: string) => rows.rows.find((r) => r.class_id === cls && r.subject_id === subj);
    paper.m5a = find(C5A, MATHS).paper_id;
    paper.e5a = find(C5A, ENGLISH).paper_id;
    paper.m5b = find(C5B, MATHS).paper_id;
    expect(find(C5A, MATHS)).toMatchObject({ name: 'Half-yearly 2026', term: 'Term 1', status: 'open', exam_by: PRINCIPAL, created_by: PRINCIPAL,
      components: [{ key: 'theory', name: 'Theory', max: 80, share: 80 }, { key: 'internal', name: 'Internal', max: 20, share: 20 }] });
    expect([...find(C5A, MATHS).unit_ids].sort()).toEqual([UNIT_1, UNIT_2].sort());
    expect(find(C5A, ENGLISH).components).toEqual([{ key: 'theory', name: 'Theory', max: 40, share: 80 }]);
    const audit = await owner(`select actor_user_id, after_state from audit_log where event_action = 'exam.made' and target_id = $1`, [examId]);
    expect(audit).toMatchObject([{ actor_user_id: PRINCIPAL, after_state: { name: 'Half-yearly 2026', term: 'Term 1', papers: 3, scheme_version: 1 } }]);
  });

  it('refuses what is not right: a term the scheme does not have, a chapter of another class, a part the scheme does not have, a maximum out of range, a class twice, a name taken', async () => {
    const base = { name: 'Unit test 1', sessionId: SESSION, term: null };
    const p = (over: Record<string, unknown>) => ({ classId: C5A, subjectId: MATHS, date: null, unitIds: [], maxima: { theory: 25 }, ...over });
    const tryMake = (input: Record<string, unknown>) => as(admin, (c) => makeExam(c, actor(admin), input));
    expect(await tryMake({ ...base, term: 'Term 9', papers: [p({})] })).toEqual({ ok: false, reason: 'term' });
    expect(await tryMake({ ...base, papers: [p({ unitIds: [UNIT_5B] })] })).toEqual({ ok: false, reason: 'units', at: 0 });
    expect(await tryMake({ ...base, papers: [p({ maxima: { practical: 20 } })] })).toEqual({ ok: false, reason: 'maxima', at: 0 });
    expect(await tryMake({ ...base, papers: [p({ maxima: { theory: 0 } })] })).toEqual({ ok: false, reason: 'maxima', at: 0 });
    expect(await tryMake({ ...base, papers: [p({ maxima: { theory: 25.25 } })] })).toEqual({ ok: false, reason: 'maxima', at: 0 });
    expect(await tryMake({ ...base, papers: [p({}), p({ date: '2026-11-01' })] })).toEqual({ ok: false, reason: 'paper_twice', at: 1 });
    expect(await tryMake({ ...base, papers: [p({ classId: CB })] })).toEqual({ ok: false, reason: 'class', at: 0 });
    expect(await tryMake({ ...base, name: 'half-yearly 2026', papers: [p({})] })).toEqual({ ok: false, reason: 'name_taken' });
    expect(await tryMake({ ...base, papers: [] })).toEqual({ ok: false, reason: 'papers' });
    expect((await run(principal, `select count(*)::int as n from exams where school_id = $1`, [A])).rows[0].n).toBe(1);
  });

  it('the database holds the same rules: a chapter of another class, a component without a maximum, a teacher or an accountant making an exam', async () => {
    const insertPaper = (who: Who, components: unknown, units: string[] = []) =>
      run(who, `insert into exam_papers (school_id, exam_id, class_id, subject_id, unit_ids, components, created_by) values ($1, $2, $3, $4, $5::uuid[], $6::jsonb, $7)`,
        [A, examId, C6A, MATHS, units, JSON.stringify(components), who.user]);
    await expect(insertPaper(principal, [{ key: 'theory', name: 'Theory', max: 80, share: null }], [UNIT_1])).rejects.toThrow(/units of the syllabus map of its class and subject/);
    await expect(insertPaper(principal, [{ key: 'theory', name: 'Theory', share: null }])).rejects.toThrow(/exam paper: every component has a key/);
    await expect(insertPaper(principal, [])).rejects.toThrow(/a paper has 1 to 12 components/);
    for (const who of [tMaths, tClass, accountant]) {
      await expect(insertPaper(who, [{ key: 'theory', name: 'Theory', max: 80, share: null }]), who.user).rejects.toThrow(/row-level security/);
      await expect(run(who, `insert into exams (school_id, name, session_id, created_by) values ($1, 'Mine', $2, $3)`, [A, SESSION, who.user]), who.user).rejects.toThrow(/row-level security/);
      expect(await as(who, (c) => makeExam(c, actor(who), { name: 'Mine', sessionId: SESSION, term: null, papers: [] }))).toEqual({ ok: false, reason: 'not_allowed' });
    }
    // An exam is made in one's own name only.
    await expect(run(admin, `insert into exams (school_id, name, session_id, created_by) values ($1, 'Someone else''s', $2, $3)`, [A, SESSION, PRINCIPAL])).rejects.toThrow(/row-level security/);
  });
});

describe('“A teacher enters marks only for their own class and subject: the app and the database refuse another.”', () => {
  it('the subject teacher enters their own paper’s marks', async () => {
    const r = await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper.m5a, [score(K1, 'theory', 40), score(K1, 'internal', 10)]));
    expect(r).toMatchObject({ ok: true, saved: 2, complete: false });
    expect(await owner(`select entered_by, kind, score::text from marks where paper_id = $1 and student_id = $2 order by component`, [paper.m5a, K1])).toEqual([
      { entered_by: T_MATHS, kind: 'score', score: '10' },
      { entered_by: T_MATHS, kind: 'score', score: '40' },
    ]);
  });

  it('the class teacher enters any subject of their class', async () => {
    expect(await as(tClass, (c) => saveMarks(c, actor(tClass), paper.e5a, [score(K1, 'theory', 30)]))).toMatchObject({ ok: true, saved: 1 });
  });

  it('the app refuses another class’s or another subject’s paper, and says nothing about a paper it cannot read', async () => {
    // Mathematics in 5-A, not English in 5-A: the app refuses, and nothing is written.
    expect(await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper.e5a, [score(K2, 'theory', 30)]))).toEqual({ ok: false, reason: 'not_allowed' });
    // 5-B is not Tara's class: she does not read the paper at all.
    expect(await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper.m5b, [score(B1, 'theory', 30)]))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(tMaths, (c) => paperEntry(c, actor(tMaths), paper.m5b))).toBeNull();
    // The class teacher of 5-A teaches English in 5-B, not Mathematics.
    expect(await as(tClass, (c) => saveMarks(c, actor(tClass), paper.m5b, [score(B1, 'theory', 30)]))).toEqual({ ok: false, reason: 'not_allowed' });
    // The accountant reads nothing.
    expect(await as(accountant, (c) => saveMarks(c, actor(accountant), paper.m5a, [score(K2, 'theory', 30)]))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await owner(`select count(*)::int as n from marks where student_id in ($1, $2)`, [K2, B1])).toEqual([{ n: 0 }]);
  });

  it('the database refuses it too: an insert, an update and a delete for a paper that is not the teacher’s', async () => {
    const insert = (who: Who, paperId: string, studentId: string) =>
      run(who, `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, 'theory', $5, 'score', 30, 80, $6)`,
        [A, examId, ENGLISH, paperId, studentId, who.user]);
    await expect(insert(tMaths, paper.e5a, K2)).rejects.toThrow(/row-level security/); // her class, not her subject
    await expect(insert(tMaths, paper.m5b, B1)).rejects.toThrow(/a mark belongs to a paper of an exam|row-level security/); // not her class: she cannot even read the paper
    await expect(insert(tOther, paper.m5a, K2)).rejects.toThrow(/a mark belongs to a paper of an exam|row-level security/);
    await expect(insert(accountant, paper.m5a, K2)).rejects.toThrow(/a mark belongs to a paper of an exam|row-level security/);
    // On her own paper a mark is always in her own name: sent as someone else's, it is recorded as hers.
    await expect(run(tMaths, `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, 'theory', $5, 'score', 30, 80, $6)`,
      [A, examId, MATHS, paper.m5a, K2, PRINCIPAL])).resolves.toMatchObject({ rowCount: 1 });
    expect(await owner(`select entered_by from marks where paper_id = $1 and student_id = $2`, [paper.m5a, K2])).toEqual([{ entered_by: T_MATHS }]);
    expect((await run(tMaths, `delete from marks where paper_id = $1 and student_id = $2`, [paper.m5a, K2])).rowCount).toBe(1);
    // A teacher of 5-B changes or clears nothing in 5-A: the rows are not theirs to see.
    expect((await run(tOther, `update marks set score = 1 where paper_id = $1`, [paper.m5a])).rowCount).toBe(0);
    expect((await run(tOther, `delete from marks where paper_id = $1`, [paper.m5a])).rowCount).toBe(0);
    // Tara reads her class's English marks (her own class) but changes none of them.
    expect((await run(tMaths, `select count(*)::int as n from marks where paper_id = $1`, [paper.e5a])).rows[0].n).toBe(1);
    expect((await run(tMaths, `update marks set score = 1 where paper_id = $1`, [paper.e5a])).rowCount).toBe(0);
    expect((await run(tMaths, `delete from marks where paper_id = $1`, [paper.e5a])).rowCount).toBe(0);
    expect(await owner(`select score::text from marks where paper_id = $1`, [paper.e5a])).toEqual([{ score: '30' }]);
  });

  it('a teacher records only that a paper’s marks are entered, never its date, chapters or maxima, and does not move a mark to another paper or child', async () => {
    await expect(run(tMaths, `update exam_papers set paper_date = '2026-12-01' where paper_id = $1`, [paper.m5a])).rejects.toThrow(/a teacher records only that a paper's marks are entered/);
    await expect(run(tMaths, `update exam_papers set components = '[{"key": "theory", "name": "Theory", "max": 100, "share": 80}]'::jsonb where paper_id = $1`, [paper.m5a])).rejects.toThrow();
    expect((await run(tOther, `update exam_papers set entered_by = $2 where paper_id = $1`, [paper.m5a, T_OTHER])).rowCount).toBe(0);
    await expect(run(tMaths, `update marks set student_id = $2 where paper_id = $1 and student_id = $3 and component = 'theory'`, [paper.m5a, K2, K1])).rejects.toThrow(/never change/);
    await expect(run(tMaths, `update marks set paper_id = $2 where paper_id = $1`, [paper.m5a, paper.e5a])).rejects.toThrow(/never change|row-level security/);
  });

  it('through the routes: 403 for another subject, 404 for another class', async () => {
    expect(await call(claims(tMaths), () => postPaper(req('POST', `/api/app/exams/papers/${paper.e5a}`, { marks: [score(K2, 'theory', 30)] }), { params: { paperId: paper.e5a } }))).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
    expect(await call(claims(tMaths), () => postPaper(req('POST', `/api/app/exams/papers/${paper.m5b}`, { marks: [score(B1, 'theory', 30)] }), { params: { paperId: paper.m5b } }))).toMatchObject({ status: 404 });
    expect(await call(claims(tMaths), () => getPaper(req('GET', `/api/app/exams/papers/${paper.m5b}`), { params: { paperId: paper.m5b } }))).toMatchObject({ status: 404 });
    expect(await call(claims(accountant), () => getPaper(req('GET', `/api/app/exams/papers/${paper.m5a}`), { params: { paperId: paper.m5a } }))).toMatchObject({ status: 403 });
    const own = await call(claims(tMaths), () => postPaper(req('POST', `/api/app/exams/papers/${paper.m5a}`, { marks: [score(K2, 'theory', 50)] }), { params: { paperId: paper.m5a } }));
    expect(own).toMatchObject({ status: 200, body: { ok: true, saved: 1 } });
  });
});

describe('“A mark above a component’s maximum or below zero is refused by both.”', () => {
  it('the app refuses it, and saves nothing of that save', async () => {
    for (const bad of [81, -1, 12.25, Number.NaN]) {
      expect(await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper.m5a, [score(K3, 'theory', 40), score(K3, 'internal', bad)])), String(bad)).toEqual({ ok: false, reason: 'score', at: 1 });
    }
    // 21 is above Internal's 20, though below Theory's 80.
    expect(await as(principal, (c) => saveMarks(c, actor(principal), paper.m5a, [score(K3, 'internal', 21)]))).toEqual({ ok: false, reason: 'score', at: 0 });
    expect(await owner(`select count(*)::int as n from marks where student_id = $1`, [K3])).toEqual([{ n: 0 }]);
    expect(await call(claims(tMaths), () => postPaper(req('POST', `/api/app/exams/papers/${paper.m5a}`, { marks: [score(K3, 'theory', 80.5)] }), { params: { paperId: paper.m5a } }))).toMatchObject({ status: 400, body: { code: 'score' } });
  });

  it('the database refuses it for everyone, the office included, on insert and on update', async () => {
    const insert = (who: Who, value: number | null, component = 'internal', kind = 'score') =>
      run(who, `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values ($1, $2, $3, $4, $5, $6, $7, $8, 999, $9)`,
        [A, examId, MATHS, paper.m5a, component, K3, kind, value, who.user]);
    for (const who of [tMaths, principal]) {
      await expect(insert(who, 20.5), who.role).rejects.toThrow(/between 0 and its component's maximum of 20/);
      await expect(insert(who, -0.5), who.role).rejects.toThrow(/between 0 and its component's maximum of 20/);
      await expect(insert(who, 12.25), who.role).rejects.toThrow(/at most one decimal place/);
      await expect(insert(who, 10, 'practical'), who.role).rejects.toThrow(/one of its paper's components/);
    }
    // The maximum is the paper's, whatever is sent.
    await insert(tMaths, 20);
    expect(await owner(`select max_score::text from marks where student_id = $1 and component = 'internal'`, [K3])).toEqual([{ max_score: '20' }]);
    await expect(run(principal, `update marks set score = 25 where student_id = $1 and component = 'internal'`, [K3])).rejects.toThrow(/maximum of 20/);
    await expect(run(tMaths, `update marks set score = -2 where student_id = $1 and component = 'internal'`, [K3])).rejects.toThrow(/maximum of 20/);
    // One mark a paper, component and child.
    await expect(insert(principal, 15)).rejects.toThrow(/duplicate key|uq_marks_paper_component_child/);
  });
});

describe('“Absent is not zero and is left out of the percent.”', () => {
  it('absent and exempt carry no score, in the app and in the database', async () => {
    expect(await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper.m5a, [mark(K10, 'theory', 'absent'), score(K10, 'internal', 18), mark(K2, 'internal', 'exempt')]))).toMatchObject({ ok: true, saved: 3 });
    expect(await owner(`select component, kind, score from marks where paper_id = $1 and student_id = $2 order by component`, [paper.m5a, K10])).toEqual([
      { component: 'internal', kind: 'score', score: '18' },
      { component: 'theory', kind: 'absent', score: null },
    ]);
    // "Absent" with a zero is refused: absent is not a mark.
    await expect(run(tMaths, `update marks set score = 0 where paper_id = $1 and student_id = $2 and component = 'theory'`, [paper.m5a, K10])).rejects.toThrow(/marks_score_only_when_scored/);
  });

  it('the percent leaves absent and exempt out; counting absent as zero would give another number', async () => {
    const result = (await as(principal, (c) => classResult(c, actor(principal), examId, C5A)))!;
    const maths = result.papers.findIndex((p) => p.paperId === paper.m5a);
    const aarav = result.children.find((c) => c.studentId === K10)!;
    // Theory absent, Internal 18 of 20: only Internal is a mark, so 90 percent. As a zero it would be 18.
    expect(aarav.papers[maths].percent).toBe(90);
    expect(percent([{ score: 0, max: 80, share: 80 }, { score: 18, max: 20, share: 20 }])).toBeCloseTo(18);
    expect(aarav.papers[maths].grade).toEqual({ kind: 'grade', grade: 'A', meaning: null });
    // Zoya: Theory 50 of 80, Internal exempt: 62.5, rounded to 63 by the scheme, grade B.
    const zoya = result.children.find((c) => c.studentId === K2)!;
    expect(zoya.papers[maths]).toMatchObject({ percent: 62.5, rounded: 63, grade: { kind: 'grade', grade: 'B' } });
    // Absent in every component: no percent and no grade, never zero.
    await as(principal, (c) => saveMarks(c, actor(principal), paper.m5a, [mark(K4, 'theory', 'absent'), mark(K4, 'internal', 'absent')]));
    const again = (await as(principal, (c) => classResult(c, actor(principal), examId, C5A)))!;
    expect(again.children.find((c) => c.studentId === K4)!.papers[maths]).toMatchObject({ percent: null, rounded: null, grade: { kind: 'no_grade', reason: 'no_marks' } });
    // Dev has Internal 20 of 20 and nothing yet for Theory: no percent until it is entered, not 100 and not 20.
    expect(again.children.find((c) => c.studentId === K3)!.papers[maths]).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
    expect(again.children.find((c) => c.studentId === K3)!.overall).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
    expect(again.children.find((c) => c.studentId === K1)!.papers[maths].percent).toBe(50);
  });
});

describe('“The class result shows each child’s percent and grade by the school’s scheme, in roll order.”', () => {
  it('in roll order (1, 2, 3, 4, 10), never by marks; no rank, position or comparison is worked out', async () => {
    const result = (await as(principal, (c) => classResult(c, actor(principal), examId, C5A)))!;
    expect(result.children.map((c) => c.rollNo)).toEqual(['1', '2', '3', '4', '10']);
    expect(result.children.map((c) => c.studentId)).not.toContain(LEFT); // left the class: not on its roll
    expect(result.papers.map((p) => p.subjectName)).toEqual(['English', 'Mathematics']);
    expect(JSON.stringify(result)).not.toMatch(/rank|position|topper|merit|percentile/i);
    expect(result.scheme).toEqual({ version: 1, decimals: 0 });
  });

  it('each percent and grade is grade(percent()) by the scheme in force; a new version of the scheme moves the grade', async () => {
    const before = (await as(coordinator, (c) => classResult(c, actor(coordinator), examId, C5A)))!;
    const maths = before.papers.findIndex((p) => p.paperId === paper.m5a);
    const meera = before.children.find((c) => c.studentId === K1)!; // Theory 40/80, Internal 10/20: 50 percent
    expect(meera.papers[maths]).toMatchObject({ percent: 50, rounded: 50, grade: { kind: 'grade', grade: 'B' } });
    expect(meera.papers[maths].grade).toEqual({ kind: 'grade', grade: grade(50, { bands: scheme(BANDS_V1).bands, decimals: 0 }).kind === 'grade' ? 'B' : '', meaning: null });
    // Overall: Mathematics (Theory 40/80, Internal 10/20) and English (Theory 30/40), weighed by the components' shares.
    expect(meera.overall.percent).toBeCloseTo(((80 * (40 / 80) + 20 * (10 / 20) + 80 * (30 / 40)) / 180) * 100, 6);
    // The coordinator does not read a child whose consent is waiting: the screen says one child is not shown.
    expect(before.children.map((c) => c.rollNo)).toEqual(['1', '2', '3', '10']);
    expect(before.notShown).toBe(1);
    // The principal saves version 2, in which 50 is a C: the same marks now show C.
    await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 2, $2::jsonb, $3)`, [A, JSON.stringify(scheme([{ from: 75, to: 100, grade: 'A' }, { from: 51, to: 74, grade: 'B' }, { from: 33, to: 50, grade: 'C' }, { from: 0, to: 32, grade: 'D' }])), PRINCIPAL]);
    const after = (await as(principal, (c) => classResult(c, actor(principal), examId, C5A)))!;
    expect(after.scheme).toEqual({ version: 2, decimals: 0 });
    expect(after.children.find((c) => c.studentId === K1)!.papers[maths].grade).toEqual({ kind: 'grade', grade: 'C', meaning: null });
  });

  it('a teacher reads the result of their own class only; the accountant and another school read none; the route says so', async () => {
    expect(await as(tMaths, (c) => classResult(c, actor(tMaths), examId, C5A))).not.toBeNull();
    expect(await as(tMaths, (c) => classResult(c, actor(tMaths), examId, C5B))).toBeNull();
    expect(await as(bPrincipal, (c) => classResult(c, actor(bPrincipal), examId, C5A))).toBeNull();
    expect(await as(accountant, (c) => classResult(c, actor(accountant), examId, C5A))).toBeNull();
    const ok = await call(claims(tOther), () => getResult(req('GET', `/api/app/exams/${examId}/classes/${C5B}`), { params: { examId, classId: C5B } }));
    expect(ok.status).toBe(200);
    expect(ok.body.children.map((c: { rollNo: string }) => c.rollNo)).toEqual(['1', '2']);
    expect(await call(claims(tOther), () => getResult(req('GET', `/api/app/exams/${examId}/classes/${C5A}`), { params: { examId, classId: C5A } }))).toMatchObject({ status: 404 });
    expect(await call(claims(accountant), () => getResult(req('GET', `/api/app/exams/${examId}/classes/${C5A}`), { params: { examId, classId: C5A } }))).toMatchObject({ status: 403 });
  });
});

describe('who reads what, directly in the database', () => {
  it('the accountant reads no exam, paper or mark; another school reads none; the platform role holds no right', async () => {
    for (const t of ['exams', 'exam_papers', 'marks']) {
      expect((await run(accountant, `select count(*)::int as n from ${t}`)).rows[0].n, t).toBe(0);
      expect((await run(bPrincipal, `select count(*)::int as n from ${t}`)).rows[0].n, t).toBe(0);
      expect((await run(principal, `select count(*)::int as n from ${t}`)).rows[0].n, t).toBeGreaterThan(0);
      await expect(platform((c) => c.query(`select 1 from ${t} limit 1`)), t).rejects.toThrow(/permission denied/);
    }
  });

  it('a teacher reads the exams, papers and marks of their own classes only', async () => {
    const papers = async (who: Who) => (await run(who, `select class_id from exam_papers order by class_id`)).rows.map((r) => r.class_id);
    expect(await papers(tMaths)).toEqual([C5A, C5A]);
    expect(await papers(tOther)).toEqual([C5B]);
    expect(await papers(tClass)).toEqual([C5A, C5A, C5B].sort()); // class teacher of 5-A, English in 5-B
    const markClasses = (await run(tOther, `select distinct p.class_id from marks m join exam_papers p using (school_id, paper_id)`)).rows;
    expect(markClasses.every((r) => r.class_id === C5B)).toBe(true);
    expect((await run(tOther, `select count(*)::int as n from marks where paper_id = $1`, [paper.m5a])).rows[0].n).toBe(0);
    // A teacher with no paper in an exam does not see the exam.
    const fresh: Who = { role: 'teacher', user: u(18), school: A };
    await owner(`insert into users (user_id, school_id, email, role, display_name, is_active) values ($1, $2, 'new@school-a.example', 'teacher', 'Nia New', true)`, [fresh.user, A]);
    expect((await run(fresh, `select count(*)::int as n from exams`)).rows[0].n).toBe(0);
  });

  it('the audit rows of exams are read by the office and the person who acted, not by another teacher', async () => {
    const actions = async (who: Who) => (await run(who, `select distinct event_action from audit_log where split_part(event_action, '.', 1) in ('exam', 'exam_paper') order by 1`)).rows.map((r) => r.event_action);
    expect(await actions(principal)).toEqual(['exam.made', 'exam_paper.marks_saved']);
    expect(await actions(tMaths)).toEqual(['exam_paper.marks_saved']);
    expect(await actions(tOther)).toEqual([]);
    // What is audited is how many marks were saved, never the marks.
    const saved = await owner(`select after_state from audit_log where event_action = 'exam_paper.marks_saved' order by audit_id limit 1`);
    expect(Object.keys(saved[0].after_state).sort()).toEqual(['cleared', 'complete', 'exam_id', 'saved']);
  });
});

describe('a paper is “entered” when every child on the roll has a mark, absent or exempt', () => {
  it('counted over the whole roll, whoever enters; recorded in the name of the one who finished it; taken back when a mark is cleared', async () => {
    // 5-B Mathematics: two children, two components each.
    expect(await as(tOther, (c) => saveMarks(c, actor(tOther), paper.m5b, [score(B1, 'theory', 60), score(B1, 'internal', 15), score(B2, 'theory', 70)]))).toMatchObject({ ok: true, roll: 2, entered: 1, complete: false });
    expect(await owner(`select entered_by, entered_at from exam_papers where paper_id = $1`, [paper.m5b])).toEqual([{ entered_by: null, entered_at: null }]);
    const done = await as(tOther, (c) => saveMarks(c, actor(tOther), paper.m5b, [mark(B2, 'internal', 'exempt')]));
    expect(done).toMatchObject({ ok: true, roll: 2, entered: 2, complete: true });
    const [p] = await owner(`select entered_by, entered_at from exam_papers where paper_id = $1`, [paper.m5b]);
    expect(p.entered_by).toBe(T_OTHER);
    expect(p.entered_at).not.toBeNull();
    // On the screen: the paper says it is entered and by whom.
    const screen = (await as(principal, (c) => examsScreen(c, actor(principal), null)))!;
    const listed = screen.exams[0].papers.find((x) => x.paperId === paper.m5b)!;
    expect(listed).toMatchObject({ roll: 2, entered: 2, enteredBy: 'Omar Other' });
    // A mark cleared: no longer entered.
    expect(await as(tOther, (c) => saveMarks(c, actor(tOther), paper.m5b, [mark(B2, 'internal', 'clear')]))).toMatchObject({ ok: true, cleared: 1, complete: false });
    expect(await owner(`select entered_by, entered_at from exam_papers where paper_id = $1`, [paper.m5b])).toEqual([{ entered_by: null, entered_at: null }]);
    // Nobody records a paper entered in another's name, nor one that still waits for a child's mark.
    await expect(run(principal, `update exam_papers set entered_by = $2 where paper_id = $1`, [paper.m5b, T_OTHER])).rejects.toThrow(/in one's own name/);
    await expect(run(tOther, `update exam_papers set entered_by = $2 where paper_id = $1`, [paper.m5b, T_OTHER])).rejects.toThrow(/only when every child on its roll has a mark/);
    await expect(run(principal, `update exam_papers set entered_by = $2 where paper_id = $1`, [paper.m5a, PRINCIPAL])).rejects.toThrow(/only when every child on its roll has a mark/);
  });

  it('the coordinator, who does not read a child whose consent is waiting, still sees the paper counted over the whole roll', async () => {
    const entry = (await as(coordinator, (c) => paperEntry(c, actor(coordinator), paper.m5a)))!;
    expect(entry.paper.roll).toBe(5);
    expect(entry.children.length).toBe(4);
    expect(entry.notShown).toBe(1);
    expect(entry.children.map((c) => c.rollNo)).toEqual(['1', '2', '3', '10']);
    expect(entry.mayEnter).toBe(true);
    expect(entry.map.map((m) => m.chapter)).toEqual(['Fractions', 'Decimals']);
    expect(entry.paper.chapters).toEqual(['Fractions', 'Decimals']);
  });
});

describe('My Day: “marks to enter” for a teacher', () => {
  const provider = TODAY_PROVIDERS.find((p) => p.type === 'marks-to-enter')!;
  const cards = (who: Who) => as(who, (c) => provider.load(c, { schoolId: who.school, userId: who.user, role: who.role as never, sunday: false }));

  it('counts the papers that wait for this teacher’s marks: their own subject or class, dated today or before; gone when entered', async () => {
    expect(provider).toMatchObject({ moduleId: 'exams', roles: ['teacher'] });
    // Tara: Mathematics in 5-A, not yet entered for every child.
    expect(await cards(tMaths)).toEqual([{ id: 'marks-to-enter', type: 'marks-to-enter', moduleId: 'exams', state: 'todo', count: 1, href: '/app/exams' }]);
    // Kiran: class teacher of 5-A (Mathematics and English there); English in 5-B has no paper.
    expect((await cards(tClass))[0]?.count).toBe(2);
    // Omar: 5-B Mathematics, which waits again since a mark was cleared.
    expect((await cards(tOther))[0]?.count).toBe(1);
    // Every child of 5-B has a mark again: the card is gone.
    await as(tOther, (c) => saveMarks(c, actor(tOther), paper.m5b, [score(B2, 'internal', 12)]));
    expect(await cards(tOther)).toEqual([]);
    // A paper dated after today waits until its day.
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(tomorrow > indiaDate()).toBe(true);
    await as(principal, (c) => changeExam(c, actor(principal), examId, { action: 'paper', paperId: paper.m5a, date: tomorrow, unitIds: [UNIT_1] }));
    expect(await cards(tMaths)).toEqual([]);
    const screen = (await as(tMaths, (c) => examsScreen(c, actor(tMaths), null)))!;
    expect(screen.toEnter).toEqual([]);
    await as(principal, (c) => changeExam(c, actor(principal), examId, { action: 'paper', paperId: paper.m5a, date: indiaDate(), unitIds: [UNIT_1, UNIT_2] }));
    expect((await as(tMaths, (c) => examsScreen(c, actor(tMaths), null)))!.toEnter.map((p) => p.paperId)).toEqual([paper.m5a]);
  });
});

describe('changing an exam', () => {
  it('a paper with marks is not removed, nor its exam; its components are fixed once a mark is entered', async () => {
    expect(await as(admin, (c) => changeExam(c, actor(admin), examId, { action: 'remove_paper', paperId: paper.m5a }))).toEqual({ ok: false, reason: 'has_marks' });
    expect(await as(admin, (c) => changeExam(c, actor(admin), examId, { action: 'remove' }))).toEqual({ ok: false, reason: 'has_marks' });
    await expect(run(principal, `delete from exam_papers where paper_id = $1`, [paper.m5a])).rejects.toThrow(/foreign key/);
    await expect(run(principal, `update exam_papers set components = '[{"key": "theory", "name": "Theory", "max": 100, "share": 80}]'::jsonb where paper_id = $1`, [paper.m5a])).rejects.toThrow(/fixed once a mark is entered/);
    expect(await as(tMaths, (c) => changeExam(c, actor(tMaths), examId, { action: 'remove' }))).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('the office adds a paper, and removes one with no marks; each change is audited', async () => {
    const added = await as(coordinator, (c) => changeExam(c, actor(coordinator), examId, { action: 'add_paper', paper: { classId: C6A, subjectId: MATHS, date: null, unitIds: [], maxima: { theory: 50 } } }));
    expect(added).toMatchObject({ ok: true });
    const paperId = (added as { paperId: string }).paperId;
    expect(await as(coordinator, (c) => changeExam(c, actor(coordinator), examId, { action: 'add_paper', paper: { classId: C6A, subjectId: MATHS, date: null, unitIds: [], maxima: { theory: 50 } } }))).toEqual({ ok: false, reason: 'paper_twice' });
    expect(await as(coordinator, (c) => changeExam(c, actor(coordinator), examId, { action: 'remove_paper', paperId }))).toEqual({ ok: true, examId });
    const audit = await owner(`select event_action, actor_user_id from audit_log where target_id = $1 order by audit_id`, [paperId]);
    expect(audit).toEqual([{ event_action: 'exam_paper.added', actor_user_id: COORDINATOR }, { event_action: 'exam_paper.removed', actor_user_id: COORDINATOR }]);
  });

  it('an exam that is not open takes no mark: the database refuses it', async () => {
    await owner(`update exams set status = 'published' where exam_id = $1`, [examId]);
    expect(await as(tMaths, (c) => saveMarks(c, actor(tMaths), paper.m5a, [score(K3, 'theory', 10)]))).toEqual({ ok: false, reason: 'closed' });
    await expect(run(principal, `update marks set score = 1 where paper_id = $1 and student_id = $2 and component = 'theory'`, [paper.m5a, K1])).rejects.toThrow(/no longer open/);
    await owner(`update exams set status = 'open' where exam_id = $1`, [examId]);
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
  it('every exams route belongs to the Exams switch; switched off, nothing is read or written', async () => {
    for (const p of ['/api/app/exams', `/api/app/exams/${u(1)}`, `/api/app/exams/papers/${u(1)}`, `/api/app/exams/${u(1)}/classes/${u(2)}`]) expect(writeModuleFor(p), p).toBe('exams');
    for (const p of ['/api/app/exams', `/api/app/exams/papers/${u(1)}`, `/api/app/exams/${u(1)}/classes/${u(2)}`]) expect(readModuleFor(p), p).toBe('exams');
    expect(moduleById('exams')).toMatchObject({ status: 'partial' });
    await owner(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await call(claims(principal), () => getExams(req('GET', '/api/app/exams')))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    expect(await call(claims(tMaths), () => postPaper(req('POST', `/api/app/exams/papers/${paper.m5a}`, { marks: [score(K3, 'theory', 10)] }), { params: { paperId: paper.m5a } }))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    await owner(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'exams'`, [A]);
  });

  it('the exams screen: the office gets what it needs to make an exam; a teacher gets their papers and nothing to make one with', async () => {
    const office = await call(claims(admin), () => getExams(req('GET', '/api/app/exams')));
    expect(office.status).toBe(200);
    expect(office.body).toMatchObject({ mayRun: true, session: SESSION, scheme: { version: 2, terms: ['Term 1', 'Term 2'] } });
    expect(office.body.classes.length).toBe(3);
    expect(office.body.scheme.parts.map((p: { key: string }) => p.key)).toEqual(['theory', 'internal']);
    const teacher = await call(claims(tMaths), () => getExams(req('GET', '/api/app/exams')));
    expect(teacher.body).toMatchObject({ mayRun: false, classes: [], subjects: [] });
    expect(teacher.body.exams[0].papers.map((p: { classId: string; mayEnter: boolean }) => [p.classId, p.mayEnter])).toEqual([[C5A, false], [C5A, true]]);
    expect(await call(claims(accountant), () => getExams(req('GET', '/api/app/exams')))).toMatchObject({ status: 403 });
    expect(await call(claims(tMaths), () => postExams(req('POST', '/api/app/exams', { name: 'Mine', sessionId: SESSION, papers: [] })))).toMatchObject({ status: 403 });
    expect(await call(claims(principal), () => postExam(req('POST', `/api/app/exams/${examId}`, { action: 'something' }), { params: { examId } }))).toMatchObject({ status: 400 });
    const made = await call(claims(principal), () => postExams(req('POST', '/api/app/exams', { name: 'Unit test 2', sessionId: SESSION, term: 'Term 2', papers: [{ classId: C5B, subjectId: ENGLISH, date: null, unitIds: [], maxima: { theory: 25 } }] })));
    expect(made).toMatchObject({ status: 201, body: { ok: true } });
    expect(await call(claims(principal), () => postExams(req('POST', '/api/app/exams', { name: 'Unit test 2', sessionId: SESSION, term: null, papers: [{ classId: C5B, subjectId: ENGLISH, date: null, unitIds: [], maxima: { theory: 25 } }] })))).toMatchObject({ status: 409, body: { code: 'name_taken' } });
    expect(await call(claims(principal), () => postExam(req('POST', `/api/app/exams/${made.body.examId}`, { action: 'remove' }), { params: { examId: made.body.examId } }))).toMatchObject({ status: 200 });
  });
});

describe('the migration', () => {
  const file = () => readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_p6_exams_marks.sql'))!;
  const sql = () => readFileSync(path.join(ROOT, 'supabase/migrations', file()), 'utf8');

  it('ends by switching Exams on for every school there is, keeping a school’s own choice', () => {
    const last = sql().trimEnd();
    expect(last.slice(last.lastIndexOf('insert into school_module_entitlements'))).toBe(
      `insert into school_module_entitlements (school_id, module_id, enabled, source)\nselect s.school_id, 'exams', true, 'plan' from schools s\non conflict (school_id, module_id) do nothing;`
    );
  });

  // The test database holds one exam and 414 marks recorded before P6, in the old shape (no paper, no component).
  // A database with such rows: the migration moves each into a paper of its exam, class and subject with one
  // component, keeps every score and maximum, and the class result reads them.
  const OLD = (extra = '') => `
    insert into schools (school_id, name, jurisdiction) values ('${u(901)}', 'Old School', 'IN-HR');
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${u(902)}', '${u(901)}', 'p@old.example', 'principal', 'Old Principal', true);
    insert into classes (class_id, school_id, name, section) values ('${u(903)}', '${u(901)}', '7', 'A'), ('${u(904)}', '${u(901)}', '7', 'B');
    insert into subjects (subject_id, school_id, name) values ('${u(905)}', '${u(901)}', 'Science'), ('${u(906)}', '${u(901)}', 'Hindi');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status)
      select ('9b000000-0000-4000-8000-0000000009' || lpad(g::text, 2, '0'))::uuid, '${u(901)}', 'O-' || g, 'Child ' || g, case when g % 2 = 0 then '${u(903)}' else '${u(904)}' end::uuid, g::text, 'active' from generate_series(10, 19) g;
    insert into exams (exam_id, school_id, name, date) values ('${u(907)}', '${u(901)}', 'Old exam', '2026-07-15');
    insert into marks (school_id, exam_id, student_id, subject_id, score, max_score)
      select '${u(901)}', '${u(907)}', s.student_id, sb.subject_id, (10 + (row_number() over ()) % 30)::numeric + 0.5, 50 from students s, subjects sb where s.school_id = '${u(901)}' and sb.school_id = '${u(901)}';
    ${extra}`;

  it('moves the marks recorded before P6 into papers with a single component, keeping every score and maximum', async () => {
    const old = await startHarnessDb({ port: 0, before: { migration: '_p6_exams_marks.sql', sql: OLD() } });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = async (s: string): Promise<any[]> => (await old.pg.query(s)).rows;
      expect(await q(`select count(*)::int as n from marks`)).toEqual([{ n: 20 }]);
      expect(await q(`select count(*)::int as n, count(distinct (class_id, subject_id))::int as pairs, min(components::text) = max(components::text) as same, min(components::text) as components from exam_papers`)).toEqual([
        { n: 4, pairs: 4, same: true, components: '[{"key": "marks", "max": 50, "name": "Marks", "share": null}]' },
      ]);
      expect(await q(`select count(*)::int as n from marks m join exam_papers p using (school_id, paper_id) join students s using (school_id, student_id)
                       where m.component = 'marks' and m.kind = 'score' and p.class_id = s.class_id and p.subject_id = m.subject_id and p.exam_id = m.exam_id and m.max_score = 50`)).toEqual([{ n: 20 }]);
      expect(await q(`select status, term, created_by from exams`)).toEqual([{ status: 'open', term: null, created_by: null }]);
      // The class result reads them as the principal: each child's percent is their own score over 50.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: ClassResult | null = await old.pg.transaction(async (tx: any) => {
        await tx.query('set local role app_user');
        for (const [k, v] of [['app.current_tenant_id', u(901)], ['app.current_role', 'principal'], ['app.current_user_id', u(902)]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
        return classResult(tx, { schoolId: u(901), userId: u(902), role: 'principal' }, u(907), u(903));
      });
      const scores = await q(`select m.student_id, m.subject_id, m.score::float as score from marks m join students s using (school_id, student_id) where s.class_id = '${u(903)}'`);
      expect(result!.children.map((c) => c.rollNo)).toEqual(['10', '12', '14', '16', '18']);
      for (const c of result!.children) {
        for (const [i, p] of result!.papers.entries()) {
          const subject = (await q(`select subject_id from exam_papers where paper_id = '${p.paperId}'`))[0].subject_id;
          const s = scores.find((x) => x.student_id === c.studentId && x.subject_id === subject)!.score;
          expect(c.papers[i].percent).toBeCloseTo((s / 50) * 100, 9);
          expect(c.papers[i].grade).toEqual({ kind: 'no_grade', reason: 'no_scheme' });
        }
      }
    } finally {
      await old.stop();
    }
  }, 120_000);

  it('stops, changing nothing, when a recorded mark could not be placed in a paper (a child in no class)', async () => {
    const extra = `insert into students (student_id, school_id, admission_no, name, status) values ('${u(990)}', '${u(901)}', 'O-99', 'Child 99', 'active');
                   insert into marks (school_id, exam_id, student_id, subject_id, score, max_score) values ('${u(901)}', '${u(907)}', '${u(990)}', '${u(905)}', 20, 50);`;
    await expect(startHarnessDb({ port: 0, before: { migration: '_p6_exams_marks.sql', sql: OLD(extra) } })).rejects.toThrow(/the recorded marks were not moved into papers, and nothing was changed\. 0 are a second mark .*; 1 are of a child in no class/);
  }, 120_000);
});
