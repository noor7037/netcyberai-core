import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { makeExam } from '@/lib/exams/exams';
import { publishClass } from '@/lib/exams/publish';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';

// The teacher's AI-marking routes (docs/35, C347, C348) as the app's own session calls them, on the whole schema as the
// app's own database role. The acceptance test: "a teacher of another class gets a 403 or a 404; a published class gets a
// 409; approving writes the paper's marks; the accountant reads nothing; a teacher cannot change numbering." Every name
// and number is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));

import { POST as postAbsent } from '@/app/api/app/marking/papers/[paperId]/absent/route';
import { POST as postApprove } from '@/app/api/app/marking/papers/[paperId]/approve/route';
import { GET as getOverview } from '@/app/api/app/marking/papers/[paperId]/route';
import { GET as getSetup, POST as postSetup } from '@/app/api/app/marking/papers/[paperId]/setup/route';
import { GET as getSheet, POST as postSheet } from '@/app/api/app/marking/sheets/[sheetId]/route';
import { GET as getCandidates, POST as postCandidates } from '@/app/api/app/exams/[examId]/candidates/route';
import { GET as getNumbers } from '@/app/api/app/exams/[examId]/classes/[classId]/numbers/route';
import { POST as postPaper } from '@/app/api/app/exams/papers/[paperId]/route';

