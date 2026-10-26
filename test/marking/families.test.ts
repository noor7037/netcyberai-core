import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// AM-4 (C351): what families get from AI answer-sheet marking, on the whole schema through the real pool. A linked
// guardian reads only their own child's checked paper of a publication in force, question by question; nothing while the
// school's "families see the checked answer sheets" is off; nothing once the class is reopened; the family's page
// route answers 404 for another child's page or a link that is not this family's; the child's own view follows
// "children see their own results"; the private report link opens one child's result, and a wrong, expired or reopened
// one opens the same nothing; the exam timetable comes only for one's own child. Every name and number is made up.

// The store holds two page pictures: S1's first page and S2's page (the routes read them through this stand-in).
const STORED = new Map<string, Uint8Array>();
vi.mock('@/lib/storage/supabase-file-storage', () => ({ supabaseFileStorage: { get: async (key: string) => STORED.get(key) ?? null } }));

const u = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B] = [u(1), u(2)];
const [PRINCIPAL, TEACHER, B_PRINCIPAL] = [u(11), u(12), u(13)];
const C6A = u(21);
const MATH = u(31);
const [U1, U2] = [u(41), u(42)];
const [S1, S2] = [u(51), u(52)];
const [P1, P2] = [u(61), u(62)];
const [X1, X2] = [u(71), u(72)];
const [PP1, PP2] = [u(81), u(82)];
const [Q1, Q2, Q3A, Q3B] = [u(91), u(92), u(93), u(94)];
const UP = u(101);
const [SH1, SH2] = [u(111), u(112)];
const [G1A, G1B, G2A] = [u(121), u(122), u(123)];
const [ACCOUNT, OTHER] = ['f8000000-0000-4000-8000-0000000000a1', 'f8000000-0000-4000-8000-0000000000b1'];
const [CHILD, SIBLING, OTHER_CHILD] = ['f8000000-0000-4000-8000-0000000000c1', 'f8000000-0000-4000-8000-0000000000c2', 'f8000000-0000-4000-8000-0000000000c3'];
const [LINK, LINK_O] = ['f8000000-0000-4000-8000-0000000000d1', 'f8000000-0000-4000-8000-0000000000d2'];
const key = (page: string) => `${A}/marking/${PP1}/${page}.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const SCHEME = {
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 0, to: 49, grade: 'C', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [{ key: 'written', kind: 'theory', name: 'Written', share: 100, passMark: null, parts: [] }],
  terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
  coScholastic: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cookie = '';
let childCookie = '';
let otherCookie = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const otherClaims = { accountId: OTHER, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = <T>(role: string, user: string, school: string, fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': school, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const setting = async (values: Record<string, boolean> | null) => {
  await q(`delete from school_settings where school_id = $1 and module_id = 'exams'`, [A]);
  if (values) await q(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'exams', 1, $2::jsonb)`, [A, JSON.stringify(values)]);
};
const pageRoute = async (pageId: string, c = cookie) => {
  const mod = await import('@/app/api/family/school/marking/pages/[pageId]/route');
  const res = await mod.GET(new NextRequest(`http://localhost/api/family/school/marking/pages/${pageId}`, { headers: { cookie: c } }), { params: { pageId } });
  return { status: res.status as number, type: res.headers.get('content-type'), cache: res.headers.get('cache-control'), bytes: res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : null };
};
const reportRoute = async (k: string, pageId: string) => {
  const mod = await import('@/app/api/public/results/[key]/pages/[pageId]/route');
  const res = await mod.GET(new Request(`http://localhost/api/public/results/${k}/pages/${pageId}`), { params: { key: k, pageId } });
  return { status: res.status as number, robots: res.headers.get('x-robots-tag'), cache: res.headers.get('cache-control') };
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-am-4-family-tests-0123456789ab';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${B_PRINCIPAL}', '${B}', 'p@b.invalid', 'principal', 'Bela Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${B_PRINCIPAL}', '${B}', 'principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${MATH}', '${A}', 'Mathematics');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', '1', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6A}', '2', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${U1}', '${A}', '${C6A}', '${MATH}', 1, 'Fractions', 'Adding fractions'), ('${U2}', '${A}', '${C6A}', '${MATH}', 2, 'Decimals', 'Tenths');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, created_by) values ('${X1}', '${A}', 'Half-yearly', 'Term 1', '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, created_by, numbering, seat_prefix) values ('${X2}', '${A}', 'Unit test 2', 'Term 1', '${PRINCIPAL}', 'seat', 'UT');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by) values
      ('${PP1}', '${A}', '${X1}', '${C6A}', '${MATH}', current_date - 20, '{}', '[{"key":"written","name":"Written","max":20,"share":null}]', '${PRINCIPAL}'),
      ('${PP2}', '${A}', '${X2}', '${C6A}', '${MATH}', (now() at time zone 'Asia/Kolkata')::date + 3, '{}', '[{"key":"written","name":"Written","max":20,"share":null}]', '${PRINCIPAL}');
    insert into marking_setups (school_id, paper_id, language, guidance, choice_counts, updated_by) values ('${A}', '${PP1}', 'en', 'TEACHER-GUIDANCE', '{"A": 1}', '${TEACHER}');
    insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, choice_group, unit_id, kind, prompt, answer_key, steps, updated_by) values
      ('${A}', '${Q1}', '${PP1}', 1, '1', 'written', 5, null, '${U1}', 'short', 'Add 1/2 and 1/4.', 'SECRET-KEY', '[{"step":"SECRET-STEP","marks":2}]', '${TEACHER}'),
      ('${A}', '${Q2}', '${PP1}', 2, '2', 'written', 5, null, '${U2}', 'short', 'Write 0.7 as a fraction.', 'SECRET-KEY', '[]', '${TEACHER}'),
      ('${A}', '${Q3A}', '${PP1}', 3, '3(a)', 'written', 10, 'A', '${U1}', 'long', 'Fractions on a number line.', '', '[]', '${TEACHER}'),
      ('${A}', '${Q3B}', '${PP1}', 4, '3(b)', 'written', 10, 'A', '${U2}', 'long', 'Decimals in money.', '', '[]', '${TEACHER}');
    insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by, closed_at) values ('${A}', '${UP}', '${PP1}', 'per_file', '${TEACHER}', now());
  `);
  await q(`select set_config('app.current_user_id', $1, false), set_config('app.current_role', 'teacher', false)`, [TEACHER]);
  for (const [sheet, student] of [[SH1, S1], [SH2, S2]]) {
    await q(
      `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, match_note, state, ai_provider, ai_model, strengths, improve, practice)
       values ($1, $2, $3, $4, $5, 'roll', '{"read":{"name":"SECRET-READ"}}', 'marked', 'stand-in', 'SECRET-MODEL', 'Neat working.', 'Show each step.', $6::jsonb)`,
      [A, sheet, PP1, UP, student, JSON.stringify([{ unitId: U1, text: 'Five sums adding fractions.' }])]
    );
  }
  for (const [page, sheet, pos, file] of [[G1A, SH1, 1, 1], [G1B, SH1, 2, 1], [G2A, SH2, 1, 2]] as const) {
    await q(
      `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state, reading, sheet_id, sheet_position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 1000, 1400, 2000, 'read', '{"name":"SECRET-READ"}', $9, $6)`,
      [A, page, UP, PP1, file, pos, key(page), createHash('sha256').update(page).digest('hex'), sheet]
    );
  }
  const mark = (sheet: string, question: string, v: Record<string, unknown>) =>
    q(
      `insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, ai_note, ai_reason, error_type, confidence, page_id, y_from, y_to, marks, note)
       values ($1, $2, $3, $4, $5, $6, $7, 'SECRET-REASON', $8, 0.9, $9, $10, $11, $12, $13)`,
      [A, sheet, PP1, question, v.attempted ?? true, v.ai, v.aiNote ?? null, v.error ?? 'none', v.page ?? null, v.y0 ?? null, v.y1 ?? null, v.marks ?? null, v.note ?? null]
    );
  // Aarav: Q1 the AI gave 4, the teacher 5 with her own note; Q2 3 with the AI's note; 3(a) 7; 3(b) not attempted.
  await mark(SH1, Q1, { ai: 4, aiNote: 'AI note one.', marks: 5, note: 'Well done, all steps.', page: G1A, y0: 0.1, y1: 0.3 });
  await mark(SH1, Q2, { ai: 3, aiNote: 'Simplify the fraction.', error: 'incomplete', page: G1A, y0: 0.5, y1: 0.7 });
  await mark(SH1, Q3A, { ai: 7, error: 'calculation', page: G1B, y0: 0.2, y1: 0.6 });
  await mark(SH1, Q3B, { ai: 0, attempted: false, error: 'not_attempted' });
  await mark(SH2, Q1, { ai: 2, page: G2A, y0: 0.1, y1: 0.2 });
  await mark(SH2, Q2, { ai: 2 });
  await mark(SH2, Q3A, { ai: 0, attempted: false, error: 'not_attempted' });
  await mark(SH2, Q3B, { ai: 8 });
  await q(`update marking_sheets set state = 'approved', approved_at = now() where sheet_id in ($1, $2)`, [SH1, SH2]);
  await q(`select set_config('app.current_user_id', '', false), set_config('app.current_role', '', false)`);
  await db.pg.exec(`
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values
      ('${A}', '${X1}', '${MATH}', '${PP1}', 'written', '${S1}', 'score', 15, 0, '${TEACHER}'), ('${A}', '${X1}', '${MATH}', '${PP1}', 'written', '${S2}', 'score', 12, 0, '${TEACHER}');
    update exam_papers set entered_at = now(), entered_by = '${TEACHER}' where paper_id = '${PP1}';
    insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ('${A}', '${X1}', '${C6A}', 1, 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${SIBLING}', '${ACCOUNT}', 'Isha', 3, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${OTHER_CHILD}', '${OTHER}', 'Bela', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.school_links (link_id, account_id, school_id, parent_id) values ('${LINK}', '${ACCOUNT}', '${A}', '${P1}'), ('${LINK_O}', '${OTHER}', '${A}', '${P2}');
    insert into family.child_links (child_id, link_id, account_id, student_id) values ('${CHILD}', '${LINK}', '${ACCOUNT}', '${S1}'), ('${OTHER_CHILD}', '${LINK_O}', '${OTHER}', '${S2}');
  `);
  STORED.set(key(G1A), JPEG);
  STORED.set(key(G2A), JPEG);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  cookie = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
  childCookie = `ncf_session=${await signFamilySession(s)}; ncf_child=${CHILD}`;
  const o = { accountId: OTHER, tokenVersion: 0, sessionId: 's2' };
  otherCookie = `ncf_session=${await signFamilySession(o)}; ncf_parent=${await signParentMode(o)}`;
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const links = async (account = ACCOUNT) => {
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { activeLinks } = await import('@/lib/family/school');
  return withFamilyContext({ accountId: account, tokenVersion: 0 }, (c) => activeLinks(c, account));
};

describe('School Link: a checked paper, read as the guardian (C351)', () => {
  it('the guardian reads their own child’s paper question by question, with only what a family needs', async () => {
    const { schoolPaperFor } = await import('@/lib/family/school');
    const paper = await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: false });
    expect(paper).toMatchObject({ paperId: PP1, exam: 'Half-yearly', term: 'Term 1', subject: 'Mathematics', publishedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    // 5 (the teacher's) + 3 + the better of 7 and 0: the setup row is not the guardian's to read, so the questions'
    // own structure says that one of 3(a) and 3(b) counts.
    expect(paper?.parts).toEqual([{ component: 'written', name: 'Written', score: 15, max: 20 }]);
    expect(paper?.questions.map((x) => [x.label, x.marks, x.max, x.counted, x.mistake, x.topic])).toEqual([
      ['1', 5, 5, true, 'none', 'Adding fractions'],
      ['2', 3, 5, true, 'incomplete', 'Tenths'],
      ['3(a)', 7, 10, true, 'calculation', 'Adding fractions'],
      ['3(b)', 0, 10, false, 'not_attempted', 'Tenths'],
    ]);
    expect(paper?.questions[0]).toMatchObject({ question: 'Add 1/2 and 1/4.', note: 'Well done, all steps.', chapter: 'Fractions', place: { pageId: G1A, yFrom: expect.closeTo(0.1, 5), yTo: expect.closeTo(0.3, 5) } });
    expect(paper?.questions[1].note).toBe('Simplify the fraction.');
    expect(paper?.strengths).toBe('Neat working.');
    expect(paper?.practice).toEqual([{ text: 'Five sums adding fractions.', chapter: 'Fractions', topic: 'Adding fractions' }]);
    expect(paper?.pages).toEqual([{ pageId: G1A, width: 1400, height: 2000 }, { pageId: G1B, width: 1400, height: 2000 }]);
    // Never the answer key, the steps, the AI's reasons, what it read, the setup's guidance, or the provider and model.
    expect(JSON.stringify(paper)).not.toMatch(/SECRET|TEACHER-GUIDANCE|stand-in/);
  });

  it('only the guardian’s own child: a classmate’s script, an unmatched child and another family read nothing', async () => {
    const { readSchoolPaper } = await import('@/lib/school-link');
    const { schoolPaperFor } = await import('@/lib/family/school');
    expect(await readSchoolPaper(claims, LINK, S2, PP1, { childView: false })).toBeNull();
    expect(await schoolPaperFor(claims, await links(), SIBLING, PP1, { childView: false })).toBeNull();
    expect(await schoolPaperFor(otherClaims, await links(), CHILD, PP1, { childView: false })).toBeNull();
    // The other family reads its own child's, which is a different script of the same paper.
    const theirs = await schoolPaperFor(otherClaims, await links(OTHER), OTHER_CHILD, PP1, { childView: false });
    expect(theirs?.questions.map((x) => [x.label, x.marks, x.counted])).toEqual([['1', 2, true], ['2', 2, true], ['3(a)', 0, false], ['3(b)', 8, true]]);
    expect(theirs?.pages.map((p) => p.pageId)).toEqual([G2A]);
  });

  it('the published result says which subject opens its checked paper; the timetable is the child’s own, with their number', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const school = await linkedSchool(claims, LINK, [S1]);
    const child = school?.children.find((c) => c.studentId === S1);
    expect(child?.results?.[0].subjects).toEqual([{ name: 'Mathematics', percent: 75, grade: 'A', paperId: PP1, checked: true }]);
    expect(child?.examSchedule).toEqual([{ exam: 'Unit test 2', subject: 'Mathematics', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), seatNo: 'UT0001' }]);
    const theirs = (await linkedSchool(otherClaims, LINK_O, [S2]))?.children.find((c) => c.studentId === S2);
    expect(theirs?.examSchedule?.map((p) => p.seatNo)).toEqual(['UT0002']);
    // An unmatched child gets no timetable at all.
    expect((await linkedSchool(claims, LINK, []))?.children.map((c) => c.examSchedule)).toEqual([null]);
  });

  it('the page route streams the family’s own child’s page, and the same 404 for anything else', async () => {
    expect(await pageRoute(G1A)).toEqual({ status: 200, type: 'image/jpeg', cache: 'private, max-age=300', bytes: JPEG });
    // Another child's page, a page of no script, the other family on this family's page, no session.
    expect((await pageRoute(G2A)).status).toBe(404);
    expect((await pageRoute(u(999))).status).toBe(404);
    expect((await pageRoute(G1A, otherCookie)).status).toBe(404);
    expect((await pageRoute(G2A, otherCookie)).status).toBe(200);
    expect((await pageRoute('not-a-page')).status).toBe(404);
    expect((await pageRoute(G1A, '')).status).toBe(401);
  });

  it('the child’s own view follows “children see their own results”; the child on the phone sees only their own', async () => {
    const { childResultsFor, schoolPaperFor, schoolTodayFor } = await import('@/lib/family/school');
    expect((await childResultsFor(claims, await links(), CHILD))?.results[0].subjects[0]).toMatchObject({ paperId: PP1, checked: true });
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: true })).not.toBeNull();
    expect((await schoolTodayFor(claims, await links(), CHILD, { withResults: true }))?.myResults).toBe(true);
    expect((await pageRoute(G1A, childCookie)).status).toBe(200);
    // The brother on the same phone reaches nothing of Aarav's.
    expect((await pageRoute(G1A, `${childCookie.replace(CHILD, SIBLING)}`)).status).toBe(404);
    await setting({ children_see_results: false });
    expect(await childResultsFor(claims, await links(), CHILD)).toBeNull();
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: true })).toBeNull();
    expect((await schoolTodayFor(claims, await links(), CHILD, { withResults: true }))?.myResults).toBe(false);
    expect((await pageRoute(G1A, childCookie)).status).toBe(404);
    // The parent still sees it in the parent area.
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: false })).not.toBeNull();
    expect((await pageRoute(G1A)).status).toBe(200);
    await setting(null);
  });

  it('nothing of the checked sheets while the school’s “families see the checked answer sheets” is off', async () => {
    const { linkedSchool, schoolPaperFor } = await import('@/lib/family/school');
    await setting({ families_see_scripts: false });
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: false })).toBeNull();
    expect((await linkedSchool(claims, LINK, [S1]))?.children[0].results?.[0].subjects[0]).toMatchObject({ percent: 75, checked: false });
    expect((await pageRoute(G1A)).status).toBe(404);
    await setting(null);
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: false })).not.toBeNull();
  });

  it('a script changed after approval stays away until it is approved again', async () => {
    const { schoolPaperFor } = await import('@/lib/family/school');
    await q(`update marking_sheets set flags = '{changed}' where sheet_id = $1`, [SH1]);
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: false })).toBeNull();
    expect((await pageRoute(G1A)).status).toBe(404);
    await q(`update marking_sheets set flags = '{}' where sheet_id = $1`, [SH1]);
  });
});

describe('the private report link (C351)', () => {
  let reportKey = '';
  it('only the office makes one, for the publication in force; the key is given once and kept as its hash', async () => {
    const { makeReportLink } = await import('@/lib/marking/report-links');
    const office = { schoolId: A, userId: PRINCIPAL, role: 'principal' as const };
    expect(await asStaff('teacher', TEACHER, A, (c) => makeReportLink(c, { schoolId: A, userId: TEACHER, role: 'teacher' }, X1, C6A, S1))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await asStaff('principal', PRINCIPAL, A, (c) => makeReportLink(c, office, X2, C6A, S1))).toEqual({ ok: false, reason: 'not_published' });
    expect(await asStaff('principal', B_PRINCIPAL, B, (c) => makeReportLink(c, { schoolId: B, userId: B_PRINCIPAL, role: 'principal' }, X1, C6A, S1))).toEqual({ ok: false, reason: 'not_found' });
    const made = await asStaff('principal', PRINCIPAL, A, (c) => makeReportLink(c, office, X1, C6A, S1));
    expect(made).toMatchObject({ ok: true, version: 1, key: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    reportKey = (made as { key: string }).key;
    expect(await q(`select key_hash from marking_report_links where student_id = $1`, [S1])).toEqual([{ key_hash: createHash('sha256').update(reportKey).digest('hex') }]);
    expect(JSON.stringify(await q(`select after_state from audit_log where event_action = 'marking.report_link_made'`))).not.toContain(reportKey);
    // One link per child and publication.
    expect(await asStaff('principal', PRINCIPAL, A, (c) => makeReportLink(c, office, X1, C6A, S1))).toEqual({ ok: false, reason: 'exists' });
    // Never for a child whose records the school holds no consent for, as School Link.
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) values ($1, $2, 'core_records', false, 'school_attested', 'v1', now() + interval '1 second')`, [A, S2]);
    expect(await asStaff('principal', PRINCIPAL, A, (c) => makeReportLink(c, office, X1, C6A, S2))).toEqual({ ok: false, reason: 'no_consent' });
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) values ($1, $2, 'core_records', true, 'school_attested', 'v1', now() + interval '2 seconds')`, [A, S2]);
  });

  it('a valid key shows the child’s result: first name, class, marks and grade, and the checked paper', async () => {
    const { withPlatformService } = await import('@/lib/auth/db');
    const { readReport } = await import('@/lib/marking/report-links');
    const view = await withPlatformService((c) => readReport(c, reportKey));
    expect(view).toMatchObject({ schoolName: 'School A', firstName: 'Aarav', className: '6-A', exam: 'Half-yearly', overall: { percent: 75, grade: 'A' } });
    expect(view?.subjects).toEqual([{ paperId: PP1, name: 'Mathematics', parts: [{ name: 'Written', mark: { kind: 'score', score: 15 }, max: 20 }], percent: 75, grade: 'A' }]);
    expect(view?.papers[0].questions.map((x) => [x.label, x.marks, x.counted])).toEqual([['1', 5, true], ['2', 3, true], ['3(a)', 7, true], ['3(b)', 0, false]]);
    expect(view?.papers[0].pages.map((p) => p.pageId)).toEqual([G1A, G1B]);
    expect(JSON.stringify(view)).not.toMatch(/SECRET|TEACHER-GUIDANCE|stand-in|Kumar|Bela/);
    expect(await reportRoute(reportKey, G1A)).toEqual({ status: 200, robots: 'noindex, nofollow', cache: 'private, no-store' });
  });

  it('its page route refuses another child’s page; a wrong key reads nothing, whatever its shape', async () => {
    const { withPlatformService } = await import('@/lib/auth/db');
    const { readReport } = await import('@/lib/marking/report-links');
    expect((await reportRoute(reportKey, G2A)).status).toBe(404);
    expect((await reportRoute('x'.repeat(43), G1A)).status).toBe(404);
    for (const wrong of ['x'.repeat(43), 'short', '', `${reportKey}x`, '../../etc', 'a'.repeat(500)]) expect(await withPlatformService((c) => readReport(c, wrong))).toBeNull();
  });

  it('the school’s switch hides the checked paper and keeps the published marks; an expired link opens nothing', async () => {
    const { withPlatformService } = await import('@/lib/auth/db');
    const { readReport } = await import('@/lib/marking/report-links');
    await setting({ families_see_scripts: false });
    const marksOnly = await withPlatformService((c) => readReport(c, reportKey));
    expect(marksOnly?.subjects[0].percent).toBe(75);
    expect(marksOnly?.papers).toEqual([]);
    expect((await reportRoute(reportKey, G1A)).status).toBe(404);
    await setting(null);
    await q(`update marking_report_links set made_at = now() - interval '31 days' where student_id = $1`, [S1]);
    expect(await withPlatformService((c) => readReport(c, reportKey))).toBeNull();
    expect((await reportRoute(reportKey, G1A)).status).toBe(404);
    await q(`update marking_report_links set made_at = now() where student_id = $1`, [S1]);
    expect(await withPlatformService((c) => readReport(c, reportKey))).not.toBeNull();
  });

  it('the public page shows one plain page for a key that opens nothing', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const Page = (await import('@/app/results/[key]/page')).default;
    const wrong = renderToStaticMarkup(await Page({ params: { key: 'x'.repeat(43) }, searchParams: {} }));
    expect(wrong).toContain('data-report-state="expired"');
    expect(wrong).toContain('This link has expired or is not valid.');
    const open = renderToStaticMarkup(await Page({ params: { key: reportKey }, searchParams: { lang: 'hi' } }));
    expect(open).toContain('data-report-state="open"');
    expect(open).toContain(`/api/public/results/${reportKey}/pages/${G1A}`);
    expect(open).not.toContain('Kumar');
  });

  it('reopening the class takes the checked paper back from the family and the link', async () => {
    const { withPlatformService } = await import('@/lib/auth/db');
    const { readReport } = await import('@/lib/marking/report-links');
    const { schoolPaperFor, linkedSchool } = await import('@/lib/family/school');
    await q(`update exam_publications set reopened_by = $1, reopened_at = now(), reopen_reason = 'A mark to correct' where exam_id = $2`, [PRINCIPAL, X1]);
    expect(await withPlatformService((c) => readReport(c, reportKey))).toBeNull();
    expect((await reportRoute(reportKey, G1A)).status).toBe(404);
    expect(await schoolPaperFor(claims, await links(), CHILD, PP1, { childView: false })).toBeNull();
    expect((await pageRoute(G1A)).status).toBe(404);
    expect((await linkedSchool(claims, LINK, [S1]))?.children[0].results).toEqual([]);
  });
});

describe('the address is never indexed (C351)', () => {
  it('robots.txt keeps every crawler off /results/, and the sitemap never lists it', async () => {
    const robots = (await import('@/app/robots')).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    for (const r of rules) expect([r.disallow].flat()).toContain('/results/');
    const sitemap = (await import('@/app/sitemap')).default();
    expect(sitemap.some((e) => e.url.includes('/results'))).toBe(false);
  });
});
