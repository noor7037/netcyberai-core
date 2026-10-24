import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link, homework (C329): a linked family reads the homework the school set for its matched child's class and
// section, read only, on the real schema through the real pool, and nothing else.
//   1. The matched child's class: its homework, its subject, the teacher's done mark for this child.
//   2. Another class of the same school, another school, a classmate's done mark: never.
//   3. A parent never writes: no new homework, no change, no delete, no done mark.
//   4. An unlinked family, an unmatched child, a child without the school's consent: nothing.
//   5. Staff read and write as before.

const A = 'd3000000-0000-4000-8000-00000000000a';
const B = 'd3000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd3000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd3000000-0000-4000-8000-0000000000a2';
const TEACHER_B = 'd3000000-0000-4000-8000-0000000000b2';
const P1 = 'd3000000-0000-4000-8000-0000000000e1'; // guardian of S1 (6-A)
const P2 = 'd3000000-0000-4000-8000-0000000000e2'; // guardian of S2 (6-B) and S3 (6-A, S1's classmate)
const S1 = 'd3000000-0000-4000-8000-0000000005a1';
const S2 = 'd3000000-0000-4000-8000-0000000005a2';
const S3 = 'd3000000-0000-4000-8000-0000000005a3';
const SB = 'd3000000-0000-4000-8000-0000000005b1';
const C6A = 'd3000000-0000-4000-8000-0000000000c6';
const C6B = 'd3000000-0000-4000-8000-0000000000c7';
const CB = 'd3000000-0000-4000-8000-0000000000cb';
const SCI = 'd3000000-0000-4000-8000-0000000000d1';
const MATH = 'd3000000-0000-4000-8000-0000000000d2';
const SCI_B = 'd3000000-0000-4000-8000-0000000000db';
const H1 = 'd3000000-0000-4000-8000-0000000000f1'; // 6-A, Science
const H2 = 'd3000000-0000-4000-8000-0000000000f2'; // 6-B only
const H3 = 'd3000000-0000-4000-8000-0000000000f3'; // school B
const H4 = 'd3000000-0000-4000-8000-0000000000f4'; // 6-A, due long ago
const T1 = 'd3000000-0000-4000-8000-0000000001f1';
const T2 = 'd3000000-0000-4000-8000-0000000001f2';
const T3 = 'd3000000-0000-4000-8000-0000000001f3';
const T4 = 'd3000000-0000-4000-8000-0000000001f4';
const ACCOUNT = 'f8000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f8000000-0000-4000-8000-0000000000b1';
const CHILD = 'f8000000-0000-4000-8000-0000000000c1';

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
// The guardian's own session, as the Family app opens it; an error rolls it back.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asGuardian = async <T>(fn: (c: any) => Promise<T>): Promise<T> => (await import('@/lib/auth/db')).withGuardianContext(claims, link, fn);
// A parent's write is refused by a row rule or a missing table right, or finds no row it may change: 0. Any other
// error (a mistyped statement) comes back as its message, so it cannot pass for a refusal.
const changes = async (sql: string): Promise<number | string> => {
  try {
    return (await asGuardian((c) => c.query(sql))).rowCount ?? 0;
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
      ('${TEACHER_B}', '${B}', 't@b.invalid', 'teacher', 'Tom Teacher', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${TEACHER_B}', '${B}', 'teacher', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${C6A}', '${A}', '6-A', '6', 'A'), ('${C6B}', '${A}', '6-B', '6', 'B'), ('${CB}', '${B}', '6-A', '6', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science'), ('${MATH}', '${A}', 'Mathematics'), ('${SCI_B}', '${B}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${C6B}', 'active'),
      ('${S3}', '${A}', 'A-3', 'Chirag Singh', '${C6A}', 'active'), ('${SB}', '${B}', 'B-1', 'Other School Child', '${CB}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P2}', '${S3}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S3}', 'core_records', true, 'school_attested', 'v1');
    insert into homework (homework_id, school_id, subject_id, title, details, due_date, created_by) values
      ('${H1}', '${A}', '${SCI}', 'Magnets around the house', 'List five things a magnet sticks to.', current_date + 2, '${TEACHER}'),
      ('${H2}', '${A}', '${MATH}', 'Only for 6-B', null, current_date + 1, '${PRINCIPAL}'),
      ('${H3}', '${B}', '${SCI_B}', 'Another school', null, current_date + 1, '${TEACHER_B}'),
      ('${H4}', '${A}', '${SCI}', 'Long past', null, current_date - 40, '${TEACHER}');
    -- Each class's piece carries its own copy of the title, details and due day (the teacher may change it per class).
    insert into homework_targets (target_id, school_id, homework_id, class_id, title, details, due_date)
      select t, s, h.homework_id, c, h.title, h.details, h.due_date from homework h
        join (values ('${T1}'::uuid, '${A}'::uuid, '${H1}'::uuid, '${C6A}'::uuid), ('${T2}', '${A}', '${H2}', '${C6B}'), ('${T3}', '${B}', '${H3}', '${CB}'), ('${T4}', '${A}', '${H4}', '${C6A}')) v(t, s, hw, c)
          on h.homework_id = v.hw;
    insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by, checked_at) values
      ('${A}', '${T1}', '${C6A}', '${S1}', true, '${TEACHER}', now()), ('${A}', '${T1}', '${C6A}', '${S3}', false, '${TEACHER}', now());
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'parent@example.org'), ('${OTHER_ACCOUNT}', 'other@example.org');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR');
  `);
  // The real path: the school's principal makes a code for P1, the family spends it and matches its child to S1.
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

describe('a linked family reads its matched child’s homework (C329)', () => {
  it('shows the homework set for the child’s own class and section, with its subject and the child’s done mark', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const school = await linkedSchool(claims, link, [S1]);
    const child = school?.children.find((c) => c.studentId === S1);
    expect(child?.homework).toEqual([{ subject: 'Science', title: 'Magnets around the house', details: 'List five things a magnet sticks to.', due: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), done: true }]);
  });

  it('as the guardian, the school’s rules let through only that class’s homework and that child’s marks', async () => {
    const seen = await asGuardian(async (c) => ({
      homework: (await c.query(`select homework_id from homework order by homework_id`)).rows.map((r: { homework_id: string }) => r.homework_id),
      targets: (await c.query(`select target_id from homework_targets order by target_id`)).rows.map((r: { target_id: string }) => r.target_id),
      marks: (await c.query(`select student_id from homework_status`)).rows.map((r: { student_id: string }) => r.student_id),
      subjects: (await c.query(`select name from subjects order by name`)).rows.map((r: { name: string }) => r.name),
    }));
    // 6-B's homework, the other school's, and the classmate's done mark stay out; an old piece is readable but not listed.
    expect(seen).toEqual({ homework: [H1, H4], targets: [T1, T4], marks: [S1], subjects: ['Science'] });
  });

  it('a parent never writes homework, a class’s piece or a done mark', async () => {
    // Plain statements (the fixed ids written in): the throwaway database's socket mishandles an error raised while a
    // statement with parameters is planned, which a refused table right is.
    const writes = [
      `insert into homework (school_id, subject_id, title, due_date, created_by) values ('${A}', '${SCI}', 'x', current_date, '${P1}')`,
      `insert into homework_targets (school_id, homework_id, class_id, title, due_date) values ('${A}', '${H1}', '${C6A}', 'x', current_date)`,
      `insert into homework_status (school_id, target_id, class_id, student_id, done) values ('${A}', '${T4}', '${C6A}', '${S1}', true)`,
      `update homework set title = 'changed' where homework_id = '${H1}'`,
      `update homework_targets set due_date = current_date where target_id = '${T1}'`,
      `update homework_status set done = false where student_id = '${S1}'`,
      `delete from homework_status where student_id = '${S1}'`,
      `delete from homework_targets where target_id = '${T1}'`,
      `delete from homework where homework_id = '${H1}'`,
    ];
    for (const sql of writes) expect(await changes(sql), sql).toBe(0);
    expect(await q(`select title from homework where homework_id = $1`, [H1])).toEqual([{ title: 'Magnets around the house' }]);
    expect(await q(`select done from homework_status where student_id = $1`, [S1])).toEqual([{ done: true }]);
  });

  it('an unmatched child, an unlinked family, and the family role itself see no homework', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    // The same link with no child matched: the school child shows, without homework.
    expect((await linkedSchool(claims, link))?.children.map((c) => c.homework)).toEqual([null]);
    // Another account cannot use this link.
    expect(await linkedSchool({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, link, [S1])).toBeNull();
    // The family's own role reads no school table at all.
    const { withFamilyContext } = await import('@/lib/auth/db');
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from homework`))).rejects.toThrow();
  });

  it('the school withdrawing its consent for the child hides the child’s homework', async () => {
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', false, 'school_attested', 'v1')`, [A, S1]);
    const seen = await asGuardian(async (c) => (await c.query(`select count(*)::int as n from homework_targets`)).rows[0].n);
    expect(seen).toBe(0);
    const { linkedSchool } = await import('@/lib/family/school');
    expect((await linkedSchool(claims, link, [S1]))?.children).toEqual([]);
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', true, 'school_attested', 'v1')`, [A, S1]);
  });

  it('staff read and write homework as before', async () => {
    const principal = await asStaff('principal', PRINCIPAL)(async (c) => (await c.query(`select count(*)::int as n from homework`)).rows[0].n);
    expect(principal).toBe(3);
    const teacher = await asStaff('teacher', TEACHER)(async (c) => {
      const made = await c.query(`insert into homework (school_id, subject_id, title, due_date, created_by) values ($1, $2, 'New piece', current_date + 3, $3) returning homework_id`, [A, SCI, TEACHER]);
      await c.query(`update homework set title = 'New piece, edited' where homework_id = $1`, [made.rows[0].homework_id]);
      return (await c.query(`select title from homework where created_by = $1 order by title`, [TEACHER])).rows.map((r: { title: string }) => r.title);
    });
    expect(teacher).toEqual(['Long past', 'Magnets around the house', 'New piece, edited']);
  });
});
