import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { correctionWindowDays, decideCorrectionRequest, officeCorrectAttendance, submitAttendance, waitingCorrectionRequests, withinCorrectionWindow, type AttendanceEntry } from '@/lib/attendance/attendance';
import { ATTENDANCE_MARK, SENT_TO_OFFICE_KEY, sendAttendanceMark, type AttendanceMark } from '@/lib/offline/attendance-sender';
import { createOutbox } from '@/lib/offline/outbox';
import { memoryStore } from '@/lib/offline/store';

// The office's correction path (C146), on the whole real schema as app_user:
// a past day entered or corrected by the principal or school admin, with a
// reason, audited, inside the school's window; and a phone's late marks
// waiting in the office's queue instead of being refused.

const A = 'f1000000-0000-4000-8000-000000000001';
const B = 'f1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'f1000000-0000-4000-8000-0000000000a1';
const ADMIN = 'f1000000-0000-4000-8000-0000000000a2';
const TEACHER = 'f1000000-0000-4000-8000-0000000000a3';
const OTHER_TEACHER = 'f1000000-0000-4000-8000-0000000000a4';
const COORD = 'f1000000-0000-4000-8000-0000000000a5';
const PRINCIPAL_B = 'f1000000-0000-4000-8000-0000000000b1';
const CLASS = 'f1000000-0000-4000-8000-0000000000c1';
const sid = (n: number) => `f1000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), other: sid(20) };
const TODAY = '2026-10-12';
const YESTERDAY = '2026-10-11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const otherTeacher: Who = { role: 'teacher', user: OTHER_TEACHER, school: A };
const coord: Who = { role: 'academic_coordinator', user: COORD, school: A };
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
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const marks = (date: string) => rows(`select student_id, status, leave_code, marked_by from attendance where school_id = $1 and date = $2 order by student_id`, [A, date]);
const reset = () => db.pg.exec(`delete from attendance; delete from attendance_correction_requests; delete from client_operations; delete from usage_events; delete from school_settings;`);
const correct = (who: Who, studentId: string, date: string, status: 'present' | 'absent' | 'late' | 'leave', reason: string, today = TODAY) =>
  as(who, (c) => officeCorrectAttendance(c, actor(who), { studentId, date, status, leaveCode: status === 'leave' ? 'sick' : null, reason, today }));
const late = (who: Who, entries: AttendanceEntry[], forDate: string, today = TODAY, operationId: string | null = null) =>
  as(who, (c) => submitAttendance(c, { schoolId: who.school, classId: CLASS, forDate, today, markedBy: who.user, entries, operationId, secondsToMark: 30 }));
const all = (absent: string[] = []): AttendanceEntry[] => [S.asha, S.bilal, S.chitra].map((studentId) => ({ studentId, status: absent.includes(studentId) ? 'absent' : 'present' }));
const decide = (who: Who, requestId: string, action: 'apply' | 'dismiss', reason: string, today = TODAY) => as(who, (c) => decideCorrectionRequest(c, actor(who), { requestId, action, reason, today }));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ADMIN}', '${A}', 'ad@a.invalid', 'school_admin', 'Admin A'),
      ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${OTHER_TEACHER}', '${A}', 'o@a.invalid', 'teacher', 'Other Teacher'),
      ('${COORD}', '${A}', 'c@a.invalid', 'academic_coordinator', 'Coordinator'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS}', '${A}', '5-A', '${TEACHER}');
    insert into students (student_id, school_id, admission_no, name, class_id) values
      ('${S.asha}', '${A}', 'A-1', 'Asha', '${CLASS}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${CLASS}'), ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${CLASS}');
    alter table students disable trigger user;
    update students set status = 'active';
    alter table students enable trigger user;
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the window', () => {
  it('is a past day, no further back than the school’s setting (7 days unless changed)', async () => {
    expect([['2026-10-11', 7], ['2026-10-05', 7], ['2026-10-04', 7], ['2026-10-12', 7], ['2026-10-13', 7], ['2026-10-11', 0], ['2026-09-30', 30]].map(([d, w]) => withinCorrectionWindow(d as string, TODAY, w as number))).toEqual([true, true, false, false, false, false, true]);
    expect(await as(principal, (c) => correctionWindowDays(c, A))).toBe(7);
    await db.pg.query(`insert into school_settings (school_id, module_id, schema_version, setting_values) values ($1, 'attendance', 1, '{"correction_window_days": 2}')`, [A]);
    expect(await as(principal, (c) => correctionWindowDays(c, A))).toBe(2);
    expect(await correct(principal, S.asha, '2026-10-09', 'absent', 'Was on the register as absent')).toEqual({ ok: false, reason: 'outside_window' });
    expect((await correct(principal, S.asha, '2026-10-10', 'absent', 'Was on the register as absent')).ok).toBe(true);
  });
});

describe('the office enters or corrects a past day', () => {
  it('with a reason, inside the window, and each change is in the audit log with that reason', async () => {
    await reset();
    const entered = await correct(principal, S.asha, YESTERDAY, 'absent', 'The class teacher was on leave; taken from the paper register');
    expect(entered).toMatchObject({ ok: true, entered: true });
    const changed = await correct(admin, S.asha, YESTERDAY, 'leave', 'Parent brought a medical note');
    expect(changed).toMatchObject({ ok: true, entered: false });
    expect(await marks(YESTERDAY)).toEqual([{ student_id: S.asha, status: 'leave', leave_code: 'sick', marked_by: PRINCIPAL }]);
    const audit = await rows(`select event_action, actor_user_id, before_state, after_state from audit_log where school_id = $1 and event_action like 'attendance.office_%' and after_state->>'date' = $2 order by audit_id`, [A, YESTERDAY]);
    expect(audit).toEqual([
      { event_action: 'attendance.office_enter', actor_user_id: PRINCIPAL, before_state: null, after_state: { status: 'absent', leaveCode: null, date: YESTERDAY, reason: 'The class teacher was on leave; taken from the paper register' } },
      { event_action: 'attendance.office_correct', actor_user_id: ADMIN, before_state: { status: 'absent', leaveCode: null }, after_state: { status: 'leave', leaveCode: 'sick', date: YESTERDAY, reason: 'Parent brought a medical note' } },
    ]);
    // No message goes to a family about a past day.
    expect(await rows(`select 1 from communication_log where school_id = $1`, [A])).toEqual([]);
  });

  it('is refused without a reason, for today or a day to come, past the window, for an unknown student, and for anyone but the principal or school admin', async () => {
    await reset();
    expect(await correct(principal, S.asha, YESTERDAY, 'absent', '   ')).toEqual({ ok: false, reason: 'reason_required' });
    expect(await correct(principal, S.asha, TODAY, 'absent', 'r')).toEqual({ ok: false, reason: 'outside_window' });
    expect(await correct(principal, S.asha, '2026-10-13', 'absent', 'r')).toEqual({ ok: false, reason: 'outside_window' });
    expect(await correct(principal, S.asha, '2026-10-04', 'absent', 'r')).toEqual({ ok: false, reason: 'outside_window' });
    expect(await correct(principal, S.other, YESTERDAY, 'absent', 'r')).toEqual({ ok: false, reason: 'unknown_student' });
    for (const who of [teacher, coord]) expect(await correct(who, S.asha, YESTERDAY, 'absent', 'r')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await correct(principalB, S.asha, YESTERDAY, 'absent', 'r')).toEqual({ ok: false, reason: 'unknown_student' });
    expect(await marks(YESTERDAY)).toEqual([]);
  });
});

describe('a phone’s marks that arrive after their day ended', () => {
  it('become a request in the office’s queue: no mark is saved, nothing is measured, and a repeat does not make a second request', async () => {
    await reset();
    const id = 'f2000000-0000-4000-8000-000000000001';
    const first = await late(teacher, all([S.bilal]), YESTERDAY, TODAY, id);
    expect(first).toMatchObject({ outcome: 'sent_to_office', replayed: false, forDate: YESTERDAY });
    expect(await late(teacher, all([S.bilal]), YESTERDAY, TODAY, id)).toMatchObject({ outcome: 'sent_to_office', replayed: true });
    expect(await marks(YESTERDAY)).toEqual([]);
    expect(await rows(`select 1 from usage_events`)).toEqual([]);
    const queue = await as(principal, (c) => waitingCorrectionRequests(c, A, TODAY));
    expect(queue).toMatchObject([{ class_name: '5-A', for_date: YESTERDAY, requested_by_name: 'Teacher A', students: 3, in_window: true }]);
  });

  it('older than the window, or for a day to come, they are still refused', async () => {
    await reset();
    expect(await late(teacher, all(), '2026-10-04')).toMatchObject({ outcome: 'day_passed' });
    expect(await late(teacher, all(), '2026-10-13')).toMatchObject({ outcome: 'day_passed' });
    expect(await rows(`select 1 from attendance_correction_requests`)).toEqual([]);
  });

  it('the phone is told: the change leaves the outbox and the screen has a notice to show', async () => {
    await reset();
    const store = memoryStore();
    const outbox = createOutbox(store, { newId: () => 'f2000000-0000-4000-8000-000000000002' });
    await outbox.add<AttendanceMark>(ATTENDANCE_MARK, YESTERDAY, { classId: CLASS, entries: all() as AttendanceMark['entries'], secondsToMark: 20 });
    const status = await outbox.flush({
      [ATTENDANCE_MARK]: (op) =>
        sendAttendanceMark(op, store, async (_url, init) => {
          const body = JSON.parse(String(init.body));
          return Response.json(await late(teacher, body.entries, body.forDate, TODAY, body.operationId), { status: 202 });
        }),
    });
    expect(status).toMatchObject({ waiting: 0, failed: 0 });
    expect(await store.get(SENT_TO_OFFICE_KEY)).toEqual([{ classId: CLASS, date: YESTERDAY }]);
    expect(await rows(`select 1 from attendance_correction_requests`)).toHaveLength(1);
  });

  it('applying fills in the students with no mark, keeps a mark already saved, and is audited with the reason; then it is no longer waiting', async () => {
    await reset();
    await late(teacher, all([S.bilal]), YESTERDAY);
    await correct(principal, S.bilal, YESTERDAY, 'present', 'Seen in school by the principal'); // already marked by the office
    const [request] = await as(principal, (c) => waitingCorrectionRequests(c, A, TODAY));
    expect(await decide(principal, request.request_id, 'apply', '')).toEqual({ ok: false, reason: 'reason_required' });
    expect(await decide(admin, request.request_id, 'apply', 'The teacher had no network at the camp')).toEqual({ ok: true, applied: 2, kept: 1 });
    expect((await marks(YESTERDAY)).map((m: { student_id: string; status: string; marked_by: string }) => [m.student_id, m.status, m.marked_by])).toEqual([[S.asha, 'present', TEACHER], [S.bilal, 'present', PRINCIPAL], [S.chitra, 'present', TEACHER]]);
    expect(await as(principal, (c) => waitingCorrectionRequests(c, A, TODAY))).toEqual([]);
    expect(await decide(admin, request.request_id, 'apply', 'again')).toEqual({ ok: false, reason: 'not_found' });
    const audit = await rows(`select actor_user_id, after_state from audit_log where school_id = $1 and event_action = 'attendance.request_applied'`, [A]);
    expect(audit).toEqual([{ actor_user_id: ADMIN, after_state: { applied: 2, kept: 1, reason: 'The teacher had no network at the camp' } }]);
    expect(await rows(`select 1 from communication_log where school_id = $1`, [A])).toEqual([]);
  });

  it('dismissing saves nothing; a request past the window can only be dismissed', async () => {
    await reset();
    await late(teacher, all(), YESTERDAY);
    const [request] = await as(principal, (c) => waitingCorrectionRequests(c, A, TODAY));
    // Ten days later the office finds it.
    expect(await decide(principal, request.request_id, 'apply', 'late', '2026-10-22')).toEqual({ ok: false, reason: 'outside_window' });
    expect((await as(principal, (c) => waitingCorrectionRequests(c, A, '2026-10-22')))[0]).toMatchObject({ in_window: false });
    expect(await decide(principal, request.request_id, 'dismiss', 'Too old to be sure of', '2026-10-22')).toEqual({ ok: true, applied: 0, kept: 0 });
    expect(await marks(YESTERDAY)).toEqual([]);
    expect(await rows(`select status, decided_by, decision_reason from attendance_correction_requests`)).toEqual([{ status: 'dismissed', decided_by: PRINCIPAL, decision_reason: 'Too old to be sure of' }]);
  });

  it('the queue is the office’s: a teacher sees only their own request and cannot decide it; another school sees nothing', async () => {
    await reset();
    await late(teacher, all(), YESTERDAY);
    const [request] = await as(principal, (c) => waitingCorrectionRequests(c, A, TODAY));
    const seen = (who: Who) => as(who, (c) => c.query(`select 1 from attendance_correction_requests`).then((r: { rows: unknown[] }) => r.rows.length));
    expect([await seen(teacher), await seen(otherTeacher), await seen(coord), await seen(principalB), await seen(admin)]).toEqual([1, 0, 0, 0, 1]);
    expect(await decide(teacher, request.request_id, 'apply', 'mine')).toEqual({ ok: false, reason: 'not_allowed' });
    // Whatever the code does, the database refuses a teacher's decision and a request in another's name.
    expect(await as(teacher, (c) => c.query(`update attendance_correction_requests set status = 'applied', decided_by = $1 returning 1`, [TEACHER]).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    await expect(as(otherTeacher, (c) => c.query(`insert into attendance_correction_requests (school_id, class_id, for_date, requested_by, entries) values ($1, $2, $3, $4, '[]')`, [A, CLASS, YESTERDAY, TEACHER]))).rejects.toThrow(/row-level security/);
    expect(await rows(`select grantee from information_schema.role_table_grants where table_name = 'attendance_correction_requests' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).toEqual([]);
  });
});
