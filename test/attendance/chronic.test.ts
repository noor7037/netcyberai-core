import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { CHRONIC, chronicAbsence, reasonText, type DayStatus, type SchoolDay } from '@/lib/early-warning/chronic-absence';
import { chronicList, familyNoticeBody, tellFamily } from '@/lib/attendance/chronic';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';

// W20-B (docs/42 H2): the chronic absence rule (pure), and the list and "Tell the family" on the whole real schema as
// app_user. Every name and number is made up.

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
// Oldest first: a list of marks, one school day each (the 1st of the list is the oldest).
const days = (marks: (DayStatus | null)[]): SchoolDay[] => marks.map((status, i) => ({ date: day(i + 1), status }));
const rep = (n: number, s: DayStatus | null): (DayStatus | null)[] => Array(n).fill(s);

describe('the chronic absence rule', () => {
  it('has the defaults of the brief in one object', () => {
    expect(CHRONIC).toMatchObject({ recentDays: 10, recentAbsences: 3, consecutiveDays: 3, rateDays: 30, ratePercent: 20, tellOnceInDays: 7 });
  });

  it('3 absences in the last 10 school days, with the reason in words', () => {
    const r = chronicAbsence(days([...rep(20, 'present'), 'absent', 'present', 'absent', 'present', 'present', 'absent', 'present', 'present', 'present', 'present']));
    expect(r.chronic).toBe(true);
    expect(r.reasons).toEqual([{ kind: 'recent', absent: 3, of: 10 }]);
    expect(reasonText(r.reasons[0])).toBe('absent 3 of the last 10 school days');
  });

  it('2 absences in 10 is not chronic', () => {
    expect(chronicAbsence(days([...rep(8, 'present'), 'absent', 'absent'])).chronic).toBe(false);
    expect(chronicAbsence(days([...rep(8, 'present'), 'absent', 'present', 'present', 'absent'])).chronic).toBe(false);
  });

  it('3 school days absent in a row, ending at the latest day marked', () => {
    const r = chronicAbsence(days([...rep(5, 'present'), 'absent', 'absent', 'absent']));
    expect(r.reasons[0]).toEqual({ kind: 'consecutive', days: 3, endedOn: day(8) });
    expect(reasonText(r.reasons[0])).toBe('absent 3 school days in a row');
    // Three in a row earlier, back at school since: the streak is over (the 10-day count still sees it, only while it is in the window).
    expect(chronicAbsence(days([...rep(2, 'present'), 'absent', 'absent', 'absent', ...rep(12, 'present')])).reasons.some((x) => x.kind === 'consecutive')).toBe(false);
  });

  it('20 in every 100 of the last 30 school days, only when enough days were marked', () => {
    // 6 absent of 30, none of them close together and none in the last 10 days: only the rate speaks.
    const marks = rep(30, 'present');
    for (const i of [0, 3, 6, 9, 12, 15]) marks[i] = 'absent';
    const r = chronicAbsence(days(marks));
    expect(r.reasons).toEqual([{ kind: 'rate', absent: 6, of: 30, percent: 20 }]);
    expect(reasonText(r.reasons[0])).toBe('absent 6 of the last 30 school days (20 in every 100)');
    // 19 in every 100: not chronic. A short history (10 days, 2 absent = 20 %) is too few days to judge.
    const fewer = rep(30, 'present');
    for (const i of [0, 3, 6, 9, 12]) fewer[i] = 'absent';
    expect(chronicAbsence(days(fewer)).chronic).toBe(false);
    expect(chronicAbsence(days([...rep(8, 'present'), 'absent', 'absent'])).chronic).toBe(false);
  });

  it('leave days (sick, family, a school activity) and unmarked days do not count, for or against', () => {
    // 3 absences, but one of the days is on leave: 2 absences in 9 counted days.
    expect(chronicAbsence(days([...rep(6, 'present'), 'absent', 'leave', 'absent', 'present'])).chronic).toBe(false);
    // Leave between absences does not break the run: absent, leave, absent, absent are 3 school days absent.
    expect(chronicAbsence(days([...rep(6, 'present'), 'absent', 'leave', 'absent', 'absent'])).reasons.some((x) => x.kind === 'consecutive')).toBe(true);
    // A day with no mark is left out, not guessed as absent.
    expect(chronicAbsence(days([...rep(6, 'present'), null, null, 'absent', 'absent'])).chronic).toBe(false);
    // A student who was only on leave is never chronic.
    expect(chronicAbsence(days(rep(30, 'leave'))).chronic).toBe(false);
  });

  it('the family notice names the child by first name only, in plain words, with no marks', () => {
    const body = familyNoticeBody('Asha', { kind: 'recent', absent: 4, of: 10 });
    expect(body).toContain('Asha has been absent on 4 of the last 10 school days.');
    expect(body).toContain('पिछले 10 स्कूली दिनों');
    expect(body.length).toBeLessThanOrEqual(600);
    expect(body).not.toMatch(/marks|%|percent|poor|failing/i);
  });
});

