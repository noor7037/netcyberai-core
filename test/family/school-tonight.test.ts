import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link, tonight's practice (C335, L10): a linked family reads, read only, what its matched child's class covered
// today, on the real schema through the real pool.
//   1. Today's topics taught or taught in part, with their subject and, when the teacher picked it, their chapter.
//   2. Never a topic delayed or not taught, yesterday's, another class's or another school's, nor the teacher's note.
//   3. A parent never writes, changes or deletes the record.
//   4. An unmatched child, an unlinked family, the family role, a child without the school's consent: nothing.
//   5. Staff read and write as before.

const A = 'd7000000-0000-4000-8000-00000000000a';
const B = 'd7000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd7000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd7000000-0000-4000-8000-0000000000a2';
const PRINCIPAL_B = 'd7000000-0000-4000-8000-0000000000b1';
const P1 = 'd7000000-0000-4000-8000-0000000000e1'; // guardian of S1 (6-A)
const S1 = 'd7000000-0000-4000-8000-0000000005a1';
const C6A = 'd7000000-0000-4000-8000-0000000000c6';
const C6B = 'd7000000-0000-4000-8000-0000000000c7';
const CB = 'd7000000-0000-4000-8000-0000000000cb';
const SCI = 'd7000000-0000-4000-8000-0000000000d1';
const MATH = 'd7000000-0000-4000-8000-0000000000d2';
const ENG = 'd7000000-0000-4000-8000-0000000000d3';
const SCI_B = 'd7000000-0000-4000-8000-0000000000db';
const T_ROW = 'd7000000-0000-4000-8000-0000000000f1';
const T_ROW_B = 'd7000000-0000-4000-8000-0000000000f2';
const UNIT = 'd7000000-0000-4000-8000-0000000000e9';
const G = (n: number) => `d7000000-0000-4000-8000-0000000007${n.toString().padStart(2, '0')}`;
const ACCOUNT = 'f4000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f4000000-0000-4000-8000-0000000000b1';
const CHILD = 'f4000000-0000-4000-8000-0000000000c1';

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
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Pavan Principal', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${PRINCIPAL_B}', '${B}', 'principal', true);
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T_ROW}', '${A}', '${TEACHER}', 'Tara Teacher');
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('d7000000-0000-4000-8000-0000000000b3', '${B}', 't@b.invalid', 'teacher', 'Tom Teacher', true);
    insert into teachers (teacher_id, school_id, user_id, name) values ('${T_ROW_B}', '${B}', 'd7000000-0000-4000-8000-0000000000b3', 'Tom Teacher');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C6A}', '${A}', '6-A', '6', 'A', '${TEACHER}'), ('${C6B}', '${A}', '6-B', '6', 'B', null), ('${CB}', '${B}', '6-A', '6', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science'), ('${MATH}', '${A}', 'Mathematics'), ('${ENG}', '${A}', 'English'), ('${SCI_B}', '${B}', 'Science');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values ('${UNIT}', '${A}', '${C6A}', '${SCI}', 1, 'Exploring Magnets', 'Poles of a magnet');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1');
    insert into syllabus_progress (progress_id, school_id, teacher_id, class_id, subject_id, topic, status, date, unit_id, note) values
      ('${G(1)}', '${A}', '${T_ROW}', '${C6A}', '${SCI}', '', 'taught', current_date, '${UNIT}', 'Two children were away.'),
      ('${G(2)}', '${A}', '${T_ROW}', '${C6A}', '${MATH}', 'Number patterns', 'partial', current_date, null, null),
      ('${G(3)}', '${A}', '${T_ROW}', '${C6A}', '${ENG}', 'A poem', 'not_taught', current_date, null, null),
      ('${G(4)}', '${A}', '${T_ROW}', '${C6A}', '${MATH}', 'Fractions', 'delayed', current_date - 2, null, null),
      ('${G(5)}', '${A}', '${T_ROW}', '${C6A}', '${SCI}', 'Magnetic materials', 'taught', current_date - 1, null, null),
      ('${G(6)}', '${A}', '${T_ROW}', '${C6B}', '${SCI}', 'Only for 6-B', 'taught', current_date, null, null),
      ('${G(7)}', '${B}', '${T_ROW_B}', '${CB}', '${SCI_B}', 'Another school', 'taught', current_date, null, null);
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

