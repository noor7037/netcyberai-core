import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { GuardianNotActiveError, recordConsentDecision, type ConsentPurpose } from '@/lib/consent/gate';
import { nextStudentStatus } from '@/lib/consent/student-status';
import { REQUIRED_CONSENT_PURPOSES } from '@/lib/onboarding/stages';
import { getAttendanceRoster } from '@/lib/attendance/attendance';

// A student's status follows the consent ledger (C142), on the whole real
// schema (every migration replayed on PGlite) and as the app runs it: one
// transaction as app_user, in the school's context, with the caller's role.

const MIGRATION = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20261011125059_student_status_follows_consent.sql'),
  'utf8'
);
const A = 'c1000000-0000-4000-8000-000000000001';
const B = 'c1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'c1000000-0000-4000-8000-0000000000a1';
const TEACHER = 'c1000000-0000-4000-8000-0000000000a2';
const PRINCIPAL_B = 'c1000000-0000-4000-8000-0000000000b1';
const CLASS_A = 'c1000000-0000-4000-8000-0000000000c1';
const CLASS_B = 'c1000000-0000-4000-8000-0000000000c2';
const GUARDIAN = 'c1000000-0000-4000-8000-0000000000e1'; // verified for every student of school A
const UNVERIFIED = 'c1000000-0000-4000-8000-0000000000e2';
const GUARDIAN_B = 'c1000000-0000-4000-8000-0000000000e3';
const sid = (n: number) => `c1000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), dev: sid(4), esha: sid(5), farid: sid(6), left: sid(7), other: sid(20) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
// The ledger's "latest row" is by created_at; the harness clock ticks in
// milliseconds, so two decisions on one purpose are kept a tick apart.
const tick = () => new Promise((r) => setTimeout(r, 5));
const decide = async (who: Who, studentId: string, purpose: ConsentPurpose, granted: boolean, parentId = GUARDIAN) => {
  await tick();
  return as(who, (client) =>
    recordConsentDecision(client, { schoolId: who.school, studentId, purpose, granted, parentId, actorUserId: who.user, actorRole: who.role as never, noticeVersion: 'v1' })
  );
};
const statusOf = async (studentId: string) => (await db.pg.query(`select status::text as s from students where student_id = $1`, [studentId])).rows[0].s as string;
const count = async (sql: string, params: unknown[] = []) => Number((await db.pg.query(sql, params)).rows[0].n);
const ledgerRows = (studentId: string) => count(`select count(*) as n from consent_ledger where student_id = $1`, [studentId]);
const statusAudits = async (studentId: string) =>
  (await db.pg.query(`select event_action, actor_user_id, actor_role::text as actor_role, before_state, after_state from audit_log where target_type = 'students' and target_id = $1 and event_action like 'student.%' order by occurred_at, audit_id`, [studentId])).rows;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_A}', '${A}', '5-A', '${TEACHER}'), ('${CLASS_B}', '${B}', '5-A', null);
    insert into students (student_id, school_id, admission_no, name, class_id) values
      ('${S.asha}', '${A}', 'A-1', 'Asha', '${CLASS_A}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${CLASS_A}'),
      ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${CLASS_A}'), ('${S.dev}', '${A}', 'A-4', 'Dev', '${CLASS_A}'),
      ('${S.esha}', '${A}', 'A-5', 'Esha', '${CLASS_A}'), ('${S.farid}', '${A}', 'A-6', 'Farid', '${CLASS_A}'),
      ('${S.other}', '${B}', 'B-1', 'Other school', '${CLASS_B}');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${S.left}', '${A}', 'A-7', 'Left', '${CLASS_A}', 'transferred');
    insert into parents (parent_id, school_id, name, phone) values
      ('${GUARDIAN}', '${A}', 'Guardian', '9800000001'), ('${UNVERIFIED}', '${A}', 'Not verified', '9800000002'), ('${GUARDIAN_B}', '${B}', 'Guardian B', '9800000003');
    insert into parent_student_map (school_id, parent_id, student_id, verification_status, verification_method)
      select '${A}', '${GUARDIAN}', student_id, 'active', 'school_attested' from students where school_id = '${A}';
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${UNVERIFIED}', '${S.bilal}');
    insert into parent_student_map (school_id, parent_id, student_id, verification_status, verification_method) values ('${B}', '${GUARDIAN_B}', '${S.other}', 'active', 'school_attested');
  `);
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