const u = (n: number) => `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, T_MATHS, T_OTHER, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15)];
const [C7A, C7B, CB] = [u(21), u(22), u(23)];
const [MATHS, B_MATHS] = [u(31), u(32)];
const SESSION = u(41);
const [UNIT_FR, UNIT_DEC] = [u(51), u(52)];
const [K1, K2, K3, K7B] = [u(61), u(62), u(63), u(65)];
const [S1, S3, UPLOAD] = [u(71), u(72), u(73)];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tMaths: Who = { role: 'teacher', user: T_MATHS, school: A }; // teaches Mathematics in 7-A
const tOther: Who = { role: 'teacher', user: T_OTHER, school: A }; // teaches Mathematics in 7-B only
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
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;

const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school, membershipId: u(80), tokenVersion: 0, aal: 'aal1', sessionId: u(81) });
const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (who: Who, fn: () => Promise<Response>): Promise<{ status: number; body: any }> => {
  state.claims = claims(who);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn2: (x: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn2);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};

let examId = '';
let paperA = '';
let paperB = '';
const QUESTIONS = [
  { position: 1, label: '1', component: 'theory', maxMarks: 4, choiceGroup: null, unitId: UNIT_FR, kind: 'short', prompt: 'Add 1/2 and 1/4.', answerKey: '3/4', steps: [{ step: 'Common denominator', marks: 2 }, { step: 'Sum', marks: 2 }] },
  { position: 2, label: '2', component: 'theory', maxMarks: 6, choiceGroup: null, unitId: UNIT_DEC, kind: 'numerical', prompt: 'Write 0.7 as a fraction.', answerKey: '7/10', steps: [] },
  { position: 3, label: '3(a)', component: 'theory', maxMarks: 10, choiceGroup: 'A', unitId: UNIT_FR, kind: 'long', prompt: 'Fractions on a number line.', answerKey: '', steps: [] },
  { position: 4, label: '3(b)', component: 'theory', maxMarks: 10, choiceGroup: 'A', unitId: UNIT_DEC, kind: 'long', prompt: 'Decimals in money.', answerKey: '', steps: [] },
];
const SETUP = { setup: { language: 'en', guidance: 'Method marks count.', choiceCounts: { A: 1 } }, questions: QUESTIONS };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board, is_test_fixture) values ('${A}', 'School A', 'IN-HR', 'CBSE', true), ('${B}', 'School B', 'IN-DL', 'CBSE', true);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@a.example', 'principal', 'Priya Principal', true), ('${T_MATHS}', '${A}', 'tara@a.example', 'teacher', 'Tara Maths', true),
      ('${T_OTHER}', '${A}', 'omar@a.example', 'teacher', 'Omar Other', true), ('${ACCOUNTANT}', '${A}', 'anil@a.example', 'accountant', 'Anil Accountant', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@b.example', 'principal', 'Bela Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_MATHS}', 'Tara Maths'), (gen_random_uuid(), '${A}', '${T_OTHER}', 'Omar Other');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C7A}', '${A}', '7', '7', 'A'), ('${C7B}', '${A}', '7', '7', 'B'), ('${CB}', '${B}', '7', '7', 'A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${B_MATHS}', '${B}', 'Mathematics');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id)
      select '${A}', t.teacher_id, x.subject_id, x.class_id from teachers t join (values ('${T_MATHS}'::uuid, '${MATHS}'::uuid, '${C7A}'::uuid), ('${T_OTHER}', '${MATHS}', '${C7B}')) x(user_id, subject_id, class_id) on x.user_id = t.user_id;
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-1', 'Meera Sharma', '${C7A}', '1', 'active'), ('${K2}', '${A}', 'A-2', 'Zoya Khan', '${C7A}', '2', 'active'),
      ('${K3}', '${A}', 'A-3', 'Dev Patel', '${C7A}', '3', 'active'), ('${K7B}', '${A}', 'B-1', 'Kabir Rao', '${C7B}', '1', 'active');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${UNIT_FR}', '${A}', '${C7A}', '${MATHS}', 1, 'Fractions', 'Adding fractions'), ('${UNIT_DEC}', '${A}', '${C7A}', '${MATHS}', 2, 'Decimals', 'Tenths');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [
    A,
    JSON.stringify({
      bands: [{ from: 50, to: 100, grade: 'A', meaning: null }, { from: 0, to: 49, grade: 'B', meaning: null }],
      decimals: 0,
      passMark: 33,
      components: [
        { key: 'theory', kind: 'theory', name: 'Theory', share: 80, passMark: null, parts: [] },
        { key: 'internal', kind: 'internal', name: 'Internal', share: 20, passMark: null, parts: [] },
      ],
      terms: [{ name: 'Term 1' }],
      layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
      coScholastic: null,
    }),
    PRINCIPAL,
  ]);
  const made = await as(principal, (c) =>
    makeExam(c, actor(principal), {
      name: 'Half-yearly',
      sessionId: SESSION,
      term: 'Term 1',
      papers: [
        { classId: C7A, subjectId: MATHS, date: '2026-10-01', unitIds: [UNIT_FR, UNIT_DEC], maxima: { theory: 20, internal: 5 } },
        { classId: C7B, subjectId: MATHS, date: '2026-10-01', unitIds: [], maxima: { theory: 20 } },
      ],
    })
  );
  examId = (made as { examId: string }).examId;
  const papers = await owner(`select paper_id, class_id from exam_papers where exam_id = $1`, [examId]);
  paperA = papers.find((p: { class_id: string }) => p.class_id === C7A).paper_id;
  paperB = papers.find((p: { class_id: string }) => p.class_id === C7B).paper_id;
}, 120_000);
afterAll(async () => db?.stop());

const paramsOf = (paperId: string) => ({ params: { paperId } });
const sheetParams = (sheetId: string) => ({ params: { sheetId } });

describe('the routes belong to Exams, and the questions are the subject teacher’s', () => {
  it('every marking route is switched with Exams: switched off, nothing is read or written', async () => {
    for (const p of [`/api/app/marking/papers/${u(1)}`, `/api/app/marking/papers/${u(1)}/setup`, `/api/app/marking/papers/${u(1)}/approve`, `/api/app/marking/papers/${u(1)}/absent`, `/api/app/marking/sheets/${u(1)}`, `/api/app/marking/sheets/${u(1)}/mark-again`]) {
      expect(writeModuleFor(p), p).toBe('exams');
      expect(readModuleFor(p), p).toBe('exams');
    }
    await owner(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'exams'`, [A]);
    expect(await call(tMaths, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    expect(await call(tMaths, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`, SETUP), paramsOf(paperA)))).toMatchObject({ status: 403, body: { code: 'module_off' } });
    await owner(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'exams'`, [A]);
  });

  it('the subject teacher saves the questions and reads them back; another class’s teacher and the accountant get nothing', async () => {
    const saved = await call(tMaths, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`, SETUP), paramsOf(paperA)));
    expect(saved).toMatchObject({ status: 200, body: { ok: true } });
    expect(saved.body.screen.questions.map((q: { label: string }) => q.label)).toEqual(['1', '2', '3(a)', '3(b)']);
    expect(saved.body.screen.problems).toEqual([]);
    const read = await call(tMaths, () => getSetup(req('GET', `/api/app/marking/papers/${paperA}/setup`), paramsOf(paperA)));
    expect(read).toMatchObject({ status: 200, body: { locked: false, setup: { language: 'en', choiceCounts: { A: 1 } } } });
    expect(read.body.paper).toMatchObject({ mayMark: true, published: false });
    for (const who of [tOther, bPrincipal]) {
      expect((await call(who, () => getSetup(req('GET', `/api/app/marking/papers/${paperA}/setup`), paramsOf(paperA)))).status, who.user).toBe(404);
      expect((await call(who, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`, SETUP), paramsOf(paperA)))).status, who.user).toBe(404);
    }
    expect((await call(accountant, () => getSetup(req('GET', `/api/app/marking/papers/${paperA}/setup`), paramsOf(paperA)))).status).toBe(403);
    expect((await call(accountant, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`, SETUP), paramsOf(paperA)))).status).toBe(403);
    expect((await owner(`select count(*)::int as n from marking_questions where paper_id = $1`, [paperA]))[0].n).toBe(4);
  });

  it('a question sent wrongly is refused with the question and the field named; a paper id that is not one is a 400', async () => {
    const bad = { ...SETUP, questions: [{ ...QUESTIONS[0], maxMarks: -1 }] };
    expect(await call(tMaths, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`, bad), paramsOf(paperA)))).toMatchObject({ status: 400, body: { code: 'question', at: 0, field: 'maxMarks' } });
    expect((await call(tMaths, () => getSetup(req('GET', `/api/app/marking/papers/nope/setup`), paramsOf('nope')))).status).toBe(400);
    expect((await call(tMaths, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`), paramsOf(paperA)))).status).toBe(400);
    // Nothing was kept of the wrong list.
    expect((await owner(`select count(*)::int as n from marking_questions where paper_id = $1`, [paperA]))[0].n).toBe(4);
  });

  it('the overview says AI marking is not in the plan, lists the candidates with no script, and is the teacher’s own class only', async () => {
    const o = await call(tMaths, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)));
    expect(o).toMatchObject({ status: 200, body: { ready: true, ai: { on: false, why: 'no_limit' }, sheets: [] } });
    expect(o.body.withoutScript.map((c: { name: string }) => c.name)).toEqual(['Meera Sharma', 'Zoya Khan', 'Dev Patel']);
    expect((await call(tOther, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)))).status).toBe(404);
    expect((await call(accountant, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)))).status).toBe(403);
    expect((await call(bPrincipal, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)))).status).toBe(404);
    // The other teacher's own paper is theirs.
    expect((await call(tOther, () => getOverview(req('GET', `/api/app/marking/papers/${paperB}`), paramsOf(paperB)))).status).toBe(200);
  });
});

describe('candidates and exam numbers: the office changes, a teacher reads', () => {
  it('a teacher reads their classes and cannot change numbering; the office turns numbers on and every candidate has one', async () => {
    const read = await call(tMaths, () => getCandidates(req('GET', `/api/app/exams/${examId}/candidates`), { params: { examId } }));
    expect(read).toMatchObject({ status: 200, body: { mayChange: false, numbering: 'roll' } });
    const body = { action: 'numbering', numbering: 'seat', prefix: 'hy' };
    expect((await call(tMaths, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, body), { params: { examId } }))).status).toBe(403);
    expect((await call(accountant, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, body), { params: { examId } }))).status).toBe(403);
    expect((await call(accountant, () => getCandidates(req('GET', `/api/app/exams/${examId}/candidates`), { params: { examId } }))).status).toBe(403);
    expect((await owner(`select numbering from exams where exam_id = $1`, [examId]))[0].numbering).toBe('roll');
    expect(await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, body), { params: { examId } }))).toMatchObject({ status: 200, body: { ok: true } });
    const after = await call(principal, () => getCandidates(req('GET', `/api/app/exams/${examId}/candidates`), { params: { examId } }));
    expect(after.body).toMatchObject({ numbering: 'seat', seatPrefix: 'HY', mayChange: true });
    expect(after.body.classes.map((c: { className: string; candidates: number; numbered: number }) => [c.className, c.candidates, c.numbered])).toEqual([['7-A', 3, 3], ['7-B', 1, 1]]);
    expect((await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, { action: 'numbering', numbering: 'seat', prefix: 'toolongprefix' }), { params: { examId } }))).status).toBe(400);
    expect((await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, { action: 'nothing' }), { params: { examId } }))).status).toBe(400);
  });

  it('the printable list is a class’s candidates in roll order with their numbers; another class’s teacher and the accountant get nothing', async () => {
    const list = await call(tMaths, () => getNumbers(req('GET', `/api/app/exams/${examId}/classes/${C7A}/numbers`), { params: { examId, classId: C7A } }));
    expect(list).toMatchObject({ status: 200, body: { examName: 'Half-yearly', className: '7-A', numbering: 'seat', seatPrefix: 'HY' } });
    expect(list.body.children.map((c: { rollNo: string; seatNo: string; name: string }) => [c.rollNo, c.seatNo, c.name])).toEqual([['1', 'HY0001', 'Meera Sharma'], ['2', 'HY0002', 'Zoya Khan'], ['3', 'HY0003', 'Dev Patel']]);
    expect((await call(tMaths, () => getNumbers(req('GET', `/api/app/exams/${examId}/classes/${C7B}/numbers`), { params: { examId, classId: C7B } }))).status).toBe(404);
    expect((await call(accountant, () => getNumbers(req('GET', `/api/app/exams/${examId}/classes/${C7A}/numbers`), { params: { examId, classId: C7A } }))).status).toBe(403);
    expect((await call(bPrincipal, () => getNumbers(req('GET', `/api/app/exams/${examId}/classes/${C7A}/numbers`), { params: { examId, classId: C7A } }))).status).toBe(404);
  });

  it('the office withdraws a child with a reason and takes it back; a teacher withdraws no one', async () => {
    const w = { action: 'withdraw', studentId: K3, reason: 'Long medical leave' };
    expect((await call(tMaths, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, w), { params: { examId } }))).status).toBe(403);
    expect((await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, { ...w, reason: 'no' }), { params: { examId } }))).status).toBe(400);
    expect(await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, w), { params: { examId } }))).toMatchObject({ status: 200 });
    expect(await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, w), { params: { examId } }))).toMatchObject({ status: 409, body: { code: 'already' } });
    const seen = await call(tMaths, () => getCandidates(req('GET', `/api/app/exams/${examId}/candidates`), { params: { examId } }));
    expect(seen.body.withdrawals).toMatchObject([{ name: 'Dev Patel', reason: 'Long medical leave' }]);
    expect(seen.body.classes[0]).toMatchObject({ onRoll: 3, withdrawn: 1, candidates: 2 });
    const list = await call(tMaths, () => getNumbers(req('GET', `/api/app/exams/${examId}/classes/${C7A}/numbers`), { params: { examId, classId: C7A } }));
    expect(list.body.children.map((c: { withdrawn: boolean }) => c.withdrawn)).toEqual([false, false, true]);
    expect((await call(tMaths, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, { action: 'undo', studentId: K3 }), { params: { examId } }))).status).toBe(403);
    expect(await call(principal, () => postCandidates(req('POST', `/api/app/exams/${examId}/candidates`, { action: 'undo', studentId: K3 }), { params: { examId } }))).toMatchObject({ status: 200 });
  });
});

describe('a script: read, changed, approved', () => {
  const q = async (label: string) => (await owner(`select question_id from marking_questions where paper_id = $1 and label = $2`, [paperA, label]))[0].question_id as string;
  const addScript = async (sheetId: string, studentId: string, marks: Record<string, number>, flags: string[] = []) => {
    await owner(`insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, state, flags, ai_confidence, strengths) values ($1, $2, $3, $4, $5, 'roll', 'marked', $6, 0.9, 'Neat.')`, [A, sheetId, paperA, UPLOAD, studentId, flags]);
    for (const [label, m] of Object.entries(marks)) {
      await owner(`insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_steps, confidence) values ($1, $2, $3, $4, true, $5, '[]', 0.9)`, [A, sheetId, paperA, await q(label), m]);
    }
  };

  it('the subject teacher reads a script with its pages’ addresses; another class’s teacher and the accountant read nothing', async () => {
    await owner(`insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by, closed_at) values ($1, $2, $3, 'per_file', $4, now())`, [A, UPLOAD, paperA, T_MATHS]);
    await addScript(S1, K1, { '1': 3, '2': 5, '3(a)': 7, '3(b)': 0 }, ['unsure']);
    await addScript(S3, K3, { '1': 4, '2': 6, '3(a)': 10, '3(b)': 0 });
    const page = u(90);
    await owner(`insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state, sheet_id, sheet_position) values ($1, $2, $3, $4, 1, 1, $6, $7, 1000, 1400, 2000, 'read', $5, 1)`, [A, page, UPLOAD, paperA, S1, `${A}/marking/${paperA}/${page}.jpg`, createHash('sha256').update('page').digest('hex')]);
    const d = await call(tMaths, () => getSheet(req('GET', `/api/app/marking/sheets/${S1}`), sheetParams(S1)));
    expect(d).toMatchObject({ status: 200, body: { mayChange: true, sheet: { state: 'marked', flags: ['unsure'] } } });
    expect(d.body.pages.map((p: { url: string }) => p.url)).toEqual([`/api/app/marking/pages/${page}`]);
    expect(d.body.totals).toEqual([{ component: 'theory', name: 'Theory', score: 15, max: 20 }]);
    expect((await call(tOther, () => getSheet(req('GET', `/api/app/marking/sheets/${S1}`), sheetParams(S1)))).status).toBe(404);
    expect((await call(accountant, () => getSheet(req('GET', `/api/app/marking/sheets/${S1}`), sheetParams(S1)))).status).toBe(403);
    expect((await call(bPrincipal, () => getSheet(req('GET', `/api/app/marking/sheets/${S1}`), sheetParams(S1)))).status).toBe(404);
    expect((await call(tMaths, () => getSheet(req('GET', `/api/app/marking/sheets/not-one`), sheetParams('not-one')))).status).toBe(400);
  });

  it('a mark above the question is refused, one within it is kept in the teacher’s name; another class’s teacher cannot change or approve', async () => {
    const q2 = await q('2');
    const change = (marks: number) => call(tMaths, () => postSheet(req('POST', `/api/app/marking/sheets/${S1}`, { action: 'change', questions: [{ questionId: q2, marks, note: 'Right fraction, not simplified.' }] }), sheetParams(S1)));
    expect(await change(7)).toMatchObject({ status: 400, body: { code: 'marks', questionId: q2 } });
    expect(await change(5.5)).toMatchObject({ status: 200, body: { ok: true } });
    expect(await owner(`select marks::text, changed_by from marking_marks where sheet_id = $1 and question_id = $2`, [S1, q2])).toEqual([{ marks: '5.5', changed_by: T_MATHS }]);
    const body = { action: 'change', questions: [{ questionId: q2, marks: 1 }] };
    expect((await call(tOther, () => postSheet(req('POST', `/api/app/marking/sheets/${S1}`, body), sheetParams(S1)))).status).toBe(404);
    expect((await call(accountant, () => postSheet(req('POST', `/api/app/marking/sheets/${S1}`, body), sheetParams(S1)))).status).toBe(403);
    expect((await call(tMaths, () => postSheet(req('POST', `/api/app/marking/sheets/${S1}`, { action: 'dance' }), sheetParams(S1)))).status).toBe(400);
    expect((await call(tOther, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, { sheetIds: [S1] }), paramsOf(paperA)))).status).toBe(404);
    expect((await call(accountant, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, { sheetIds: [S1] }), paramsOf(paperA)))).status).toBe(403);
    expect((await owner(`select count(*)::int as n from marks where paper_id = $1`, [paperA]))[0].n).toBe(0);
  });

  it('“approve all” takes only the script with nothing flagged; approving the flagged one on its own writes the paper’s marks', async () => {
    const all = await call(tMaths, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, { all: 'unflagged' }), paramsOf(paperA)));
    expect(all).toMatchObject({ status: 200, body: { ok: true, approved: 1, skipped: 1 } });
    expect(await owner(`select student_id, component, kind, score::float8 as score, entered_by from marks where paper_id = $1`, [paperA])).toEqual([{ student_id: K3, component: 'theory', kind: 'score', score: 20, entered_by: T_MATHS }]);
    const one = await call(tMaths, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, { sheetIds: [S1] }), paramsOf(paperA)));
    expect(one).toMatchObject({ status: 200, body: { ok: true, approved: 1 } });
    // Theory: 3 + 5.5 + the better of 7 and 0 = 15.5. Internal is left for the teacher to type.
    expect(await owner(`select student_id, component, score::float8 as score, entered_by from marks where paper_id = $1 and student_id = $2`, [paperA, K1])).toEqual([{ student_id: K1, component: 'theory', score: 15.5, entered_by: T_MATHS }]);
    expect((await owner(`select approved_by from marking_sheets where sheet_id = $1`, [S1]))[0].approved_by).toBe(T_MATHS);
    expect((await call(tMaths, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, {}), paramsOf(paperA)))).status).toBe(400);
    expect((await call(tMaths, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, { sheetIds: ['x'] }), paramsOf(paperA)))).status).toBe(400);
  });

  it('a child with no script is marked absent, not zero; a child who has a script cannot be', async () => {
    expect(await call(tMaths, () => postAbsent(req('POST', `/api/app/marking/papers/${paperA}/absent`, { studentIds: [K1] }), paramsOf(paperA)))).toMatchObject({ status: 400, body: { code: 'child' } });
    expect((await call(tOther, () => postAbsent(req('POST', `/api/app/marking/papers/${paperA}/absent`, { studentIds: [K2] }), paramsOf(paperA)))).status).toBe(404);
    expect((await call(accountant, () => postAbsent(req('POST', `/api/app/marking/papers/${paperA}/absent`, { studentIds: [K2] }), paramsOf(paperA)))).status).toBe(403);
    expect(await call(tMaths, () => postAbsent(req('POST', `/api/app/marking/papers/${paperA}/absent`, { studentIds: [K2] }), paramsOf(paperA)))).toMatchObject({ status: 200, body: { ok: true, absent: 1 } });
    expect(await owner(`select component, kind, score from marks where paper_id = $1 and student_id = $2`, [paperA, K2])).toEqual([{ component: 'theory', kind: 'absent', score: null }]);
    const o = await call(tMaths, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)));
    expect(o.body.absent).toEqual([K2]);
    expect(o.body.sheets.map((s: { student: { name: string }; state: string; total: number }) => [s.student.name, s.state, s.total])).toEqual([['Meera Sharma', 'approved', 15.5], ['Dev Patel', 'approved', 20]]);
  });
});

describe('a published class is frozen', () => {
  it('the class result, once published, refuses every change with a 409: the questions, a script, an approval, an absence', async () => {
    // Every part of the paper entered: Internal is typed by hand for all three, as before.
    const internal = [K1, K2, K3].map((studentId) => ({ studentId, component: 'internal', kind: 'score', score: 4 }));
    expect((await call(tMaths, () => postPaper(req('POST', `/api/app/exams/papers/${paperA}`, { marks: internal }), paramsOf(paperA)))).status).toBe(200);
    expect(await as(principal, (c) => publishClass(c, actor(principal), examId, C7A))).toMatchObject({ ok: true });
    const q2 = (await owner(`select question_id from marking_questions where paper_id = $1 and label = '2'`, [paperA]))[0].question_id;
    expect(await call(tMaths, () => postSetup(req('POST', `/api/app/marking/papers/${paperA}/setup`, SETUP), paramsOf(paperA)))).toMatchObject({ status: 409, body: { code: 'closed' } });
    expect(await call(tMaths, () => postSheet(req('POST', `/api/app/marking/sheets/${S1}`, { action: 'change', questions: [{ questionId: q2, marks: 1 }] }), sheetParams(S1)))).toMatchObject({ status: 409, body: { code: 'closed' } });
    expect(await call(tMaths, () => postSheet(req('POST', `/api/app/marking/sheets/${S1}`, { action: 'aside' }), sheetParams(S1)))).toMatchObject({ status: 409, body: { code: 'closed' } });
    expect(await call(tMaths, () => postApprove(req('POST', `/api/app/marking/papers/${paperA}/approve`, { all: 'unflagged' }), paramsOf(paperA)))).toMatchObject({ status: 409, body: { code: 'closed' } });
    expect(await call(tMaths, () => postAbsent(req('POST', `/api/app/marking/papers/${paperA}/absent`, { studentIds: [K2] }), paramsOf(paperA)))).toMatchObject({ status: 409, body: { code: 'closed' } });
    // The screens still read it, and say so: the paper is published and cannot be marked.
    const o = await call(tMaths, () => getOverview(req('GET', `/api/app/marking/papers/${paperA}`), paramsOf(paperA)));
    expect(o.body.paper).toMatchObject({ published: true });
    const d = await call(tMaths, () => getSheet(req('GET', `/api/app/marking/sheets/${S1}`), sheetParams(S1)));
    expect(d.body).toMatchObject({ mayChange: false });
    // The paper's marks are still as they were approved.
    expect(await owner(`select score::float8 as score from marks where paper_id = $1 and student_id = $2 and component = 'theory'`, [paperA, K1])).toEqual([{ score: 15.5 }]);
  });
});