const links = async (account = ACCOUNT) => {
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { activeLinks } = await import('@/lib/family/school');
  return withFamilyContext({ accountId: account, tokenVersion: 0 }, (c) => activeLinks(c, account));
};

describe('a linked family reads what its matched child’s class covered today (C335)', () => {
  it('shows today’s topics, taught or in part, per subject, with the chapter when the teacher picked it', async () => {
    const { schoolStudyFor, schoolTodayFor } = await import('@/lib/family/school');
    const mine = await links();
    expect((await schoolStudyFor(claims, mine, CHILD, 'science')).tonight).toEqual([{ subject: 'Science', topic: 'Poles of a magnet', chapter: 'Exploring Magnets' }]);
    expect((await schoolStudyFor(claims, mine, CHILD, 'mathematics')).tonight).toEqual([{ subject: 'Mathematics', topic: 'Number patterns', chapter: null }]);
    expect((await schoolStudyFor(claims, mine, CHILD, 'english')).tonight).toEqual([]);
    expect((await schoolTodayFor(claims, mine, CHILD))?.tonight.map((t) => t.subject)).toEqual(['Mathematics', 'Science']);
  });

  it('as the guardian, the school’s rules let through only the child’s class’s taught records', async () => {
    const seen = await asGuardian(async (c) => (await c.query(`select progress_id from syllabus_progress order by progress_id`)).rows.map((r: { progress_id: string }) => r.progress_id));
    // Not taught, delayed, 6-B's and the other school's stay out; yesterday's is readable but not listed for tonight.
    expect(seen).toEqual([G(1), G(2), G(5)]);
  });

  it('a parent never writes, changes or deletes the record', async () => {
    const writes = [
      `insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date) values ('${A}', '${T_ROW}', '${C6A}', '${SCI}', 'x', 'taught', current_date)`,
      `update syllabus_progress set topic = 'changed' where progress_id = '${G(2)}'`,
      `delete from syllabus_progress where progress_id = '${G(2)}'`,
    ];
    for (const sql of writes) expect(await changes(sql), sql).toBe(0);
    expect(await q(`select topic from syllabus_progress where progress_id = $1`, [G(2)])).toEqual([{ topic: 'Number patterns' }]);
  });

  it('an unmatched child, an unlinked family, and the family role itself see none of it', async () => {
    const { schoolStudyFor } = await import('@/lib/family/school');
    const unmatched = (await links()).map((l) => ({ ...l, children: [] }));
    expect((await schoolStudyFor(claims, unmatched, CHILD, 'science')).tonight).toEqual([]);
    expect((await schoolStudyFor({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, await links(), CHILD, 'science')).tonight).toEqual([]);
    const { withFamilyContext } = await import('@/lib/auth/db');
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from syllabus_progress`))).rejects.toThrow();
  });

  it('the school withdrawing its consent for the child hides it', async () => {
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', false, 'school_attested', 'v1')`, [A, S1]);
    expect(await asGuardian(async (c) => (await c.query(`select count(*)::int as n from syllabus_progress`)).rows[0].n)).toBe(0);
    const { schoolStudyFor } = await import('@/lib/family/school');
    expect((await schoolStudyFor(claims, await links(), CHILD, 'science')).tonight).toEqual([]);
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', true, 'school_attested', 'v1')`, [A, S1]);
  });

  it('no guardian reader selects the teacher’s note, or every column, from the record', async () => {
    // A parent's session may read the note at row level (it shares the app's role with staff), so the readers must never
    // ask for it: the guardian readers' SQL names its columns, and none of them is the note.
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/lib/school-link/index.ts', 'utf8');
    expect(source).not.toMatch(/select\s+\*/i);
    const queries = source.split('`').filter((part) => /syllabus_progress/.test(part));
    expect(queries.length).toBeGreaterThan(0);
    for (const sql of queries) expect(sql).not.toMatch(/\bnote\b/);
  });

  it('staff read and write the record as before', async () => {
    const principal = await asStaff('principal', PRINCIPAL)(async (c) => {
      await c.query(`insert into syllabus_progress (school_id, teacher_id, class_id, subject_id, topic, status, date) values ($1, $2, $3, $4, 'Revision', 'taught', current_date)`, [A, T_ROW, C6B, MATH]);
      return (await c.query(`select count(*)::int as n from syllabus_progress`)).rows[0].n;
    });
    expect(principal).toBe(7);
  });
});