describe('the rule', () => {
  it('moves only between pending_consent and active', () => {
    const grant = { purpose: 'operational_communication', granted: true };
    const withdraw = { purpose: 'operational_communication', granted: false };
    expect(nextStudentStatus('pending_consent', true, grant)).toBe('active');
    expect(nextStudentStatus('pending_consent', false, grant)).toBeNull();
    expect(nextStudentStatus('active', false, withdraw)).toBe('pending_consent');
    expect(nextStudentStatus('active', true, withdraw)).toBeNull();
    // Only the withdrawal of a required purpose sends a student back.
    expect(nextStudentStatus('active', false, grant)).toBeNull();
    expect(nextStudentStatus('active', false, { purpose: 'daily_pulse', granted: false })).toBeNull();
    for (const s of ['inactive', 'transferred']) for (const g of [true, false]) for (const d of [grant, withdraw]) expect(nextStudentStatus(s, g, d)).toBeNull();
  });

  it('the database and the code name the same required purposes', async () => {
    expect([...REQUIRED_CONSENT_PURPOSES].sort()).toEqual(['core_records', 'operational_communication']);
    const src = MIGRATION.match(/cl\.purpose in \(([^)]*)\)/)![1];
    expect(src.split(',').map((p) => p.trim().replace(/'/g, '')).sort()).toEqual([...REQUIRED_CONSENT_PURPOSES].sort());
  });
});

describe('becoming active', () => {
  it('a student stays pending until every required purpose is granted by a verified guardian, then becomes active', async () => {
    expect(await statusOf(S.asha)).toBe('pending_consent');
    const roster = () => as(teacher, (c) => getAttendanceRoster(c, { schoolId: A, classId: CLASS_A, date: '2026-10-12', today: '2026-10-12' }));
    // Waiting for consent, the student is in the roster with the tag (C143).
    expect((await roster()).find((r: { student_id: string }) => r.student_id === S.asha)).toMatchObject({ consent_pending: true });

    const first = await decide(principal, S.asha, 'core_records', true);
    expect(first.studentStatusChange).toBeNull();
    expect(await statusOf(S.asha)).toBe('pending_consent');

    const second = await decide(principal, S.asha, 'operational_communication', true);
    expect(second.studentStatusChange).toEqual({ from: 'pending_consent', to: 'active' });
    expect(await statusOf(S.asha)).toBe('active');
    // Active now: the tag is gone.
    expect((await roster()).find((r: { student_id: string }) => r.student_id === S.asha)).toMatchObject({ consent_pending: false });

    const audits = await statusAudits(S.asha);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ event_action: 'student.activated', actor_user_id: PRINCIPAL, actor_role: 'principal', before_state: { status: 'pending_consent' } });
    expect(audits[0].after_state).toEqual({ status: 'active', reason: 'required_consents_granted', consentId: second.consent_id });

    // Granting again changes nothing and writes no second status row.
    expect((await decide(principal, S.asha, 'operational_communication', true)).studentStatusChange).toBeNull();
    expect(await statusAudits(S.asha)).toHaveLength(1);
  });

  it('a guardian who is not verified cannot grant, so the student stays pending', async () => {
    await decide(principal, S.bilal, 'core_records', true);
    await expect(decide(principal, S.bilal, 'operational_communication', true, UNVERIFIED)).rejects.toBeInstanceOf(GuardianNotActiveError);
    expect(await statusOf(S.bilal)).toBe('pending_consent');
    expect(await ledgerRows(S.bilal)).toBe(1);
  });

  it('optional purposes alone never make a student active', async () => {
    for (const p of ['daily_pulse', 'recognition', 'weekly_brief', 'at_risk'] as const) await decide(principal, S.chitra, p, true);
    await decide(principal, S.chitra, 'operational_communication', true);
    expect(await statusOf(S.chitra)).toBe('pending_consent');
    expect(await statusAudits(S.chitra)).toHaveLength(0);
  });

  it('a transferred student is never moved by consent', async () => {
    await decide(principal, S.left, 'core_records', true);
    const r = await decide(principal, S.left, 'operational_communication', true);
    expect(r.studentStatusChange).toBeNull();
    expect(await statusOf(S.left)).toBe('transferred');
  });
});

