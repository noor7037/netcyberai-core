import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { DEFAULT_EXAM_TYPES } from '@/lib/contracts/exam-types';
import { examTypeName, examTypesOf, offeredExamTypes } from '@/lib/exams/exam-types';
import { changeExam, examsScreen, makeExam } from '@/lib/exams/exams';
import { saveMarks } from '@/lib/exams/marks';
import { publishClass } from '@/lib/exams/publish';
import { reportCards } from '@/lib/exams/report-card';
import { classResult } from '@/lib/exams/results';
import { saveScheme } from '@/lib/exams/schemes';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings, saveSettings } from '@/lib/frameworks/settings-store';
import { finishListRows, type ListRow } from '@/lib/frameworks/list-rows';

// The school's exam types (C230-AJ part 2, C357), on the whole schema as the app's own database role. A school renames
// "Unit test", hides "Weekly test" and adds "Olympiad"; an exam made as Olympiad shows it; an exam made before types
// reads Other; and a scheme that counts Half-yearly at 40 and Annual at 60 gives the weighted result in the class
// result and on the report card. A scheme with no weights is exactly what it was. Every name and number is made up.

const u = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, T_CLASS, B_PRINCIPAL] = [u(11), u(12), u(21)];
const [C5A, CB] = [u(31), u(32)];
const [MATHS, ENGLISH] = [u(41), u(42)];
const SESSION = u(51);
const [K1, K2] = [u(71), u(72)];
const OLD_EXAM = u(91);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const tClass: Who = { role: 'teacher', user: T_CLASS, school: A };
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

const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'exams')!;
const LAYOUT = { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false };
const BANDS = [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }];
const V1 = { bands: BANDS, decimals: 0, passMark: 33, components: [], terms: [], layout: LAYOUT, coScholastic: null };

