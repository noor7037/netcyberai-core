import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link, published results (C333): a linked family reads, read only, its matched child's results only as the
// school published them for the child's class, graded by the scheme kept with the publication, on the real schema
// through the real pool.
//   1. A published exam: each subject's percent and grade, the overall, the remark and the co-scholastic grades.
//   2. Never marks not published (entered or not), a reopened publication, another class's paper, a classmate's marks, remark or
//      grades, or another school's.
//   3. A parent never writes, changes or deletes any of it; a school-side parent session sees only published marks too.
//   4. An unmatched child, an unlinked family, the family role, a child without the school's consent: nothing.
//   5. Staff read and write as before.

const A = 'd6100000-0000-4000-8000-00000000000a';
const B = 'd6100000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd6100000-0000-4000-8000-0000000000a1';
const TEACHER = 'd6100000-0000-4000-8000-0000000000a2';
const PRINCIPAL_B = 'd6100000-0000-4000-8000-0000000000b1';
const P1 = 'd6100000-0000-4000-8000-0000000000e1'; // guardian of S1 (6-A)
const P2 = 'd6100000-0000-4000-8000-0000000000e2'; // guardian of S3 (S1's classmate)
const S1 = 'd6100000-0000-4000-8000-0000000005a1';
const S3 = 'd6100000-0000-4000-8000-0000000005a3';
const C6A = 'd6100000-0000-4000-8000-0000000000c6';
const C6B = 'd6100000-0000-4000-8000-0000000000c7';
const CB = 'd6100000-0000-4000-8000-0000000000cb';
const SCI = 'd6100000-0000-4000-8000-0000000000d1';
const MATH = 'd6100000-0000-4000-8000-0000000000d2';
const SCI_B = 'd6100000-0000-4000-8000-0000000000db';
const X = (n: number) => `d6100000-0000-4000-8000-0000000004${n.toString().padStart(2, '0')}`; // exams
const PP = (n: number) => `d6100000-0000-4000-8000-0000000006${n.toString().padStart(2, '0')}`; // papers
const COMPONENTS = JSON.stringify([{ key: 'marks', name: 'Marks', max: 50, share: null }]);
const SCHEME = JSON.stringify({
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 50, to: 74, grade: 'B', meaning: null }, { from: 33, to: 49, grade: 'C', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [],
  terms: [{ name: 'Term 1' }],
  layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: true },
  coScholastic: { areas: ['Art'], grades: [{ grade: 'A', meaning: null, pass: true }, { grade: 'C', meaning: null, pass: true }] },
});
const ACCOUNT = 'f5000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f5000000-0000-4000-8000-0000000000b1';
const CHILD = 'f5000000-0000-4000-8000-0000000000c1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let link = '';
const claims = { accountId: ACCOUNT, tokenVersion: 0 };
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asStaff = (role: string, user: string, school = A) => (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': school, 'app.current_role': role, 'app.current_user_id': user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asGuardian = async <T>(fn: (c: any) => Promise<T>): Promise<T> => (await import('@/lib/auth/db')).withGuardianContext(claims, link, fn);
// A parent's write is refused by a row rule or a missing table right, or finds no row it may change: 0. Any other error
// comes back as its message, so a mistyped statement cannot pass for a refusal. Plain statements: the throwaway
// database's socket mishandles an error raised while a statement with parameters is planned.
const changes = async (sql: string): Promise<number | string> => {
  try {
    return (await asGuardian<{ rowCount: number | null }>((c) => c.query(sql))).rowCount ?? 0;
  } catch (e) {
    const m = String((e as Error).message);
    return /row-level security|permission denied/.test(m) ? 0 : m;
  }
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  // X1: published for 6-A. X2: 6-A's marks entered, not published. X3: published for 6-A, then reopened. X4: School B.
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Pavan Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${PRINCIPAL_B}', '${B}', 'principal', true);
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C6A}', '${A}', '6-A', '6', 'A', '${TEACHER}'), ('${C6B}', '${A}', '6-B', '6', 'B', null), ('${CB}', '${B}', '6-A', '6', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science'), ('${MATH}', '${A}', 'Mathematics'), ('${SCI_B}', '${B}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active'), ('${S3}', '${A}', 'A-3', 'Chirag Singh', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S3}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S3}', 'core_records', true, 'school_attested', 'v1');
    insert into grading_schemes (school_id, version, scheme, made_by) values ('${A}', 1, '${SCHEME}'::jsonb, '${PRINCIPAL}'), ('${B}', 1, '${SCHEME}'::jsonb, '${PRINCIPAL_B}');
    insert into exams (exam_id, school_id, name, term, created_by) values
      ('${X(1)}', '${A}', 'Unit test 1', 'Term 1', '${PRINCIPAL}'), ('${X(2)}', '${A}', 'Unit test 2', 'Term 1', '${PRINCIPAL}'),
      ('${X(3)}', '${A}', 'Half-yearly', 'Term 1', '${PRINCIPAL}'), ('${X(4)}', '${B}', 'Other school test', null, '${PRINCIPAL_B}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, unit_ids, components, created_by) values
      ('${PP(1)}', '${A}', '${X(1)}', '${C6A}', '${SCI}', '{}', '${COMPONENTS}', '${PRINCIPAL}'),
      ('${PP(2)}', '${A}', '${X(1)}', '${C6A}', '${MATH}', '{}', '${COMPONENTS}', '${PRINCIPAL}'),
      ('${PP(3)}', '${A}', '${X(1)}', '${C6B}', '${SCI}', '{}', '${COMPONENTS}', '${PRINCIPAL}'),
      ('${PP(4)}', '${A}', '${X(2)}', '${C6A}', '${SCI}', '{}', '${COMPONENTS}', '${PRINCIPAL}'),
      ('${PP(5)}', '${A}', '${X(3)}', '${C6A}', '${SCI}', '{}', '${COMPONENTS}', '${PRINCIPAL}'),
      ('${PP(6)}', '${B}', '${X(4)}', '${CB}', '${SCI_B}', '{}', '${COMPONENTS}', '${PRINCIPAL_B}');
    insert into marks (school_id, exam_id, student_id, subject_id, score, max_score, paper_id, component, kind, entered_by) values
      ('${A}', '${X(1)}', '${S1}', '${SCI}', 40, 50, '${PP(1)}', 'marks', 'score', '${TEACHER}'),
      ('${A}', '${X(1)}', '${S1}', '${MATH}', 30, 50, '${PP(2)}', 'marks', 'score', '${TEACHER}'),
      ('${A}', '${X(1)}', '${S3}', '${SCI}', 20, 50, '${PP(1)}', 'marks', 'score', '${TEACHER}'),
      ('${A}', '${X(1)}', '${S3}', '${MATH}', 25, 50, '${PP(2)}', 'marks', 'score', '${TEACHER}'),
      ('${A}', '${X(2)}', '${S1}', '${SCI}', 10, 50, '${PP(4)}', 'marks', 'score', '${TEACHER}'),
      ('${A}', '${X(3)}', '${S1}', '${SCI}', 45, 50, '${PP(5)}', 'marks', 'score', '${TEACHER}');
    insert into report_remarks (school_id, exam_id, class_id, student_id, remark, written_by) values
      ('${A}', '${X(1)}', '${C6A}', '${S1}', 'Asks good questions.', '${TEACHER}'), ('${A}', '${X(1)}', '${C6A}', '${S3}', 'Not for Aarav.', '${TEACHER}');
    insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by) values
      ('${A}', '${X(1)}', '${C6A}', '${S1}', 'Art', 'A', '${TEACHER}'), ('${A}', '${X(1)}', '${C6A}', '${S3}', 'Art', 'C', '${TEACHER}');
    update exam_papers set entered_at = now(), entered_by = '${TEACHER}' where paper_id in ('${PP(1)}', '${PP(2)}', '${PP(3)}', '${PP(4)}', '${PP(5)}');
    update exam_papers set entered_at = now(), entered_by = '${PRINCIPAL_B}' where paper_id = '${PP(6)}';
    insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, published_by) values
      ('${A}', '${X(1)}', '${C6A}', 1, 1, '{}', '${PRINCIPAL}'), ('${A}', '${X(3)}', '${C6A}', 1, 1, '{}', '${PRINCIPAL}'), ('${B}', '${X(4)}', '${CB}', 1, 1, '{}', '${PRINCIPAL_B}');
    update exam_publications set reopened_by = '${PRINCIPAL}', reopen_reason = 'A mark was wrong.' where exam_id = '${X(3)}';
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER_ACCOUNT}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
  `);
  // The real path: the principal makes a code for P1, the family spends it and matches its child to S1.
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = await asStaff('principal', PRINCIPAL)((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: A }, P1));
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, ACCOUNT, issued.code));
  link = made!.linkId;
  await withFamilyContext(claims, (c) => setChildLinks(c, ACCOUNT, link, [S1], [{ studentId: S1, childId: CHILD }]));
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('a linked family reads its matched child’s published results (C333)', () => {
  it('shows a published exam as the report card does: each subject, the overall, the grades and the remark', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const child = (await linkedSchool(claims, link, [S1]))?.children.find((c) => c.studentId === S1);
    expect(child?.results).toEqual([
      {
        exam: 'Unit test 1',
        term: 'Term 1',
        publishedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        subjects: [
          { name: 'Mathematics', percent: 60, grade: 'B' },
          { name: 'Science', percent: 80, grade: 'A' },
        ],
        overall: { percent: 70, grade: 'B' },
        remark: 'Asks good questions.',
        coScholastic: [{ area: 'Art', grade: 'A' }],
      },
    ]);
  });

  it('as the guardian, the school’s rules let through only published papers and the child’s own marks, remark and grades', async () => {
    const seen = await asGuardian(async (c) => ({
      exams: (await c.query(`select exam_id from exams order by exam_id`)).rows.map((r: { exam_id: string }) => r.exam_id),
      papers: (await c.query(`select paper_id from exam_papers order by paper_id`)).rows.map((r: { paper_id: string }) => r.paper_id),
      marks: (await c.query(`select student_id, paper_id from marks order by paper_id`)).rows.map((r: { student_id: string; paper_id: string }) => [r.student_id, r.paper_id]),
      remarks: (await c.query(`select remark from report_remarks`)).rows.map((r: { remark: string }) => r.remark),
      grades: (await c.query(`select grade from co_scholastic_grades`)).rows.map((r: { grade: string }) => r.grade),
      publications: (await c.query(`select count(*)::int as n from exam_publications`)).rows[0].n,
    }));
    expect(seen).toEqual({ exams: [X(1)], papers: [PP(1), PP(2)], marks: [[S1, PP(1)], [S1, PP(2)]], remarks: ['Asks good questions.'], grades: ['A'], publications: 0 });
  });

  it('a parent never writes, changes or deletes a result', async () => {
    const writes = [
      `insert into exams (school_id, name, created_by) values ('${A}', 'x', '${P1}')`,
      `insert into report_remarks (school_id, exam_id, class_id, student_id, remark, written_by) values ('${A}', '${X(2)}', '${C6A}', '${S1}', 'x', '${P1}')`,
      `update marks set score = 50 where paper_id = '${PP(1)}' and student_id = '${S1}'`,
      `update exam_papers set paper_date = current_date where paper_id = '${PP(1)}'`,
      `update exams set name = 'changed' where exam_id = '${X(1)}'`,
      `update report_remarks set remark = 'changed' where student_id = '${S1}'`,
      `update co_scholastic_grades set grade = 'D' where student_id = '${S1}'`,
      `delete from marks where student_id = '${S1}'`,
      `delete from report_remarks where student_id = '${S1}'`,
      `delete from co_scholastic_grades where student_id = '${S1}'`,
      `delete from exam_papers where paper_id = '${PP(1)}'`,
      `delete from exams where exam_id = '${X(1)}'`,
    ];
    // A remark's own rule reads the papers as the writer, so for a parent it already refuses before the row rules do.
    for (const sql of writes) expect(await changes(sql), sql).toSatisfy((v: number | string) => v === 0 || v === 'a remark is for a class the exam has papers for');
    expect(await q(`select score::int as score from marks where paper_id = $1 and student_id = $2`, [PP(1), S1])).toEqual([{ score: 40 }]);
    expect(await q(`select count(*)::int as n from report_remarks`)).toEqual([{ n: 2 }]);
  });

  it('a school-side parent session too reads only published marks of its own consented child', async () => {
    const seen = await asStaff('parent', P1)(async (c) => (await c.query(`select paper_id from marks order by paper_id`)).rows.map((r: { paper_id: string }) => r.paper_id));
    expect(seen).toEqual([PP(1), PP(2)]);
  });

  it('an unmatched child, an unlinked family, and the family role itself see none of it', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    expect((await linkedSchool(claims, link))?.children.map((c) => c.results)).toEqual([null]);
    expect(await linkedSchool({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, link, [S1])).toBeNull();
    const { withFamilyContext } = await import('@/lib/auth/db');
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from marks`))).rejects.toThrow();
  });

  it('the school withdrawing its consent for the child hides the results', async () => {
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', false, 'school_attested', 'v1')`, [A, S1]);
    const seen = await asGuardian(async (c) => ({
      papers: (await c.query(`select count(*)::int as n from exam_papers`)).rows[0].n,
      marks: (await c.query(`select count(*)::int as n from marks`)).rows[0].n,
    }));
    expect(seen).toEqual({ papers: 0, marks: 0 });
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', true, 'school_attested', 'v1')`, [A, S1]);
  });

  it('staff read results as before', async () => {
    const principal = await asStaff('principal', PRINCIPAL)(async (c) => ({
      papers: (await c.query(`select count(*)::int as n from exam_papers`)).rows[0].n,
      marks: (await c.query(`select count(*)::int as n from marks`)).rows[0].n,
      publications: (await c.query(`select count(*)::int as n from exam_publications`)).rows[0].n,
    }));
    expect(principal).toEqual({ papers: 5, marks: 6, publications: 2 });
    const teacher = await asStaff('teacher', TEACHER)(async (c) => ({
      papers: (await c.query(`select count(*)::int as n from exam_papers`)).rows[0].n,
      remarks: (await c.query(`select count(*)::int as n from report_remarks`)).rows[0].n,
    }));
    expect(teacher).toEqual({ papers: 4, remarks: 2 });
  });
});
