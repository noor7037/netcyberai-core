import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W14-F: the family's own child's report card beside the checked papers, on the whole schema through the real pool.
// The school made each child's card as a file when it published the class; the Family app's "Get report card" serves
// it for this family's own matched child only (another family's child, an unmatched child or a wrong id is the same
// 404), in the child's own view only while the school lets children see their results, and nothing once the class is
// reopened. The published result says which exam has a card. The checked paper's page pictures stream for the
// family's own child (the "blank scans" check). Every name and number is made up.

const STORED = new Map<string, Uint8Array>();
vi.mock('@/lib/storage/supabase-file-storage', () => ({ supabaseFileStorage: { get: async (key: string) => STORED.get(key) ?? null } }));

const u = (n: number) => `f1410000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const PRINCIPAL = u(11);
const C6A = u(21);
const MATHS = u(31);
const [S1, S2] = [u(51), u(52)];
const [P1, P2] = [u(61), u(62)];
const X1 = u(71);
const PP1 = u(81);
const Q1 = u(91);
const UP = u(101);
const [SH1, SH2] = [u(111), u(112)];
const [G1, G2] = [u(121), u(122)];
const [ACCOUNT, OTHER] = ['f1410000-0000-4000-8000-0000000000a1', 'f1410000-0000-4000-8000-0000000000b1'];
const [CHILD, SIBLING, OTHER_CHILD] = ['f1410000-0000-4000-8000-0000000000c1', 'f1410000-0000-4000-8000-0000000000c2', 'f1410000-0000-4000-8000-0000000000c3'];
const [LINK, LINK_O] = ['f1410000-0000-4000-8000-0000000000d1', 'f1410000-0000-4000-8000-0000000000d2'];
const pageKey = (page: string) => `${A}/marking/${PP1}/${page}.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
const SCHEME = {
  bands: [{ from: 50, to: 100, grade: 'A', meaning: null }, { from: 0, to: 49, grade: 'B', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [{ key: 'written', kind: 'theory', name: 'Written', share: 100, passMark: null, parts: [] }],
  terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: false, remarks: false, coScholastic: false },
  coScholastic: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let parentCookie = '';
let childCookie = '';
let otherCookie = '';
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
const STORE = { put: async (key: string, bytes: Uint8Array) => void STORED.set(key, bytes), remove: async (key: string) => void STORED.delete(key) };
const makeCard = async (studentId: string) => {
  const { schoolJobContextStatements } = await import('@/lib/auth/db');
  const { makeReportCardFile } = await import('@/lib/exams/report-card-files');
  const pub = (await q(`select publication_id from exam_publications where exam_id = $1 and class_id = $2 and reopened_at is null`, [X1, C6A]))[0].publication_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.pg.transaction(async (tx: any) => {
    for (const s of schoolJobContextStatements(A, 'exams.report_cards')) await tx.query(s.sql, s.params);
    return makeReportCardFile(tx, STORE, A, { examId: X1, classId: C6A, studentId, publicationId: pub });
  });
};
const cardRoute = async (child: string, exam: string, cookie = parentCookie) => {
  const mod = await import('@/app/api/family/school/report-card/route');
  const res = await mod.GET(new NextRequest(`http://localhost/api/family/school/report-card?child=${child}&exam=${exam}`, { headers: { cookie } }));
  return { status: res.status as number, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), bytes: res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : null };
};
const pageRoute = async (pageId: string, cookie = parentCookie) => {
  const mod = await import('@/app/api/family/school/marking/pages/[pageId]/route');
  const res = await mod.GET(new NextRequest(`http://localhost/api/family/school/marking/pages/${pageId}`, { headers: { cookie } }), { params: { pageId } });
  return res.status as number;
};
const setting = async (values: Record<string, boolean>) => {
  await q(`delete from school_settings where school_id = $1 and module_id = 'exams'`, [A]);
  await q(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'exams', 1, $2::jsonb)`, [A, JSON.stringify(values)]);
};
const links = async (account = ACCOUNT) => {
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { activeLinks } = await import('@/lib/family/school');
  return withFamilyContext({ accountId: account, tokenVersion: 0 }, (c) => activeLinks(c, account));
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w14-f-family-tests-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Madeup', '${C6A}', '1', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Madeup', '${C6A}', '2', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Madeup', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Madeup', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into exams (exam_id, school_id, name, term, created_by) values ('${X1}', '${A}', 'AI Marking Retest', 'Term 1', '${PRINCIPAL}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by) values
      ('${PP1}', '${A}', '${X1}', '${C6A}', '${MATHS}', current_date - 5, '{}', '[{"key":"written","name":"Written","max":10,"share":null}]', '${PRINCIPAL}');
    insert into marking_questions (school_id, question_id, paper_id, position, label, component, max_marks, kind, prompt, answer_key, steps, updated_by) values
      ('${A}', '${Q1}', '${PP1}', 1, '1', 'written', 10, 'short', 'Add 1/2 and 1/4.', 'KEY', '[]', '${PRINCIPAL}');
    insert into marking_uploads (school_id, upload_id, paper_id, mode, created_by, closed_at) values ('${A}', '${UP}', '${PP1}', 'per_file', '${PRINCIPAL}', now());
  `);
  await q(`select set_config('app.current_user_id', $1, false), set_config('app.current_role', 'principal', false)`, [PRINCIPAL]);
  for (const [sheet, student] of [[SH1, S1], [SH2, S2]]) {
    await q(
      `insert into marking_sheets (school_id, sheet_id, paper_id, upload_id, student_id, matched_by, state, ai_provider, ai_model) values ($1, $2, $3, $4, $5, 'roll', 'marked', 'stand-in', 'stand-in')`,
      [A, sheet, PP1, UP, student]
    );
  }
  for (const [page, sheet, file] of [[G1, SH1, 1], [G2, SH2, 2]] as const) {
    await q(
      `insert into marking_pages (school_id, page_id, upload_id, paper_id, file_no, page_no, storage_key, sha256, bytes, width, height, state, sheet_id, sheet_position)
       values ($1, $2, $3, $4, $5, 1, $6, $7, 1000, 1400, 2000, 'read', $8, 1)`,
      [A, page, UP, PP1, file, pageKey(page), (page === G1 ? 'a' : 'b').repeat(64), sheet]
    );
  }
  for (const [sheet, ai] of [[SH1, 8], [SH2, 4]] as const) {
    await q(`insert into marking_marks (school_id, sheet_id, paper_id, question_id, attempted, ai_marks, error_type, confidence, page_id, y_from, y_to) values ($1, $2, $3, $4, true, $5, 'none', 0.9, $6, 0.1, 0.3)`, [
      A,
      sheet,
      PP1,
      Q1,
      ai,
      sheet === SH1 ? G1 : G2,
    ]);
  }
  await q(`update marking_sheets set state = 'approved', approved_at = now() where sheet_id in ($1, $2)`, [SH1, SH2]);
  await q(`select set_config('app.current_user_id', '', false), set_config('app.current_role', '', false)`);
  await db.pg.exec(`
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by) values
      ('${A}', '${X1}', '${MATHS}', '${PP1}', 'written', '${S1}', 'score', 8, 0, '${PRINCIPAL}'), ('${A}', '${X1}', '${MATHS}', '${PP1}', 'written', '${S2}', 'score', 4, 0, '${PRINCIPAL}');
    update exam_papers set entered_at = now(), entered_by = '${PRINCIPAL}' where paper_id = '${PP1}';
    insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values ('${A}', '${X1}', '${C6A}', 1, 1, '${JSON.stringify(SCHEME)}'::jsonb, '${PRINCIPAL}');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${SIBLING}', '${ACCOUNT}', 'Isha', 3, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${OTHER_CHILD}', '${OTHER}', 'Bela', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.school_links (link_id, account_id, school_id, parent_id) values ('${LINK}', '${ACCOUNT}', '${A}', '${P1}'), ('${LINK_O}', '${OTHER}', '${A}', '${P2}');
    insert into family.child_links (child_id, link_id, account_id, student_id) values ('${CHILD}', '${LINK}', '${ACCOUNT}', '${S1}'), ('${OTHER_CHILD}', '${LINK_O}', '${OTHER}', '${S2}');
  `);
  STORED.set(pageKey(G1), JPEG);
  STORED.set(pageKey(G2), JPEG);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  parentCookie = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
  childCookie = `ncf_session=${await signFamilySession(s)}; ncf_child=${CHILD}`;
  const o = { accountId: OTHER, tokenVersion: 0, sessionId: 's2' };
  otherCookie = `ncf_session=${await signFamilySession(o)}; ncf_parent=${await signParentMode(o)}`;
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('the family’s own report card (W14-F)', () => {
  it('before the school made it: the result says it is not ready, and the route answers 404', async () => {
    const { childResultsFor } = await import('@/lib/family/school');
    const mine = await childResultsFor({ accountId: ACCOUNT, tokenVersion: 0 }, await links(), CHILD);
    expect(mine?.results[0]).toMatchObject({ examId: X1, reportCard: false });
    expect((await cardRoute(CHILD, X1)).status).toBe(404);
  });

  it('the parent gets their own child’s card as a PDF to save', async () => {
    expect(await makeCard(S1)).toBe('made');
    const r = await cardRoute(CHILD, X1);
    expect(r.status).toBe(200);
    expect(r.type).toBe('application/pdf');
    expect(r.disposition).toBe('attachment; filename="report-card_AI-Marking-Retest_6-A_roll-1.pdf"');
    const text = new TextDecoder().decode(r.bytes!);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('(Aarav Madeup) Tj');
    expect(text).not.toContain('Bela');
    const { childResultsFor } = await import('@/lib/family/school');
    expect((await childResultsFor({ accountId: ACCOUNT, tokenVersion: 0 }, await links(), CHILD))?.results[0]).toMatchObject({ examId: X1, reportCard: true });
  });

  it('another family’s child, an unmatched child, a wrong id or no session: never the card', async () => {
    expect((await cardRoute(CHILD, X1, otherCookie)).status).toBe(404);
    expect((await cardRoute(OTHER_CHILD, X1)).status).toBe(404);
    expect((await cardRoute(SIBLING, X1)).status).toBe(404);
    expect((await cardRoute(CHILD, u(999))).status).toBe(404);
    expect((await cardRoute('not-a-child', X1)).status).toBe(404);
    expect((await cardRoute(CHILD, X1, '')).status).toBe(401);
    // The other family has no card for their own child until the school makes it; then theirs only.
    expect((await cardRoute(OTHER_CHILD, X1, otherCookie)).status).toBe(404);
    await makeCard(S2);
    const theirs = await cardRoute(OTHER_CHILD, X1, otherCookie);
    expect(theirs.status).toBe(200);
    expect(new TextDecoder().decode(theirs.bytes!)).toContain('(Bela Madeup) Tj');
    // A parent session reads no report-card row itself: only through the guardian's function.
    const { withGuardianContext } = await import('@/lib/auth/db');
    const direct = await withGuardianContext({ accountId: ACCOUNT, tokenVersion: 0 }, LINK, async (c) => (await c.query(`select student_id from result_pdfs`)).rows.length);
    expect(direct).toBe(0);
    const own = await withGuardianContext({ accountId: ACCOUNT, tokenVersion: 0 }, LINK, async (c) => (await c.query(`select student_id from public.guardian_report_cards()`)).rows);
    expect(own).toEqual([{ student_id: S1 }]);
  });

  it('the child’s own view: only the child using the app, only while the school lets children see their results', async () => {
    await setting({ children_see_results: false });
    expect((await cardRoute(CHILD, X1, childCookie)).status).toBe(404);
    await setting({ children_see_results: true });
    expect((await cardRoute(CHILD, X1, childCookie)).status).toBe(200);
    expect((await cardRoute(SIBLING, X1, childCookie)).status).toBe(404);
  });

  it('the checked paper’s page pictures stream for the family’s own child (no blank scans), the same 404 for another’s', async () => {
    expect(await pageRoute(G1)).toBe(200);
    expect(await pageRoute(G1, childCookie)).toBe(200);
    expect(await pageRoute(G2)).toBe(404);
    expect(await pageRoute(G2, otherCookie)).toBe(200);
  });

  it('reopening the class takes the card back from the family', async () => {
    await q(`update exam_publications set reopened_by = $1, reopen_reason = 'A mark was wrong.' where exam_id = $2 and class_id = $3`, [PRINCIPAL, X1, C6A]);
    expect((await cardRoute(CHILD, X1)).status).toBe(404);
  });
});