describe('who can cause it', () => {
  it('a teacher cannot: the completing grant is refused and nothing is saved', async () => {
    await decide(principal, S.dev, 'core_records', true);
    await expect(decide(teacher, S.dev, 'operational_communication', true)).rejects.toThrow(/principal or school admin/);
    expect(await statusOf(S.dev)).toBe('pending_consent');
    expect(await ledgerRows(S.dev)).toBe(1);
    expect(await statusAudits(S.dev)).toHaveLength(0);
  });

  it('a teacher cannot set the status directly, even for a student of their own class', async () => {
    await expect(as(teacher, (c) => c.query(`update students set status = 'active' where student_id = $1`, [S.dev]))).rejects.toThrow(/principal or school admin/);
    await expect(as(teacher, (c) => c.query(`update students set status = 'inactive' where student_id = $1`, [S.asha]))).rejects.toThrow(/principal or school admin/);
    // Other columns stay open to the teacher (document review writes them).
    const ok = await as<any>(teacher, (c) => c.query(`update students set roll_no = roll_no where student_id = $1`, [S.asha]));
    expect(ok.affectedRows ?? ok.rowCount).toBe(1);
  });

  it('the office cannot make a student active without the required consents, nor add one as active', async () => {
    await expect(as(principal, (c) => c.query(`update students set status = 'active' where student_id = $1`, [S.dev]))).rejects.toThrow(/every required consent/);
    await expect(as(principal, (c) => c.query(`insert into students (school_id, name, status) values ($1, 'Shortcut', 'active')`, [A]))).rejects.toThrow(/starts as pending_consent/);
    expect(await statusOf(S.dev)).toBe('pending_consent');
  });
});

describe('another school', () => {
  it('is not touched, and cannot be reached', async () => {
    // School B's student is in the same position as Asha was; nothing above moved them.
    expect(await statusOf(S.other)).toBe('pending_consent');
    // School A's office cannot record for B's student (not linked; the row is not theirs to see).
    await expect(decide(principal, S.other, 'core_records', true, GUARDIAN_B)).rejects.toThrow(/not linked/);
    await expect(as(principal, (c) => c.query(`select public.student_required_consents_granted($1, $2) as g`, [B, S.other]))).resolves.toMatchObject({ rows: [{ g: false }] });
    const direct = await as<any>(principal, (c) => c.query(`update students set status = 'inactive' where student_id = $1`, [S.other]));
    expect(direct.affectedRows ?? direct.rowCount).toBe(0);
    expect(await ledgerRows(S.other)).toBe(0);

    // B's own office activates B's student; A's students do not change.
    const before = await statusOf(S.dev);
    await decide(principalB, S.other, 'core_records', true, GUARDIAN_B);
    await decide(principalB, S.other, 'operational_communication', true, GUARDIAN_B);
    expect(await statusOf(S.other)).toBe('active');
    expect(await statusOf(S.dev)).toBe(before);
    expect(await count(`select count(*) as n from audit_log where school_id = $1 and event_action like 'student.%'`, [B])).toBe(1);
  });
});

