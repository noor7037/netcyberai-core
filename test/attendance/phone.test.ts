import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { ATTENDANCE_STATUSES, LEAVE_CODES, correctAttendance, getAttendanceRoster, submitAttendance, type AttendanceEntry, type SubmitAttendanceResult } from '@/lib/attendance/attendance';
import { ATTENDANCE_MARK, differencesKey, rosterKey, sendAttendanceMark, type AttendanceMark, type Difference, type KeptRoster } from '@/lib/offline/attendance-sender';
import { createOutbox, type Sender } from '@/lib/offline/outbox';
import { memoryStore } from '@/lib/offline/store';
import { indiaDate, isIsoDate } from '@/lib/time/india';

// Attendance on the phone (docs/20 5b, C144), on the whole real schema
// (every migration replayed on PGlite) and as the app runs it: one
// transaction as app_user, in the school's context, with the caller's role.
// The phone's side is the real outbox and the real sender; only the network
// is stood in for, by a function that can be switched off or made to lose
// the answer.

const A = 'd1000000-0000-4000-8000-000000000001';
const B = 'd1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'd1000000-0000-4000-8000-0000000000a1';
const CLASS_TEACHER = 'd1000000-0000-4000-8000-0000000000a2'; // class teacher of 5-A, teaches no subject in it
const OTHER_TEACHER = 'd1000000-0000-4000-8000-0000000000a3'; // teaches in 6-A only
const TEACHER_B = 'd1000000-0000-4000-8000-0000000000b1';
const CLASS_5A = 'd1000000-0000-4000-8000-0000000000c1';
const CLASS_6A = 'd1000000-0000-4000-8000-0000000000c2';
const CLASS_B = 'd1000000-0000-4000-8000-0000000000c3';
const GUARDIAN = 'd1000000-0000-4000-8000-0000000000e1';
const sid = (n: number) => `d1000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), chitra: sid(3), pending: sid(4), sixth: sid(10), other: sid(20) };
const DAY = '2026-10-12';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const classTeacher: Who = { role: 'teacher', user: CLASS_TEACHER, school: A };
const otherTeacher: Who = { role: 'teacher', user: OTHER_TEACHER, school: A };
const teacherB: Who = { role: 'teacher', user: TEACHER_B, school: B };

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
const rows = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
const marks = (date = DAY) => rows(`select student_id, status, leave_code, class_id, date::text as date, marked_by from attendance where school_id = $1 and date = $2 order by student_id`, [A, date]);
const reset = () => db.pg.exec(`delete from attendance; delete from client_operations; delete from usage_events; delete from communication_log;`);

const submit = (who: Who, classId: string, entries: AttendanceEntry[], more: { operationId?: string; forDate?: string; today?: string; secondsToMark?: number | null } = {}) =>
  as(who, (c) => submitAttendance(c, { schoolId: who.school, classId, forDate: more.forDate ?? more.today ?? DAY, today: more.today ?? DAY, markedBy: who.user, entries, operationId: more.operationId ?? null, secondsToMark: more.secondsToMark ?? null }));

// The network between the phone and POST /api/app/attendance, answering as the route does.
function network(who: Who, today = DAY) {
  const state = { on: true, loseAnswer: false, calls: 0 };
  const doFetch = async (_url: string, init: RequestInit): Promise<Response> => {
    if (!state.on) throw new TypeError('network off');
    state.calls += 1;
    const body = JSON.parse(String(init.body));
    const result = (await submit(who, body.classId, body.entries, { operationId: body.operationId, forDate: body.forDate, today, secondsToMark: body.secondsToMark })) as SubmitAttendanceResult;
    if (state.loseAnswer) {
      state.loseAnswer = false;
      throw new TypeError('answer lost');
    }
    if (result.outcome === 'not_yours') return Response.json({ code: 'not_yours' }, { status: 409 });
    if (result.outcome === 'day_passed') return Response.json({ code: 'day_passed', ...result }, { status: 409 });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  };
  return { state, doFetch };
}
let nextId = 0;
const opId = () => `d2000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
function phone(who: Who, today = DAY) {
  const store = memoryStore();
  const net = network(who, today);
  const outbox = createOutbox(store, { newId: opId });
  const senders: Record<string, Sender> = { [ATTENDANCE_MARK]: (op) => sendAttendanceMark(op, store, net.doFetch) };
  return { store, net, outbox, flush: () => outbox.flush(senders) };
}
const presentAllBut = (absent: string[] = []): AttendanceMark['entries'] => [S.asha, S.bilal, S.chitra, S.pending].map((studentId) => ({ studentId, status: absent.includes(studentId) ? 'absent' : 'present' }));

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'),
      ('${CLASS_TEACHER}', '${A}', 'ct@a.invalid', 'teacher', 'Class Teacher'),
      ('${OTHER_TEACHER}', '${A}', 'ot@a.invalid', 'teacher', 'Other Teacher'),
      ('${TEACHER_B}', '${B}', 't@b.invalid', 'teacher', 'Teacher B');
    insert into classes (class_id, school_id, name, class_teacher_id) values
      ('${CLASS_5A}', '${A}', '5-A', '${CLASS_TEACHER}'), ('${CLASS_6A}', '${A}', '6-A', '${OTHER_TEACHER}'), ('${CLASS_B}', '${B}', '5-A', '${TEACHER_B}');
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no) values
      ('${S.asha}', '${A}', 'A-1', 'Asha', '${CLASS_5A}', '1'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${CLASS_5A}', '2'),
      ('${S.chitra}', '${A}', 'A-3', 'Chitra', '${CLASS_5A}', '3'), ('${S.pending}', '${A}', 'A-4', 'Dev', '${CLASS_5A}', '4'),
      ('${S.sixth}', '${A}', 'A-10', 'Sixth', '${CLASS_6A}', '1'), ('${S.other}', '${B}', 'B-1', 'Other school', '${CLASS_B}', '1');
    insert into parents (parent_id, school_id, name, phone) values ('${GUARDIAN}', '${A}', 'Guardian', '9800000001');
    insert into parent_student_map (school_id, parent_id, student_id, verification_status, verification_method)
      select '${A}', '${GUARDIAN}', student_id, 'active', 'school_attested' from students where school_id = '${A}';
    alter table students disable trigger user;
    update students set status = 'active' where student_id <> '${S.pending}';
    alter table students enable trigger user;
  `);
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

describe('the school day is India’s', () => {
  it('between midnight and 05:30 in India the date is India’s, not UTC’s', () => {
    expect(indiaDate(new Date('2026-10-11T18:29:59Z'))).toBe('2026-10-11'); // 23:59 in India
    expect(indiaDate(new Date('2026-10-11T18:30:00Z'))).toBe('2026-10-12'); // midnight in India; still the 11th in UTC
    expect(indiaDate(new Date('2026-10-11T19:00:00Z'))).toBe('2026-10-12'); // 00:30 in India
    expect(indiaDate(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
    expect(isIsoDate('2026-10-12')).toBe(true);
    for (const bad of ['12-10-2026', '2026-13-40', '', null, 20261012, "2026-10-12'; drop table attendance"]) expect(isIsoDate(bad)).toBe(false);
  });

  it('a mark saved at 00:30 India time is stored under that India day, and the routes take the day from the same helper', async () => {
    await reset();
    const today = indiaDate(new Date('2026-10-11T19:00:00Z'));
    await submit(classTeacher, CLASS_5A, [{ studentId: S.asha, status: 'present' }], { today });
    expect((await marks('2026-10-12')).map((m: { student_id: string }) => m.student_id)).toEqual([S.asha]);
    expect(await marks('2026-10-11')).toEqual([]);
    for (const file of ['src/app/api/app/attendance/route.ts', 'src/app/api/app/attendance/[attendanceId]/route.ts']) {
      const src = readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
      expect(src).toContain('indiaDate()');
      expect(src).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    }
    expect(readFileSync(path.resolve(__dirname, '../../src/lib/attendance/attendance.ts'), 'utf8')).not.toContain('current_date');
  });

  it('yesterday’s roster is locked by India’s date', async () => {
    const roster = await as(classTeacher, (c) => getAttendanceRoster(c, { schoolId: A, classId: CLASS_5A, date: '2026-10-11', today: '2026-10-12' }));
    expect(roster.every((r) => r.locked)).toBe(true);
    const todays = await as(classTeacher, (c) => getAttendanceRoster(c, { schoolId: A, classId: CLASS_5A, date: '2026-10-12', today: '2026-10-12' }));
    expect(todays.every((r) => !r.locked)).toBe(true);
  });
});

describe('who may mark a class', () => {
  it('a class teacher marks their own class with no subject in it', async () => {
    await reset();
    expect(await rows(`select 1 from teacher_subjects where school_id = $1`, [A])).toEqual([]);
    const result = await submit(classTeacher, CLASS_5A, presentAllBut());
    expect(result).toMatchObject({ outcome: 'saved', inserted: [S.asha, S.bilal, S.chitra, S.pending], alreadyMarked: [], differences: [], notInClass: [] });
    expect(await marks()).toHaveLength(4);
    const roster = await as(classTeacher, (c) => getAttendanceRoster(c, { schoolId: A, classId: CLASS_5A, date: DAY, today: DAY }));
    expect(roster.map((r) => r.status)).toEqual(['present', 'present', 'present', 'present']);
  });

  it('a teacher cannot mark, read or change another teacher’s class', async () => {
    await reset();
    // Through the app's own function: nothing is saved for a class that is not theirs.
    const result = await submit(otherTeacher, CLASS_5A, presentAllBut());
    expect(result).toMatchObject({ outcome: 'saved', inserted: [] });
    expect(await marks()).toEqual([]);
    // And the database refuses it outright, whatever the code does.
    await expect(as(otherTeacher, (c) => c.query(`insert into attendance (school_id, class_id, date, student_id, status, marked_by) values ($1, $2, $3, $4, 'present', $5)`, [A, CLASS_5A, DAY, S.asha, OTHER_TEACHER]))).rejects.toThrow(/row-level security/);
    await submit(classTeacher, CLASS_5A, presentAllBut([S.asha]));
    expect(await as(otherTeacher, (c) => c.query(`select 1 from attendance`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect(await as(otherTeacher, (c) => c.query(`update attendance set status = 'present' where student_id = $1 returning 1`, [S.asha]).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect((await marks()).find((m: { student_id: string }) => m.student_id === S.asha)).toMatchObject({ status: 'absent' });
  });

  it('a student of another class or another school is never saved under this class', async () => {
    await reset();
    const result = await submit(classTeacher, CLASS_5A, [{ studentId: S.asha, status: 'present' }, { studentId: S.sixth, status: 'absent' }, { studentId: S.other, status: 'absent' }]);
    expect(result).toMatchObject({ inserted: [S.asha], notInClass: [S.sixth, S.other] });
    expect((await rows(`select student_id from attendance`)).map((r: { student_id: string }) => r.student_id)).toEqual([S.asha]);
    // Another school's teacher, with this school's class id: nothing.
    expect(await submit(teacherB, CLASS_5A, presentAllBut())).toMatchObject({ inserted: [] });
    expect(await marks()).toHaveLength(1);
  });
});

describe('a student waiting for consent', () => {
  it('is in the roster with the tag, is marked like anyone else, and no message goes to the family', async () => {
    await reset();
    const roster = await as(classTeacher, (c) => getAttendanceRoster(c, { schoolId: A, classId: CLASS_5A, date: DAY, today: DAY }));
    expect(roster.map((r) => [r.name, r.roll_no, r.consent_pending])).toEqual([['Asha', '1', false], ['Bilal', '2', false], ['Chitra', '3', false], ['Dev', '4', true]]);
    await submit(classTeacher, CLASS_5A, presentAllBut([S.pending]));
    expect((await marks()).find((m: { student_id: string }) => m.student_id === S.pending)).toMatchObject({ status: 'absent' });
    // Whatever the send-gate recorded for this student, nothing was sent or queued to send.
    // Only this student was absent, so every row the send-gate wrote is theirs.
    const log: { status: string }[] = await rows(`select status::text as status from communication_log where school_id = $1`, [A]);
    expect(log.length).toBeGreaterThan(0);
    expect(log.filter((l) => !l.status.startsWith('blocked_'))).toEqual([]);
  });
});

describe('leave', () => {
  it('a leave mark keeps its code; any other mark has none', async () => {
    await reset();
    await submit(classTeacher, CLASS_5A, [{ studentId: S.asha, status: 'leave', leaveCode: 'sick' }, { studentId: S.bilal, status: 'late', leaveCode: 'sick' }, { studentId: S.chitra, status: 'leave' }]);
    expect((await marks()).map((m: { status: string; leave_code: string | null }) => [m.status, m.leave_code])).toEqual([['leave', 'sick'], ['late', null], ['leave', null]]);
    await expect(db.pg.query(`update attendance set leave_code = 'sick' where status = 'late'`)).rejects.toThrow(/attendance_leave_code_check/);
    await expect(db.pg.query(`update attendance set status = 'holiday' where status = 'late'`)).rejects.toThrow(/attendance_status_check/);
  });

  it('the screen offers the same marks and leave reasons the server accepts', () => {
    const view = readFileSync(path.resolve(__dirname, '../../src/components/attendance/AttendanceView.tsx'), 'utf8');
    const list = (name: string) => view.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(list('STATUSES')).toEqual([...ATTENDANCE_STATUSES]);
    expect(list('LEAVE_CODES_DISPLAY')).toEqual([...LEAVE_CODES]);
  });
});

describe('marking with no network', () => {
  it('present all, tap absent, submit offline: it waits on the phone, then every mark is saved once', async () => {
    await reset();
    const p = phone(classTeacher);
    p.net.state.on = false;
    await p.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut([S.bilal]), secondsToMark: 41 });
    expect(await p.flush()).toMatchObject({ waiting: 1, failed: 0 });
    expect(await marks()).toEqual([]);
    expect(p.net.state.calls).toBe(0);

    p.net.state.on = true;
    expect(await p.flush()).toMatchObject({ waiting: 0, failed: 0 });
    expect((await marks()).map((m: { student_id: string; status: string }) => [m.student_id, m.status])).toEqual([[S.asha, 'present'], [S.bilal, 'absent'], [S.chitra, 'present'], [S.pending, 'present']]);
    // Nothing left to send: sending again does nothing.
    await p.flush();
    expect(p.net.state.calls).toBe(1);
    expect(await marks()).toHaveLength(4);
  });

  it('the answer is lost on the way back: the phone sends again, and nothing is doubled', async () => {
    await reset();
    const p = phone(classTeacher);
    p.net.state.loseAnswer = true;
    const op = await p.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut([S.asha]), secondsToMark: 75 });
    expect(await p.flush()).toMatchObject({ waiting: 1 }); // the server saved it; the phone does not know
    expect(await marks()).toHaveLength(4);
    expect(await p.flush()).toMatchObject({ waiting: 0, failed: 0 });
    expect(p.net.state.calls).toBe(2);
    expect(await marks()).toHaveLength(4);
    // One operation, one measurement, one absence notice attempt per guardian.
    expect(await rows(`select operation_id, user_id, kind, for_date::text as for_date from client_operations`)).toEqual([{ operation_id: op.id, user_id: CLASS_TEACHER, kind: 'attendance.mark', for_date: DAY }]);
    expect(await rows(`select kind, class_id, day::text as day, value::int as value from usage_events`)).toEqual([{ kind: 'attendance.seconds_to_mark', class_id: CLASS_5A, day: DAY, value: 75 }]);
    expect(await rows(`select 1 from communication_log where school_id = $1`, [A])).toHaveLength(1); // only Asha was absent, with one guardian
    // The second answer says it was a replay of the first.
    expect(await submit(classTeacher, CLASS_5A, presentAllBut(), { operationId: op.id })).toMatchObject({ outcome: 'saved', replayed: true, inserted: [S.asha, S.bilal, S.chitra, S.pending] });
  });

  it('the same class marked on two phones: the first is kept, the second is shown the difference and saves theirs only as a correction with a reason', async () => {
    await reset();
    const first = phone(classTeacher);
    const second = phone(principal);
    second.net.state.on = false;
    await second.store.put(rosterKey(CLASS_5A), { date: DAY, roster: [S.asha, S.bilal].map((id) => ({ student_id: id, name: id, admission_no: '', roll_no: null, consent_pending: false, attendance_id: null, status: null, leave_code: null, editable_without_note: false, locked: false })) } satisfies KeptRoster);
    await second.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut([S.bilal]), secondsToMark: 30 });
    await first.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut([S.asha]), secondsToMark: 20 });
    await first.flush();
    second.net.state.on = true;
    expect(await second.flush()).toMatchObject({ waiting: 0, failed: 0 });

    // The first phone's marks stand.
    expect((await marks()).map((m: { student_id: string; status: string; marked_by: string }) => [m.student_id, m.status, m.marked_by])).toEqual([[S.asha, 'absent', CLASS_TEACHER], [S.bilal, 'present', CLASS_TEACHER], [S.chitra, 'present', CLASS_TEACHER], [S.pending, 'present', CLASS_TEACHER]]);
    // The second phone is told exactly where it differs, and its kept roster is not painted over with its own marks.
    const diffs = (await second.store.get<Difference[]>(differencesKey(CLASS_5A, DAY)))!;
    expect(diffs.map((d) => [d.studentId, d.saved, d.yours])).toEqual([[S.asha, 'absent', 'present'], [S.bilal, 'present', 'absent']]);
    expect((await second.store.get<KeptRoster>(rosterKey(CLASS_5A)))!.roster.map((r) => r.status)).toEqual([null, null]);
    // Only one measurement: the second submission saved no mark.
    expect(await rows(`select value::int as value from usage_events`)).toEqual([{ value: 20 }]);

    // Saving theirs is a correction, with the reason in the audit log.
    const bilal = diffs.find((d) => d.studentId === S.bilal)!;
    await as(principal, (c) => correctAttendance(c, { schoolId: A, attendanceId: bilal.attendanceId, newStatus: bilal.yours, today: DAY, note: 'He left before the first period', actorUserId: PRINCIPAL, actorRole: 'principal' }));
    expect((await marks()).find((m: { student_id: string }) => m.student_id === S.bilal)).toMatchObject({ status: 'absent' });
    const audit = await rows(`select before_state, after_state from audit_log where event_action = 'attendance.correct' and target_id = $1`, [bilal.attendanceId]);
    expect(audit).toEqual([{ before_state: { status: 'present' }, after_state: { status: 'absent', note: 'He left before the first period' } }]);
  });

  it('after it is sent, the roster kept on the phone shows the marks as saved', async () => {
    await reset();
    const p = phone(classTeacher);
    await p.store.put(rosterKey(CLASS_5A), { date: DAY, roster: [S.asha, S.bilal].map((id) => ({ student_id: id, name: id, admission_no: '', roll_no: null, consent_pending: false, attendance_id: null, status: null, leave_code: null, editable_without_note: false, locked: false })) } satisfies KeptRoster);
    await p.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: [{ studentId: S.asha, status: 'leave', leaveCode: 'family' }, { studentId: S.bilal, status: 'present' }], secondsToMark: null });
    await p.flush();
    expect((await p.store.get<KeptRoster>(rosterKey(CLASS_5A)))!.roster.map((r) => [r.status, r.leave_code])).toEqual([['leave', 'family'], ['present', null]]);
    expect(await p.store.get(differencesKey(CLASS_5A, DAY))).toBeUndefined();
    expect(await rows(`select 1 from usage_events`)).toEqual([]); // no time was given: nothing is recorded
  });

  it('marks that reach the server too long after their day (past the office’s correction window) are not saved to any day, and the phone keeps them visible with the reason', async () => {
    await reset();
    const p = phone(classTeacher, '2026-10-25'); // 13 days on: older than the office may correct
    p.net.state.on = false;
    const op = await p.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut([S.asha]), secondsToMark: 50 });
    p.net.state.on = true;
    expect(await p.flush()).toMatchObject({ waiting: 0, failed: 1 });
    expect(await rows(`select 1 from attendance`)).toEqual([]);
    expect(await rows(`select 1 from usage_events`)).toEqual([]);
    expect(await p.outbox.all()).toMatchObject([{ id: op.id, state: 'failed', reason: 'day_passed', detail: { classId: CLASS_5A } }]);
    // Sent again by mistake, it is still not applied.
    await p.outbox.retry(op.id);
    expect(await p.flush()).toMatchObject({ failed: 1 });
    expect(await rows(`select 1 from attendance`)).toEqual([]);
  });

  it('the session ended while offline: the marks stay on the phone and go after the next sign-in', async () => {
    await reset();
    const p = phone(classTeacher);
    let signedIn = false;
    const senders: Record<string, Sender> = {
      [ATTENDANCE_MARK]: (op) => sendAttendanceMark(op, p.store, async (url, init) => (signedIn ? p.net.doFetch(url, init) : Response.json({ error: 'not authenticated' }, { status: 401 }))),
    };
    await p.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut(), secondsToMark: 12 });
    expect(await p.outbox.flush(senders)).toMatchObject({ waiting: 1, failed: 0 });
    expect(await marks()).toEqual([]);
    signedIn = true;
    expect(await p.outbox.flush(senders)).toMatchObject({ waiting: 0, failed: 0 });
    expect(await marks()).toHaveLength(4);
  });

  it('a refusal (the school is read-only, or the role may not mark) stays visible; a server error is tried again', async () => {
    const p = phone(classTeacher);
    const answer = (status: number, body: unknown) => ({ [ATTENDANCE_MARK]: ((op) => sendAttendanceMark(op, p.store, async () => Response.json(body, { status }))) as Sender });
    const op = await p.outbox.add<AttendanceMark>(ATTENDANCE_MARK, DAY, { classId: CLASS_5A, entries: presentAllBut(), secondsToMark: null });
    expect(await p.outbox.flush(answer(503, {}))).toMatchObject({ waiting: 1, failed: 0 });
    expect(await p.outbox.flush(answer(403, { rule: 'school_read_only' }))).toMatchObject({ waiting: 0, failed: 1 });
    expect(await p.outbox.all()).toMatchObject([{ id: op.id, state: 'failed', reason: 'school_read_only' }]);
  });
});

describe('operations and measurements belong to their school and person', () => {
  it('an operation id is one person’s: another person, or another school, cannot read it or replay it', async () => {
    await reset();
    const id = opId();
    await submit(classTeacher, CLASS_5A, presentAllBut(), { operationId: id, secondsToMark: 33 });
    expect(await as(classTeacher, (c) => c.query(`select 1 from client_operations`).then((r: { rows: unknown[] }) => r.rows))).toHaveLength(1);
    for (const who of [principal, otherTeacher, teacherB]) expect(await as(who, (c) => c.query(`select 1 from client_operations`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    // The same id from someone else in the school answers "not yours" and saves nothing new.
    expect(await submit(principal, CLASS_5A, presentAllBut([S.asha]), { operationId: id })).toEqual({ outcome: 'not_yours' });
    expect((await marks()).every((m: { status: string }) => m.status === 'present')).toBe(true);
    // Nobody can write an operation in another person's name.
    await expect(as(otherTeacher, (c) => c.query(`insert into client_operations (school_id, operation_id, user_id, kind, for_date) values ($1, $2, $3, 'attendance.mark', $4)`, [A, opId(), CLASS_TEACHER, DAY]))).rejects.toThrow(/row-level security/);
  });

  it('minutes to mark: one row per submission, no student or staff in it, read by the school’s leadership only', async () => {
    const cols = (await rows(`select column_name from information_schema.columns where table_name = 'usage_events' order by ordinal_position`)).map((r: { column_name: string }) => r.column_name);
    expect(cols).toEqual(['event_id', 'school_id', 'kind', 'class_id', 'day', 'value', 'created_at']);
    expect(await as(principal, (c) => c.query(`select value::int as value from usage_events`).then((r: { rows: unknown[] }) => r.rows))).toEqual([{ value: 33 }]);
    for (const who of [classTeacher, otherTeacher, teacherB]) expect(await as(who, (c) => c.query(`select 1 from usage_events`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    // A nonsense time is not recorded.
    await reset();
    await submit(classTeacher, CLASS_5A, presentAllBut(), { secondsToMark: 999999 });
    await submit(classTeacher, CLASS_5A, presentAllBut(), { secondsToMark: -4 });
    expect(await rows(`select 1 from usage_events`)).toEqual([]);
  });

  it('the public roles Supabase creates have no access to the new tables', async () => {
    const grants = await rows(`select grantee, table_name from information_schema.role_table_grants where table_name in ('client_operations', 'usage_events') and grantee in ('anon', 'authenticated', 'PUBLIC')`);
    expect(grants).toEqual([]);
  });
});