type Entry = { studentId: string; component: string; kind: string; score: number | null };
const score = (studentId: string, value: number): Entry => ({ studentId, component: 'marks', kind: 'score', score: value });
const absent = (studentId: string): Entry => ({ studentId, component: 'marks', kind: 'absent', score: null });
const paperOf = async (examId: string, subject: string) => (await owner(`select paper_id from exam_papers where exam_id = $1 and class_id = $2 and subject_id = $3`, [examId, C5A, subject]))[0].paper_id as string;
const make = async (name: string, examType: string | undefined, papers: [string, number][]) => {
  const r = await as(principal, (c) =>
    makeExam(c, actor(principal), { name, sessionId: SESSION, term: null, ...(examType === undefined ? {} : { examType }), papers: papers.map(([subjectId, max]) => ({ classId: C5A, subjectId, date: null, unitIds: [], maxima: { marks: max } })) })
  );
  if (!r.ok) throw new Error(`exam not made: ${r.reason}`);
  return r.examId;
};
// The paper ids are found once and kept (the lookup is async, saveMarks wants the id).
const papers = new Map<string, string>();
const find = async (examId: string, subjects: string[]) => {
  for (const s of subjects) papers.set(`${examId}|${s}`, await paperOf(examId, s));
};
// The class teacher of 5-A enters the marks.
const enter = async (examId: string, subject: string, marks: Entry[]) => {
  const r = await as(tClass, (c) => saveMarks(c, actor(tClass), papers.get(`${examId}|${subject}`) as string, marks));
  expect(r).toMatchObject({ ok: true });
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, board) values ('${A}', 'School A', 'IN-HR', 'CBSE'), ('${B}', 'School B', 'IN-DL', 'CBSE');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true),
      ('${T_CLASS}', '${A}', 'kiran@school-a.example', 'teacher', 'Kiran Classteacher', true),
      ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${T_CLASS}', 'Kiran Classteacher');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5A}', '${A}', '5', '5', 'A', '${T_CLASS}'), ('${CB}', '${B}', '5', '5', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${K1}', '${A}', 'A-01', 'Meera Madeup', '${C5A}', '1', 'active'), ('${K2}', '${A}', 'A-02', 'Zoya Madeup', '${C5A}', '2', 'active');
    insert into school_module_entitlements (school_id, module_id, enabled, source) select s, 'exams', true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s
      on conflict (school_id, module_id) do update set enabled = true;
    -- An exam made before exam types existed: no type is named, so it is "other".
    insert into exams (exam_id, school_id, name, session_id, created_by) values ('${OLD_EXAM}', '${A}', 'Old unit test', '${SESSION}', '${PRINCIPAL}');
  `);
  await owner(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(V1), PRINCIPAL]);
}, 120_000);
afterAll(async () => db?.stop());

describe('the school’s own exam types', () => {
  it('start as the defaults, "Other" last; an exam made before types reads Other', async () => {
    const types = await as(principal, (c) => examTypesOf(c, A));
    expect(types.map((t) => t.key)).toEqual(DEFAULT_EXAM_TYPES.map((t) => t.key));
    expect(types.at(-1)).toMatchObject({ key: 'other', en: 'Other' });
    const screen = (await as(principal, (c) => examsScreen(c, actor(principal), null)))!;
    expect(screen.exams.find((e) => e.examId === OLD_EXAM)).toMatchObject({ examType: 'other' });
    expect(examTypeName(screen.examTypes, 'other', 'en')).toBe('Other');
    expect(examTypeName(screen.examTypes, 'other', 'hi')).toBe('अन्य');
  });

  it('an exam type the school does not have is refused', async () => {
    const r = await as(principal, (c) => makeExam(c, actor(principal), { name: 'Olympiad 1', sessionId: SESSION, term: null, examType: 'olympiad', papers: [{ classId: C5A, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 20 } }] }));
    expect(r).toEqual({ ok: false, reason: 'exam_type' });
  });

  it('the school renames "Unit test", hides "Weekly test" and adds "Olympiad"; the engine takes the list as the screen sends it', async () => {
    const current = (await as(principal, (c) => readSettings(c, A, schema))).effective.exam_types as ListRow[];
    // What the settings screen does: the person edits the rows; a new row has no code yet and gets one on saving.
    const edited: ListRow[] = current.map((r) => (r.key === 'unit' ? { ...r, en: 'Class test', hi: 'कक्षा परीक्षा' } : r.key === 'weekly' ? { ...r, hidden: true } : r));
    edited.splice(edited.length - 1, 0, { key: '', en: ' Olympiad ', hi: 'ओलंपियाड', hidden: false });
    const sent = finishListRows(schema.fields.find((f) => f.key === 'exam_types')!, edited);
    expect(sent.find((r) => r.en === 'Olympiad')).toMatchObject({ key: 'olympiad', hi: 'ओलंपियाड', hidden: false });
    const saved = await as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'exams', baseRevision: 0, set: { exam_types: sent as never } }));
    expect(saved).toMatchObject({ ok: true });
    const types = await as(principal, (c) => examTypesOf(c, A));
    expect(types.find((t) => t.key === 'unit')).toMatchObject({ en: 'Class test', hi: 'कक्षा परीक्षा' });
    expect(types.find((t) => t.key === 'weekly')).toMatchObject({ hidden: true });
    expect(types.map((t) => t.key)).toContain('olympiad');
    expect(types.at(-1)!.key).toBe('other');
    expect(offeredExamTypes(types).map((t) => t.key)).not.toContain('weekly');
    // The engine refuses a list with a bad or repeated code, or a hidden type that is not a yes/no.
    const bad = (rows: ListRow[]) => as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'exams', baseRevision: 1, set: { exam_types: rows as never } }));
    expect(await bad([{ key: 'Bad Code', en: 'X', hi: 'X', hidden: false }])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await bad([{ key: 'one', en: 'X', hi: 'X', hidden: false }, { key: 'one', en: 'Y', hi: 'Y', hidden: false }])).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await bad([{ key: 'one', en: 'X', hi: 'X', hidden: 'no' }] as never)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('an exam is made as Olympiad and shows it; a hidden type is not offered for a new exam; no type is "other"', async () => {
    const olympiad = await make('Olympiad 1', 'olympiad', [[MATHS, 20]]);
    const plain = await make('Plain test', undefined, [[MATHS, 20]]);
    const screen = (await as(principal, (c) => examsScreen(c, actor(principal), null)))!;
    expect(screen.exams.find((e) => e.examId === olympiad)).toMatchObject({ examType: 'olympiad' });
    expect(screen.exams.find((e) => e.examId === plain)).toMatchObject({ examType: 'other' });
    expect(examTypeName(screen.examTypes, 'olympiad', 'en')).toBe('Olympiad');
    expect(examTypeName(screen.examTypes, 'unit', 'en')).toBe('Class test');
    const hidden = await as(principal, (c) => makeExam(c, actor(principal), { name: 'Weekly 1', sessionId: SESSION, term: null, examType: 'weekly', papers: [{ classId: C5A, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 20 } }] }));
    expect(hidden).toEqual({ ok: false, reason: 'exam_type' });
    expect((await owner(`select after_state from audit_log where event_action = 'exam.made' and target_id = $1`, [olympiad]))[0].after_state).toMatchObject({ exam_type: 'olympiad' });
  });

  it('the office changes an exam’s type; an exam keeps a type hidden since; another school’s exam is not found; a published exam’s type is frozen', async () => {
    const id = await make('Type change test', 'unit', [[MATHS, 20]]);
    expect(await as(principal, (c) => changeExam(c, actor(principal), id, { action: 'type', examType: 'periodic' }))).toEqual({ ok: true, examId: id });
    expect((await owner(`select exam_type from exams where exam_id = $1`, [id]))[0].exam_type).toBe('periodic');
    expect((await owner(`select after_state from audit_log where event_action = 'exam.type_changed' and target_id = $1`, [id]))[0].after_state).toMatchObject({ from_type: 'unit', to_type: 'periodic' });
    // Not a type of the school, nor a hidden one it does not already have.
    expect(await as(principal, (c) => changeExam(c, actor(principal), id, { action: 'type', examType: 'nope' }))).toEqual({ ok: false, reason: 'exam_type' });
    expect(await as(principal, (c) => changeExam(c, actor(principal), id, { action: 'type', examType: 'weekly' }))).toEqual({ ok: false, reason: 'exam_type' });
    // A teacher and another school's principal cannot.
    expect(await as(tClass, (c) => changeExam(c, actor(tClass), id, { action: 'type', examType: 'unit' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(bPrincipal, (c) => changeExam(c, actor(bPrincipal), id, { action: 'type', examType: 'unit' }))).toEqual({ ok: false, reason: 'not_found' });
    // Hiding "Periodic test" does not change the exam that has it; the exam is still offered that type.
    await owner(`update exams set exam_type = 'weekly' where exam_id = $1`, [id]);
    expect(await as(principal, (c) => changeExam(c, actor(principal), id, { action: 'type', examType: 'weekly' }))).toEqual({ ok: true, examId: id });
    // Published for its class: frozen.
    await find(id, [MATHS]);
    await enter(id, MATHS, [score(K1, 10), score(K2, 12)]);
    expect(await as(principal, (c) => publishClass(c, actor(principal), id, C5A))).toMatchObject({ ok: true });
    expect(await as(principal, (c) => changeExam(c, actor(principal), id, { action: 'type', examType: 'unit' }))).toEqual({ ok: false, reason: 'published' });
  });
});

describe('a scheme that counts exam types toward a report card', () => {
  let HY = '';
  let ANNUAL = '';
  let WEEKLY = '';
  it('is saved with its weights (adding to 100, of the school’s own types); one that is not is refused', async () => {
    const save = (examTypes: unknown, basedOn = 1) => as(principal, (c) => saveScheme(c, actor(principal), { scheme: { ...V1, ...(examTypes === undefined ? {} : { examTypes }) }, fromPresetId: null, basedOn }));
    expect(await save([{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 50 }])).toEqual({ ok: false, reason: 'exam_type_total' });
    expect(await save([{ type: 'half_yearly', weight: 40 }, { type: 'half_yearly', weight: 60 }])).toEqual({ ok: false, reason: 'exam_type_duplicate', at: 1 });
    expect(await save([{ type: 'half_yearly', weight: 0 }, { type: 'annual', weight: 100 }])).toEqual({ ok: false, reason: 'exam_type_weight', at: 0 });
    expect(await save([{ type: 'Bad Key', weight: 100 }])).toEqual({ ok: false, reason: 'exam_type_key', at: 0 });
    expect(await save([{ type: 'not_a_type_here', weight: 100 }])).toEqual({ ok: false, reason: 'exam_type_key', at: 0 });
    expect(await save([{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 60 }])).toEqual({ ok: true, version: 2 });
    expect((await owner(`select scheme from grading_schemes where school_id = $1 and version = 2`, [A]))[0].scheme.examTypes).toEqual([{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 60 }]);
  });

  it('the class result: Half-yearly 40 and Annual 60 give the weighted result; a type not yet entered leaves it "not entered"', async () => {
    HY = await make('Half-yearly 2026', 'half_yearly', [[MATHS, 50], [ENGLISH, 50]]);
    ANNUAL = await make('Annual 2027', 'annual', [[MATHS, 100], [ENGLISH, 100]]);
    WEEKLY = await make('Weekly 9', 'other', [[MATHS, 20]]);
    await find(HY, [MATHS, ENGLISH]);
    await find(ANNUAL, [MATHS, ENGLISH]);
    await find(WEEKLY, [MATHS]);
    // Half-yearly: Meera Mathematics 25 of 50 (50 percent), English 40 of 50 (80); Zoya 30 (60) and 20 (40).
    await enter(HY, MATHS, [score(K1, 25), score(K2, 30)]);
    await enter(HY, ENGLISH, [score(K1, 40), score(K2, 20)]);
    const early = (await as(principal, (c) => classResult(c, actor(principal), HY, C5A)))!;
    expect(early.weighted).toMatchObject({ weights: [{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 60 }], exams: [{ name: 'Half-yearly 2026', examType: 'half_yearly' }, { name: 'Annual 2027', examType: 'annual' }] });
    const meeraEarly = early.children.find((c) => c.studentId === K1)!;
    expect(meeraEarly.weighted!.types).toEqual([{ type: 'half_yearly', percent: 65 }, { type: 'annual', percent: null }]);
    expect(meeraEarly.weighted!.overall).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
    // Annual: Meera Mathematics 80 of 100, English 70; Zoya was absent in both.
    await enter(ANNUAL, MATHS, [score(K1, 80), absent(K2)]);
    await enter(ANNUAL, ENGLISH, [score(K1, 70), absent(K2)]);
    const full = (await as(principal, (c) => classResult(c, actor(principal), HY, C5A)))!;
    const meera = full.children.find((c) => c.studentId === K1)!.weighted!;
    // Mathematics 0.4 x 50 + 0.6 x 80 = 68; English 0.4 x 80 + 0.6 x 70 = 74; overall: Half-yearly (25+40)/100 = 65,
    // Annual (80+70)/200 = 75, so 0.4 x 65 + 0.6 x 75 = 71.
    expect(Object.fromEntries(meera.subjects.map((s) => [s.subjectName, [s.result.percent, s.result.grade]]))).toEqual({
      Mathematics: [68, { kind: 'grade', grade: 'B', meaning: null }],
      English: [74, { kind: 'grade', grade: 'B', meaning: null }],
    });
    expect(meera.types).toEqual([{ type: 'half_yearly', percent: 65 }, { type: 'annual', percent: 75 }]);
    expect(meera.overall).toMatchObject({ percent: 71, rounded: 71, grade: { kind: 'grade', grade: 'B' } });
    // Zoya was absent throughout the Annual: no marks there, so no weighted result, and no invented one.
    const zoya = full.children.find((c) => c.studentId === K2)!.weighted!;
    expect(zoya.types).toEqual([{ type: 'half_yearly', percent: 50 }, { type: 'annual', percent: null }]);
    expect(zoya.overall).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
    // The exam's own result is what it was: its percent and grade by the scheme, untouched.
    expect(full.children.find((c) => c.studentId === K1)!.overall).toMatchObject({ percent: 65 });
    // An exam of a type that does not count has no weighted result.
    const weekly = (await as(principal, (c) => classResult(c, actor(principal), WEEKLY, C5A)))!;
    expect(weekly.weighted).toBeUndefined();
    expect(weekly.children[0].weighted).toBeUndefined();
  });

  it('the report card: the weighted result rests on the exams published for the class, and an exam of a type that does not count has none', async () => {
    const cards = async (exam: string) => {
      const r = await as(principal, (c) => reportCards(c, actor(principal), exam, C5A, null));
      if (!r.ok) throw new Error(r.reason);
      return r.set;
    };
    await enter(WEEKLY, MATHS, [score(K1, 15), score(K2, 10)]);
    expect(await as(principal, (c) => publishClass(c, actor(principal), HY, C5A))).toMatchObject({ ok: true });
    // Annual is not published yet: the Half-yearly card cannot yet say the weighted result.
    const hyCards = await cards(HY);
    expect(hyCards.weighted?.exams.map((e) => e.name)).toEqual(['Half-yearly 2026']);
    expect(hyCards.cards.find((c) => c.studentId === K1)!.weighted!.overall).toMatchObject({ percent: null, grade: { kind: 'no_grade', reason: 'not_entered' } });
    expect(await as(principal, (c) => publishClass(c, actor(principal), ANNUAL, C5A))).toMatchObject({ ok: true });
    const annual = await cards(ANNUAL);
    expect(annual.weighted?.weights).toEqual([{ type: 'half_yearly', weight: 40 }, { type: 'annual', weight: 60 }]);
    const meera = annual.cards.find((c) => c.studentId === K1)!;
    expect(Object.fromEntries(meera.weighted!.subjects.map((s) => [s.subjectName, s.result.percent]))).toEqual({ Mathematics: 68, English: 74 });
    expect(meera.weighted!.overall).toMatchObject({ percent: 71, grade: { kind: 'grade', grade: 'B' } });
    // The card's own marks and result are what they were: the Annual alone.
    expect(meera.overall).toMatchObject({ percent: 75, grade: { kind: 'grade', grade: 'A' } });
    expect(annual.cards.find((c) => c.studentId === K2)!.weighted!.overall).toMatchObject({ percent: null });
    // The Half-yearly card now has both published, so it says it too, from the same marks.
    expect((await cards(HY)).cards.find((c) => c.studentId === K1)!.weighted!.overall).toMatchObject({ percent: 71 });
    // A weekly test is not a counted type: its card has no weighted result at all.
    expect(await as(principal, (c) => publishClass(c, actor(principal), WEEKLY, C5A))).toMatchObject({ ok: true });
    const weekly = await cards(WEEKLY);
    expect(weekly.weighted).toBeUndefined();
    expect(weekly.cards.every((c) => c.weighted === undefined)).toBe(true);
  });

  it('with no type weights set, nothing is added to a result or a card', async () => {
    // Version 3 counts no type: the same scheme as the first.
    expect(await as(principal, (c) => saveScheme(c, actor(principal), { scheme: V1, fromPresetId: null, basedOn: 2 }))).toEqual({ ok: true, version: 3 });
    const none = await make('Half-yearly 2 2026', 'half_yearly', [[MATHS, 50]]);
    await find(none, [MATHS]);
    await enter(none, MATHS, [score(K1, 30), score(K2, 20)]);
    const result = (await as(principal, (c) => classResult(c, actor(principal), none, C5A)))!;
    expect(result.weighted).toBeUndefined();
    expect(result.children.every((c) => !('weighted' in c))).toBe(true);
    expect(await as(principal, (c) => publishClass(c, actor(principal), none, C5A))).toMatchObject({ ok: true });
    const r = await as(principal, (c) => reportCards(c, actor(principal), none, C5A, null));
    expect(r.ok && r.set.weighted === undefined && r.set.cards.every((c) => !('weighted' in c))).toBe(true);
    expect((await owner(`select scheme from exam_publications where exam_id = $1`, [none]))[0].scheme).not.toHaveProperty('examTypes');
  });
});
