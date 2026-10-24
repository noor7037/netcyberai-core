import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// School Link, notices and events (C331): a linked family reads, read only, the notices the school sent and the events
// it invited the family to, for its matched child's class or the whole school, on the real schema through the real pool.
//   1. Sent notices and invited events of the child's class and of the whole school; a cancelled one says so.
//   2. Never a notice that waits or was rejected, a draft event, another class's, another school's, or a past event.
//   3. A parent never writes, changes or deletes a notice or an event.
//   4. An unmatched child, an unlinked family, the family role, a child without the school's consent: nothing.
//   5. Staff read and write as before.

const A = 'd4000000-0000-4000-8000-00000000000a';
const B = 'd4000000-0000-4000-8000-00000000000b';
const PRINCIPAL = 'd4000000-0000-4000-8000-0000000000a1';
const TEACHER = 'd4000000-0000-4000-8000-0000000000a2';
const PRINCIPAL_B = 'd4000000-0000-4000-8000-0000000000b1';
const P1 = 'd4000000-0000-4000-8000-0000000000e1'; // guardian of S1 (6-A)
const S1 = 'd4000000-0000-4000-8000-0000000005a1';
const C6A = 'd4000000-0000-4000-8000-0000000000c6';
const C6B = 'd4000000-0000-4000-8000-0000000000c7';
const CB = 'd4000000-0000-4000-8000-0000000000cb';
const N = (n: number) => `d4000000-0000-4000-8000-0000000001${n.toString().padStart(2, '0')}`;
const E = (n: number) => `d4000000-0000-4000-8000-0000000002${n.toString().padStart(2, '0')}`;
const ACCOUNT = 'f7000000-0000-4000-8000-0000000000a1';
const OTHER_ACCOUNT = 'f7000000-0000-4000-8000-0000000000b1';
const CHILD = 'f7000000-0000-4000-8000-0000000000c1';

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
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${C6A}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1');
    insert into class_notices (notice_id, school_id, class_id, body, status, written_by, written_at, decided_by, decided_at, reject_reason) values
      ('${N(1)}', '${A}', '${C6A}', 'Bring a magnet on Monday.', 'sent', '${TEACHER}', now() - interval '2 days', '${PRINCIPAL}', now() - interval '2 days', null),
      ('${N(2)}', '${A}', null, 'School closes early on Friday.', 'sent', '${PRINCIPAL}', now() - interval '1 day', '${PRINCIPAL}', now() - interval '1 day', null),
      ('${N(3)}', '${A}', '${C6A}', 'Still waiting for the principal.', 'waiting', '${TEACHER}', now(), null, null, null),
      ('${N(4)}', '${A}', '${C6A}', 'Rejected words.', 'rejected', '${TEACHER}', now(), '${PRINCIPAL}', now(), 'Wrong date'),
      ('${N(5)}', '${A}', '${C6B}', 'Only for 6-B.', 'sent', '${PRINCIPAL}', now(), '${PRINCIPAL}', now(), null),
      ('${N(6)}', '${B}', null, 'Another school.', 'sent', '${PRINCIPAL_B}', now(), '${PRINCIPAL_B}', now(), null),
      ('${N(7)}', '${A}', '${C6A}', 'Long ago.', 'sent', '${TEACHER}', now() - interval '40 days', '${PRINCIPAL}', now() - interval '40 days', null);
    insert into school_events (event_id, school_id, title, held_on, starts_at, details, class_ids, status, created_by, invited_by, invited_at, cancelled_by, cancelled_at) values
      ('${E(1)}', '${A}', 'Science fair', current_date + 5, '10:00', 'Projects in the hall.', array['${C6A}']::uuid[], 'invited', '${PRINCIPAL}', '${PRINCIPAL}', now(), null, null),
      ('${E(2)}', '${A}', 'Annual day', current_date + 10, null, 'For every family.', '{}', 'invited', '${PRINCIPAL}', '${PRINCIPAL}', now(), null, null),
      ('${E(3)}', '${A}', 'Draft trip', current_date + 3, null, 'Not sent yet.', array['${C6A}']::uuid[], 'draft', '${PRINCIPAL}', null, null, null, null),
      ('${E(4)}', '${A}', 'Sports day', current_date + 7, '09:00', 'Called off.', array['${C6A}']::uuid[], 'cancelled', '${PRINCIPAL}', '${PRINCIPAL}', now(), '${PRINCIPAL}', now()),
      ('${E(5)}', '${A}', 'Only 6-B', current_date + 4, null, 'Not for Aarav.', array['${C6B}']::uuid[], 'invited', '${PRINCIPAL}', '${PRINCIPAL}', now(), null, null),
      ('${E(6)}', '${B}', 'Another school', current_date + 4, null, 'Not ours.', '{}', 'invited', '${PRINCIPAL_B}', '${PRINCIPAL_B}', now(), null, null),
      ('${E(7)}', '${A}', 'Last week', current_date - 7, null, 'Already held.', array['${C6A}']::uuid[], 'invited', '${PRINCIPAL}', '${PRINCIPAL}', now(), null, null),
      ('${E(8)}', '${A}', 'Cancelled draft', current_date + 6, null, 'Never sent.', array['${C6A}']::uuid[], 'cancelled', '${PRINCIPAL}', null, null, '${PRINCIPAL}', now());
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