const A = 'c2000000-0000-4000-8000-000000000001';
const u = (n: number) => `c2000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TEACHER_A, TEACHER_B, CLASS_6A, CLASS_6B] = [u(11), u(12), u(13), u(14), u(51), u(52)];
const [ASHA, BELA, CHIRAG, DEV] = [u(31), u(32), u(33), u(34)];
const [ANITA, BINA, CHITRA, DINA] = [u(41), u(42), u(43), u(44)];
const [ACCOUNT, CHILD] = ['fa000000-0000-4000-8000-0000000000b1', 'fa000000-0000-4000-8000-0000000000d1'];
const TODAY = '2026-11-05';
// The ten school days before today (weekdays).
const SCHOOL = ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacherA: Who = { role: 'teacher', user: TEACHER_A };
const teacherB: Who = { role: 'teacher', user: TEACHER_B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;

describe('the chronic absence list and "Tell the family"', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    process.env.DATABASE_URL = db.url;
    process.env.DB_POOL_MAX = '1';
    process.env.APP_SESSION_SECRET = 'test-only-secret-for-chronic-absence-tests-0123456789';
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Anil Admin'),
        ('${TEACHER_A}', '${A}', 'ta@school-a.example', 'teacher', 'Tara Teacher'), ('${TEACHER_B}', '${A}', 'tb@school-a.example', 'teacher', 'Tej Teacher');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_6A}', '${A}', '6-A', '${TEACHER_A}'), ('${CLASS_6B}', '${A}', '6-B', '${TEACHER_B}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${ASHA}', '${A}', 'A-1', 'Asha Verma', 'active', '${CLASS_6A}'), ('${BELA}', '${A}', 'B-1', 'Bela Rao', 'active', '${CLASS_6B}'),
        ('${CHIRAG}', '${A}', 'A-3', 'Chirag Shah', 'active', '${CLASS_6A}'), ('${DEV}', '${A}', 'A-4', 'Dev Nair', 'active', '${CLASS_6A}');
      insert into parents (parent_id, school_id, name, phone, email) values ('${ANITA}', '${A}', 'Guardian of Asha', '9000000001', 'anita@example.org'), ('${BINA}', '${A}', 'Guardian of Bela', '', null),
        ('${CHITRA}', '${A}', 'Guardian of Chirag', '9000000003', null), ('${DINA}', '${A}', 'Guardian of Dev', '', null);
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${ANITA}', '${ASHA}'), ('${A}', '${BINA}', '${BELA}'), ('${A}', '${CHITRA}', '${CHIRAG}'), ('${A}', '${DINA}', '${DEV}');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
        select '${A}', s, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['${ASHA}'::uuid, '${BELA}'::uuid, '${CHIRAG}'::uuid, '${DEV}'::uuid]) s, unnest(array['core_records', 'operational_communication']) p;
      insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'asha-family@example.org');
      insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-HR');
      insert into family.school_links (account_id, school_id, parent_id) values ('${ACCOUNT}', '${A}', '${ANITA}');
      insert into family.child_links (child_id, link_id, account_id, student_id) select '${CHILD}'::uuid, link_id, account_id, '${ASHA}'::uuid from family.school_links where account_id = '${ACCOUNT}';
    `);
    // Asha (6-A): absent on 4 of the 10 school days. Bela (6-B): absent on 3, no way to reach the family. Chirag: absent on 2.
    // Dev: absent on 3 days but one is a day on leave, so 2: not chronic.
    const mark = async (student: string, cls: string, absentOn: number[], leaveOn: number[] = []) => {
      for (const [i, date] of SCHOOL.entries()) {
        const status = absentOn.includes(i) ? 'absent' : leaveOn.includes(i) ? 'leave' : 'present';
        await db.pg.query(`insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, $4, $5)`, [A, student, cls, date, status]);
      }
    };
    await mark(ASHA, CLASS_6A, [1, 3, 5, 8]);
    await mark(BELA, CLASS_6B, [0, 4, 9]);
    await mark(CHIRAG, CLASS_6A, [2, 6]);
    await mark(DEV, CLASS_6A, [1, 4], [7]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => {
    await (await import('@/lib/auth/db')).endPool();
    await db?.stop();
  });

  it('the principal sees every chronic student with the reason; leave days and a lower count are left out', async () => {
    const rows = await as(principal, (c) => chronicList(c, A, TODAY));
    expect(rows.map((r) => [r.name, r.className])).toEqual([['Asha Verma', '6-A'], ['Bela Rao', '6-B']]);
    expect(rows[0].reasons).toEqual([{ kind: 'recent', absent: 4, of: 10 }]);
    expect(rows.every((r) => r.toldOn === null && r.daysSinceTold === null && r.tellAgainOn === null)).toBe(true);
    expect((await as(admin, (c) => chronicList(c, A, TODAY))).length).toBe(2);
  });

  it('a teacher sees only their own classes', async () => {
    expect((await as(teacherA, (c) => chronicList(c, A, TODAY))).map((r) => r.name)).toEqual(['Asha Verma']);
    expect((await as(teacherB, (c) => chronicList(c, A, TODAY))).map((r) => r.name)).toEqual(['Bela Rao']);
  });

  it('only the principal tells the family', async () => {
    expect(await as(admin, (c) => tellFamily(c, queue, actor(admin), ASHA, TODAY))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(teacherA, (c) => tellFamily(c, queue, actor(teacherA), ASHA, TODAY))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await q(`select 1 from class_notices where kind = 'chronic_absence'`)).toEqual([]);
  });

  it('a student who is not on the list cannot be told about', async () => {
    expect(await as(principal, (c) => tellFamily(c, queue, actor(principal), CHIRAG, TODAY))).toEqual({ ok: false, reason: 'not_chronic' });
  });

  it('a family nobody can reach is not told, and no notice is left waiting', async () => {
    expect(await as(principal, (c) => tellFamily(c, queue, actor(principal), BELA, TODAY))).toEqual({ ok: false, reason: 'nobody' });
    expect(await q(`select 1 from class_notices where student_id = $1`, [BELA])).toEqual([]);
  });

  it('the principal tells the family: the notice, the Family app, the email and the audit row; a second tell within 7 days is refused', async () => {
    const done = await as(principal, (c) => tellFamily(c, queue, actor(principal), ASHA, TODAY));
    expect(done).toMatchObject({ ok: true, inApp: 1, byEmail: 1 });
    const [notice] = await q(`select kind, status, student_id, class_id, body from class_notices where student_id = $1`, [ASHA]);
    expect(notice).toMatchObject({ kind: 'chronic_absence', status: 'sent', student_id: ASHA, class_id: CLASS_6A });
    expect(notice.body).toContain('Asha has been absent on 4 of the last 10 school days.');
    expect(notice.body).not.toContain('Verma');
    // The email job, to the guardian's address.
    const mail = (await q(`select payload from jobs where type = 'email.send'`)).map((r: { payload: { to: string[]; template: string } }) => r.payload);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: ['anita@example.org'], template: 'school_notice' });
    // The audit row.
    const audit = await q(`select actor_role, target_type, target_id, after_state from audit_log where event_action = 'attendance.chronic_told'`);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_role: 'principal', target_type: 'students', target_id: ASHA });
    expect(audit[0].after_state).toMatchObject({ noticeId: done.ok ? done.noticeId : '', reasons: ['absent 4 of the last 10 school days'], inApp: 1, byEmail: 1 });
    // The list says so, and the same day a second tell is refused until 7 days have passed.
    const [asha] = await as(principal, (c) => chronicList(c, A, TODAY));
    expect(asha).toMatchObject({ studentId: ASHA, daysSinceTold: 0 });
    expect(asha.tellAgainOn).not.toBeNull();
    expect(await as(principal, (c) => tellFamily(c, queue, actor(principal), ASHA, TODAY))).toMatchObject({ ok: false, reason: 'told_recently', tellAgainOn: asha.tellAgainOn });
    expect(await q(`select 1 from class_notices where student_id = $1`, [ASHA])).toHaveLength(1);
    // Seven days on, the button is back.
    const later = await as(principal, (c) => chronicList(c, A, '2026-11-12'));
    expect(later.find((r) => r.studentId === ASHA)?.tellAgainOn ?? null).toBeNull();
  });

  it('the notice appears for the linked family only, and no other family in the class sees it', async () => {
    const { activeLinks, schoolNoticesFor } = await import('@/lib/family/school');
    const { withFamilyContext } = await import('@/lib/auth/db');
    const claims = { accountId: ACCOUNT, tokenVersion: 0 };
    const links = await withFamilyContext(claims, (c) => activeLinks(c, ACCOUNT));
    const shown = await schoolNoticesFor(claims, links, []);
    expect(shown.map((n) => n.body)).toHaveLength(1);
    expect(shown[0].body).toContain('Asha has been absent');
    // A guardian of another child of the same class reads no such notice: the school's own rule keeps it to Asha's family.
    const seen = await db.pg.transaction(async (tx: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', 'parent'], ['app.current_user_id', CHITRA]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return (await tx.query(`select 1 from class_notices where kind = 'chronic_absence'`)).rows;
    });
    expect(seen).toEqual([]);
  });
});
