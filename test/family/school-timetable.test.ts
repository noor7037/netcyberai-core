import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link, timetable (C332): a linked family reads, read only, the published timetable of its matched child's class,
// on the real schema through the real pool.
//   1. The child's class: day by day, period by period, with the school's subject names.
//   2. Never another class's or another school's timetable.
//   3. A parent never writes, changes or deletes a period.
//   4. An unmatched child, an unlinked family, the family role, a child without the school's consent: nothing.
//   5. Staff read and write as before.

const A = 'd5000000-0000-4000-8000-00000000000a';
const B = 'd5000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd5000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd5000000-0000-4000-8000-0000000000a2';
const PRINCIPAL_B = 'd5000000-0000-4000-8000-0000000000b1';
const P1 = 'd5000000-0000-4000-8000-0000000000e1'; // guardian of S1 (6-A)
const S1 = 'd5000000-0000-4000-8000-0000000005a1';
const C6A = 'd5000000-0000-4000-8000-0000000000c6';
const C6B = 'd5000000-0000-4000-8000-0000000000c7';
const CB = 'd5000000-0000-4000-8000-0000000000cb';
const SCI = 'd5000000-0000-4000-8000-0000000000d1';
const MATH = 'd5000000-0000-4000-8000-0000000000d2';
const SCI_B = 'd5000000-0000-4000-8000-0000000000db';
const T = (n: number) => `d5000000-0000-4000-8000-0000000003${n.toString().padStart(2, '0')}`;
const ACCOUNT = 'f6000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f6000000-0000-4000-8000-0000000000b1';
const CHILD = 'f6000000-0000-4000-8000-0000000000c1';

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
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C6A}', '${A}', '6-A', '6', 'A', '${TEACHER}'), ('${C6B}', '${A}', '6-B', '6', 'B', null), ('${CB}', '${B}', '6-A', '6', 'A', null);
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${A}', 'Science'), ('${MATH}', '${A}', 'Mathematics'), ('${SCI_B}', '${B}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1');
    insert into timetable_entries (entry_id, school_id, class_id, weekday, period, subject_id, teacher_user_id) values
      ('${T(1)}', '${A}', '${C6A}', 1, 1, '${SCI}', '${TEACHER}'), ('${T(2)}', '${A}', '${C6A}', 1, 2, '${MATH}', '${TEACHER}'), ('${T(3)}', '${A}', '${C6A}', 2, 1, '${SCI}', '${TEACHER}'),
      ('${T(4)}', '${A}', '${C6B}', 1, 1, '${MATH}', '${PRINCIPAL}'), ('${T(5)}', '${B}', '${CB}', 1, 1, '${SCI_B}', '${PRINCIPAL_B}');
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

describe('a linked family reads its matched child’s timetable (C332)', () => {
  it('shows the class’s published timetable, day by day, with the school’s subject names', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const child = (await linkedSchool(claims, link, [S1]))?.children.find((c) => c.studentId === S1);
    expect(child?.timetable).toEqual([
      { weekday: 1, period: 1, subject: 'Science' },
      { weekday: 1, period: 2, subject: 'Mathematics' },
      { weekday: 2, period: 1, subject: 'Science' },
    ]);
  });

  it('as the guardian, the school’s rules let through only the child’s class’s periods', async () => {
    const seen = await asGuardian(async (c) => ({
      periods: (await c.query(`select entry_id from timetable_entries order by entry_id`)).rows.map((r: { entry_id: string }) => r.entry_id),
      subjects: (await c.query(`select name from subjects order by name`)).rows.map((r: { name: string }) => r.name),
    }));
    expect(seen).toEqual({ periods: [T(1), T(2), T(3)], subjects: ['Mathematics', 'Science'] });
  });

  it('a parent never writes, changes or deletes a period', async () => {
    const writes = [
      `insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ('${A}', '${C6A}', 3, 1, '${SCI}', '${TEACHER}')`,
      `update timetable_entries set subject_id = '${MATH}' where entry_id = '${T(1)}'`,
      `delete from timetable_entries where entry_id = '${T(1)}'`,
    ];
    for (const sql of writes) expect(await changes(sql), sql).toBe(0);
    expect(await q(`select subject_id from timetable_entries where entry_id = $1`, [T(1)])).toEqual([{ subject_id: SCI }]);
  });

  it('an unmatched child, an unlinked family, and the family role itself see none of it', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    expect((await linkedSchool(claims, link))?.children.map((c) => c.timetable)).toEqual([null]);
    expect(await linkedSchool({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, link, [S1])).toBeNull();
    const { withFamilyContext } = await import('@/lib/auth/db');
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from timetable_entries`))).rejects.toThrow();
  });

  it('the school withdrawing its consent for the child hides the timetable', async () => {
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', false, 'school_attested', 'v1')`, [A, S1]);
    expect(await asGuardian(async (c) => (await c.query(`select count(*)::int as n from timetable_entries`)).rows[0].n)).toBe(0);
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', true, 'school_attested', 'v1')`, [A, S1]);
  });

  it('staff read and write the timetable as before', async () => {
    const principal = await asStaff('principal', PRINCIPAL)(async (c) => {
      await c.query(`insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values ($1, $2, 3, 1, $3, $4)`, [A, C6B, MATH, PRINCIPAL]);
      return (await c.query(`select count(*)::int as n from timetable_entries`)).rows[0].n;
    });
    expect(principal).toBe(5);
    const teacher = await asStaff('teacher', TEACHER)(async (c) => (await c.query(`select entry_id from timetable_entries order by entry_id`)).rows.map((r: { entry_id: string }) => r.entry_id));
    expect(teacher).toEqual([T(1), T(2), T(3)]);
  });
});