describe('a linked family reads its matched child’s notices and events (C331)', () => {
  it('shows the sent notices and invited events of the child’s class and the whole school; a cancelled one says so', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    const child = (await linkedSchool(claims, link, [S1]))?.children.find((c) => c.studentId === S1);
    expect(child?.notices?.map((n) => [n.body, n.wholeSchool])).toEqual([
      ['School closes early on Friday.', true],
      ['Bring a magnet on Monday.', false],
    ]);
    expect(child?.notices?.[0].sentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(child?.events?.map((e) => [e.title, e.startsAt, e.cancelled, e.wholeSchool])).toEqual([
      ['Science fair', '10:00', false, false],
      ['Sports day', '09:00', true, false],
      ['Annual day', null, false, true],
    ]);
  });

  it('as the guardian, the school’s rules let through only sent notices and invited events of the child’s class and the whole school', async () => {
    const seen = await asGuardian(async (c) => ({
      notices: (await c.query(`select notice_id from class_notices order by notice_id`)).rows.map((r: { notice_id: string }) => r.notice_id),
      events: (await c.query(`select event_id from school_events order by event_id`)).rows.map((r: { event_id: string }) => r.event_id),
    }));
    // Waiting, rejected, 6-B's and the other school's notices stay out; a notice from long ago is readable but not listed.
    // Drafts (also a cancelled draft), 6-B's and the other school's events stay out; a past one is readable but not listed.
    expect(seen).toEqual({ notices: [N(1), N(2), N(7)], events: [E(1), E(2), E(4), E(7)] });
  });

  it('a parent never writes, changes or deletes a notice or an event', async () => {
    const writes = [
      `insert into class_notices (school_id, class_id, body, status, written_by) values ('${A}', '${C6A}', 'x', 'waiting', '${P1}')`,
      `insert into school_events (school_id, title, held_on, details, class_ids, status, created_by) values ('${A}', 'x', current_date, 'x', '{}', 'draft', '${P1}')`,
      `update class_notices set body = 'changed' where notice_id = '${N(1)}'`,
      `update school_events set title = 'changed' where event_id = '${E(1)}'`,
      `delete from class_notices where notice_id = '${N(1)}'`,
      `delete from school_events where event_id = '${E(1)}'`,
    ];
    for (const sql of writes) expect(await changes(sql), sql).toBe(0);
    expect(await q(`select body from class_notices where notice_id = $1`, [N(1)])).toEqual([{ body: 'Bring a magnet on Monday.' }]);
    expect(await q(`select title from school_events where event_id = $1`, [E(1)])).toEqual([{ title: 'Science fair' }]);
  });

  it('an unmatched child, an unlinked family, and the family role itself see none of it', async () => {
    const { linkedSchool } = await import('@/lib/family/school');
    expect((await linkedSchool(claims, link))?.children.map((c) => [c.notices, c.events])).toEqual([[null, null]]);
    expect(await linkedSchool({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, link, [S1])).toBeNull();
    const { withFamilyContext } = await import('@/lib/auth/db');
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from class_notices`))).rejects.toThrow();
    await expect(withFamilyContext({ accountId: OTHER_ACCOUNT, tokenVersion: 0 }, (c) => c.query(`select 1 from school_events`))).rejects.toThrow();
  });

  it('the school withdrawing its consent for the child hides its notices and events, the whole school’s too', async () => {
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', false, 'school_attested', 'v1')`, [A, S1]);
    const seen = await asGuardian(async (c) => ({
      notices: (await c.query(`select count(*)::int as n from class_notices`)).rows[0].n,
      events: (await c.query(`select count(*)::int as n from school_events`)).rows[0].n,
    }));
    expect(seen).toEqual({ notices: 0, events: 0 });
    await q(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ($1, $2, 'core_records', true, 'school_attested', 'v1')`, [A, S1]);
  });

  it('staff read and write notices and events as before', async () => {
    const principal = await asStaff('principal', PRINCIPAL)(async (c) => ({
      notices: (await c.query(`select count(*)::int as n from class_notices`)).rows[0].n,
      events: (await c.query(`select count(*)::int as n from school_events`)).rows[0].n,
    }));
    expect(principal).toEqual({ notices: 6, events: 7 });
    const teacher = await asStaff('teacher', TEACHER)(async (c) => {
      await c.query(`insert into class_notices (school_id, class_id, body, status, written_by) values ($1, $2, 'Test tomorrow.', 'waiting', $3)`, [A, C6A, TEACHER]);
      return {
        notices: (await c.query(`select body from class_notices where class_id = $1 order by body`, [C6A])).rows.map((r: { body: string }) => r.body),
        events: (await c.query(`select count(*)::int as n from school_events`)).rows[0].n,
      };
    });
    expect(teacher.notices).toEqual(['Bring a magnet on Monday.', 'Long ago.', 'Rejected words.', 'Still waiting for the principal.', 'Test tomorrow.']);
    expect(teacher.events).toBe(6);
    await asStaff('principal', PRINCIPAL)((c) => c.query(`update school_events set title = 'Science fair 2' where event_id = $1`, [E(1)]));
    expect(await q(`select title from school_events where event_id = $1`, [E(1)])).toEqual([{ title: 'Science fair 2' }]);
  });
});