describe('withdrawing', () => {
  it('a required purpose returns an active student to pending_consent; granting it again restores active', async () => {
    await decide(principal, S.esha, 'core_records', true);
    await decide(principal, S.esha, 'operational_communication', true);
    await decide(principal, S.esha, 'daily_pulse', true);
    expect(await statusOf(S.esha)).toBe('active');

    // An optional purpose withdrawn: no change.
    expect((await decide(principal, S.esha, 'daily_pulse', false)).studentStatusChange).toBeNull();
    expect(await statusOf(S.esha)).toBe('active');

    const out = await decide(principal, S.esha, 'operational_communication', false);
    expect(out.studentStatusChange).toEqual({ from: 'active', to: 'pending_consent' });
    expect(await statusOf(S.esha)).toBe('pending_consent');

    const back = await decide(principal, S.esha, 'operational_communication', true);
    expect(back.studentStatusChange).toEqual({ from: 'pending_consent', to: 'active' });
    expect((await statusAudits(S.esha)).map((a: { event_action: string }) => a.event_action)).toEqual([
      'student.activated',
      'student.returned_to_pending_consent',
      'student.activated',
    ]);
    // The ledger kept every decision.
    expect(await ledgerRows(S.esha)).toBe(6);
  });
});

describe('a student made active before this rule, with no consent on record', () => {
  it('is not sent back by a grant or by an optional purpose, only by withdrawing a required one', async () => {
    await db.pg.query(`update students set status = 'active' where student_id = $1`, [S.farid]);
    expect((await decide(principal, S.farid, 'daily_pulse', true)).studentStatusChange).toBeNull();
    expect((await decide(principal, S.farid, 'core_records', true)).studentStatusChange).toBeNull();
    expect((await decide(principal, S.farid, 'daily_pulse', false)).studentStatusChange).toBeNull();
    expect(await statusOf(S.farid)).toBe('active');
    expect((await decide(principal, S.farid, 'core_records', false)).studentStatusChange).toEqual({ from: 'active', to: 'pending_consent' });
  });
});

describe('the one-time backfill', () => {
  it('activates students who already had the required consents, once, each with an audit row', async () => {
    const [ready, half, withdrawn] = [sid(11), sid(12), sid(13)];
    await db.pg.exec(`
      insert into students (student_id, school_id, admission_no, name) values
        ('${ready}', '${A}', 'A-11', 'Ready'), ('${half}', '${A}', 'A-12', 'Half'), ('${withdrawn}', '${A}', 'A-13', 'Withdrawn');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) values
        ('${A}', '${ready}', 'core_records', true, 'school_attested', 'v1', now() - interval '2 days'),
        ('${A}', '${ready}', 'operational_communication', true, 'school_attested', 'v1', now() - interval '2 days'),
        ('${A}', '${half}', 'core_records', true, 'school_attested', 'v1', now() - interval '2 days'),
        ('${A}', '${withdrawn}', 'core_records', true, 'school_attested', 'v1', now() - interval '2 days'),
        ('${A}', '${withdrawn}', 'operational_communication', true, 'school_attested', 'v1', now() - interval '2 days'),
        ('${A}', '${withdrawn}', 'operational_communication', false, 'school_attested', 'v1', now() - interval '1 day');
    `);
    const pendingBefore = await count(`select count(*) as n from students where status = 'pending_consent'`);
    const lastHash = (await db.pg.query(`select row_hash from audit_log where school_id = $1 order by occurred_at desc, audit_id desc limit 1`, [A])).rows[0].row_hash;

    await db.pg.exec(MIGRATION);
    expect(await statusOf(ready)).toBe('active');
    expect(await statusOf(half)).toBe('pending_consent');
    expect(await statusOf(withdrawn)).toBe('pending_consent');
    expect(await count(`select count(*) as n from students where status = 'pending_consent'`)).toBe(pendingBefore - 1);

    const audits = await db.pg.query(`select actor_user_id, actor_role, target_id, before_state, after_state, prev_hash from audit_log where after_state->>'source' = 'backfill_c142'`);
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({ actor_user_id: null, actor_role: null, target_id: ready, before_state: { status: 'pending_consent' }, prev_hash: lastHash });
    expect(audits.rows[0].after_state).toMatchObject({ status: 'active', reason: 'required_consents_granted' });

    // Running the migration again finds nothing to do.
    await db.pg.exec(MIGRATION);
    expect(await count(`select count(*) as n from audit_log where after_state->>'source' = 'backfill_c142'`)).toBe(1);
  });
});
