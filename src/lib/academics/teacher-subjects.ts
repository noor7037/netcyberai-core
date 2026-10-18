import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { classOrderSql } from '@/lib/classes/class-order';

// Who teaches which subject in which class (teacher_subjects), kept by the office in Setup, on the Staff screen
// (docs/28 slice 10g, C231). Every function runs in the caller's own tenant transaction, as the app's role.
//
// teacher_subjects is what the teacher_scope_* policies read: a row widens what that teacher may read and mark. So
// only the principal, the school admin or the academic coordinator writes it (row level security, migrations
// c231_timetable_setup and c243_assigned_teacher_rule), here, with an audit row of ids only (C56). A teacher may
// PROPOSE a subject and class for themselves (teacher_subject_requests); those three confirm or decline it, never the
// teacher who asked; only a confirmed proposal is written.
//
// The teachers row behind an assignment (teacher_subjects names teachers.teacher_id) is made here, by whoever assigns
// (the coordinator too since C243, who only makes it: changing or removing one stays the office's), the first time a
// teacher is given a subject: one per user, only for a teacher (a unique index and a policy), with the user's display
// name, nothing typed.
//
// The timetable reads it too: when a class and subject have assignments, a period or a generator load for them
// takes one of those teachers (src/lib/timetable/plan.ts notAssigned()); since C243 the database refuses any other
// teacher for such a period too (the trigger timetable_entries_assigned_teacher).

type Sql = Pick<PoolClient, 'query'>;
type Actor = { schoolId: string; userId: string; role: StaffRole };

// Who assigns, and decides a teacher's proposal: the principal, the school admin and the academic coordinator
// (C230-C), as the database says.
export const ASSIGNERS: readonly string[] = ['principal', 'school_admin', 'academic_coordinator'];

export type Assignment = { teacherUserId: string; classId: string; subjectId: string };
export type Named = { id: string; name: string };
export type RequestState = 'pending' | 'confirmed' | 'declined';
export type RequestLine = { requestId: string; teacherUserId: string; classId: string; subjectId: string; state: RequestState; requestedAt: string; decidedAt: string | null };

const ASSIGNMENT_SELECT = `select t.user_id as "teacherUserId", ts.class_id as "classId", ts.subject_id as "subjectId"
    from teacher_subjects ts join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id`;
// Only the assignments of teachers who still teach (an active teacher account): the ones the timetable keeps to. A
// teacher who left keeps their rows until the office removes them on Staff, but they no longer hold a subject back.
const ACTIVE = `exists (select 1 from users u where u.school_id = t.school_id and u.user_id = t.user_id and u.role = 'teacher' and u.is_active)`;

// Every assignment of the school, or one teacher's (those of a teacher who left too, so the office can remove them).
export async function listAssignments(db: Sql, schoolId: string, teacherUserId?: string): Promise<Assignment[]> {
  const { rows } = await db.query(
    `${ASSIGNMENT_SELECT} where ts.school_id = $1 and ($2::uuid is null or t.user_id = $2) order by t.user_id, ts.class_id, ts.subject_id`,
    [schoolId, teacherUserId ?? null]
  );
  return rows;
}

// The assignments the timetable keeps to: the active teachers'.
export async function activeAssignments(db: Sql, schoolId: string): Promise<Assignment[]> {
  const { rows } = await db.query(`${ASSIGNMENT_SELECT} where ts.school_id = $1 and ${ACTIVE} order by t.user_id, ts.class_id, ts.subject_id`, [schoolId]);
  return rows;
}

// The active teachers (users) assigned to one subject in one class: none means the class and subject have no
// assignment the timetable keeps to.
export async function assignedTeachers(db: Sql, schoolId: string, classId: string, subjectId: string): Promise<string[]> {
  const { rows } = await db.query(`${ASSIGNMENT_SELECT} where ts.school_id = $1 and ts.class_id = $2 and ts.subject_id = $3 and ${ACTIVE} order by t.user_id`, [schoolId, classId, subjectId]);
  return rows.map((r: Assignment) => r.teacherUserId);
}

export type TeacherChoice = Named & { active: boolean };

// What the Staff screen and a teacher's proposal choose from: the school's classes and subjects, and its active
// teachers, with any teacher who left but still has subjects here (marked, so the office can take them away).
export async function assignmentChoices(db: Sql, schoolId: string): Promise<{ teachers: TeacherChoice[]; classes: Named[]; subjects: Named[] }> {
  const [teachers, classes, subjects] = await Promise.all([
    db.query(
      `select u.user_id as id, u.display_name as name, u.is_active as active from users u
        where u.school_id = $1 and u.role = 'teacher'
          and (u.is_active or exists (select 1 from teachers t join teacher_subjects ts on ts.school_id = t.school_id and ts.teacher_id = t.teacher_id where t.school_id = u.school_id and t.user_id = u.user_id))
        order by u.is_active desc, u.display_name, u.user_id`,
      [schoolId]
    ),
    db.query(`select class_id as id, name from classes where school_id = $1 order by ${classOrderSql('')}, class_id`, [schoolId]),
    db.query(`select subject_id as id, name from subjects where school_id = $1 order by name, subject_id`, [schoolId]),
  ]);
  return { teachers: teachers.rows, classes: classes.rows, subjects: subjects.rows };
}

async function classAndSubject(db: Sql, schoolId: string, classId: string, subjectId: string): Promise<'unknown_class' | 'unknown_subject' | null> {
  const known = (
    await db.query(
      `select exists (select 1 from classes where school_id = $1 and class_id = $2) as class, exists (select 1 from subjects where school_id = $1 and subject_id = $3) as subject`,
      [schoolId, classId, subjectId]
    )
  ).rows[0];
  return !known.class ? 'unknown_class' : !known.subject ? 'unknown_subject' : null;
}

// The teachers row of an active teacher of the school, made the first time it is needed (by an assigner).
// 'unknown_teacher' when the user is not an active teacher of the school: never a row for anyone else.
type TeacherRow = { teacherId: string } | { reason: 'unknown_teacher' };
async function teacherRowFor(db: Sql, actor: Actor, teacherUserId: string): Promise<TeacherRow> {
  const teacher = (await db.query(`select 1 from users where school_id = $1 and user_id = $2 and role = 'teacher' and is_active`, [actor.schoolId, teacherUserId])).rows[0];
  if (!teacher) return { reason: 'unknown_teacher' };
  const found = (await db.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [actor.schoolId, teacherUserId])).rows[0];
  if (found) return { teacherId: found.teacher_id as string };
  const made = (
    await db.query(
      `insert into teachers (school_id, user_id, name)
       select u.school_id, u.user_id, u.display_name from users u where u.school_id = $1 and u.user_id = $2 and u.role = 'teacher'
       on conflict (school_id, user_id) do nothing returning teacher_id`,
      [actor.schoolId, teacherUserId]
    )
  ).rows[0];
  if (!made) {
    const raced = (await db.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [actor.schoolId, teacherUserId])).rows[0]?.teacher_id as string | undefined;
    return raced ? { teacherId: raced } : { reason: 'unknown_teacher' };
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'teacher.profile_made', targetType: 'teachers', targetId: made.teacher_id,
    afterState: { teacherUserId },
  });
  return { teacherId: made.teacher_id as string };
}

// Writes one assignment, and its audit row, when it is new. Returns whether it was new.
async function writeAssignment(db: Sql, actor: Actor, teacherId: string, a: Assignment): Promise<boolean> {
  const made = await db.query(
    `insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4) on conflict do nothing returning teacher_id`,
    [actor.schoolId, teacherId, a.subjectId, a.classId]
  );
  if (!made.rows[0]) return false;
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'teacher_subject.assign', targetType: 'teacher_subjects', targetId: teacherId,
    afterState: { teacherId, teacherUserId: a.teacherUserId, subjectId: a.subjectId, classId: a.classId },
  });
  return true;
}

export type AssignResult = { ok: true; created: boolean } | { ok: false; reason: 'unknown_teacher' | 'unknown_class' | 'unknown_subject' };

// The office (or the coordinator) gives a teacher a subject in a class. A proposal of the same, waiting, is confirmed
// with it.
export async function assign(db: Sql, actor: Actor, a: Assignment): Promise<AssignResult> {
  const unknown = await classAndSubject(db, actor.schoolId, a.classId, a.subjectId);
  if (unknown) return { ok: false, reason: unknown };
  const row = await teacherRowFor(db, actor, a.teacherUserId);
  if ('reason' in row) return { ok: false, reason: row.reason };
  const teacherId = row.teacherId;
  const created = await writeAssignment(db, actor, teacherId, a);
  const waiting = await db.query(
    `update teacher_subject_requests set state = 'confirmed', decided_by = $5
      where school_id = $1 and teacher_user_id = $2 and class_id = $3 and subject_id = $4 and state = 'pending' returning request_id`,
    [actor.schoolId, a.teacherUserId, a.classId, a.subjectId, actor.userId]
  );
  for (const r of waiting.rows as { request_id: string }[])
    await writeAuditLog(db, {
      schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'teacher_subject.request_confirmed', targetType: 'teacher_subject_requests', targetId: r.request_id,
      afterState: { teacherUserId: a.teacherUserId, classId: a.classId, subjectId: a.subjectId },
    });
  return { ok: true, created };
}

// The office takes a subject in a class away from a teacher. False when there was no such assignment.
export async function unassign(db: Sql, actor: Actor, a: Assignment): Promise<boolean> {
  const gone = await db.query(
    `delete from teacher_subjects ts using teachers t
      where ts.school_id = $1 and t.school_id = ts.school_id and t.teacher_id = ts.teacher_id and t.user_id = $2 and ts.subject_id = $3 and ts.class_id = $4
      returning ts.teacher_id`,
    [actor.schoolId, a.teacherUserId, a.subjectId, a.classId]
  );
  const teacherId = gone.rows[0]?.teacher_id as string | undefined;
  if (!teacherId) return false;
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'teacher_subject.unassign', targetType: 'teacher_subjects', targetId: teacherId,
    beforeState: { teacherId, teacherUserId: a.teacherUserId, subjectId: a.subjectId, classId: a.classId },
  });
  return true;
}

// ---- A teacher's proposal ------------------------------------------------------------------------------------------

export type ProposeResult = { ok: true; requestId: string } | { ok: false; reason: 'unknown_class' | 'unknown_subject' | 'already_assigned' | 'already_requested' };

// A teacher proposes a subject and class for themselves. It waits for the office; nothing is assigned yet.
export async function proposeAssignment(db: Sql, actor: Actor, at: { classId: string; subjectId: string }): Promise<ProposeResult> {
  const unknown = await classAndSubject(db, actor.schoolId, at.classId, at.subjectId);
  if (unknown) return { ok: false, reason: unknown };
  if ((await assignedTeachers(db, actor.schoolId, at.classId, at.subjectId)).includes(actor.userId)) return { ok: false, reason: 'already_assigned' };
  const made = (
    await db.query(
      `insert into teacher_subject_requests (school_id, teacher_user_id, class_id, subject_id) values ($1, $2, $3, $4)
       on conflict (school_id, teacher_user_id, class_id, subject_id) where state = 'pending' do nothing returning request_id`,
      [actor.schoolId, actor.userId, at.classId, at.subjectId]
    )
  ).rows[0];
  if (!made) return { ok: false, reason: 'already_requested' };
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'teacher_subject.requested', targetType: 'teacher_subject_requests', targetId: made.request_id,
    afterState: { classId: at.classId, subjectId: at.subjectId },
  });
  return { ok: true, requestId: made.request_id as string };
}

export type DecideResult = { ok: true; state: 'confirmed' | 'declined' } | { ok: false; reason: 'not_found' | 'unknown_teacher' };

// The office (or the coordinator) confirms (the assignment is written) or declines a teacher's proposal, once. A
// teacher no longer active cannot be given a subject: confirming is refused (unknown_teacher), and the office declines
// it.
export async function decideRequest(db: Sql, actor: Actor, requestId: string, decision: 'confirm' | 'decline'): Promise<DecideResult> {
  const r = (
    await db.query(`select teacher_user_id, class_id, subject_id from teacher_subject_requests where school_id = $1 and request_id = $2 and state = 'pending' for update`, [actor.schoolId, requestId])
  ).rows[0] as { teacher_user_id: string; class_id: string; subject_id: string } | undefined;
  if (!r) return { ok: false, reason: 'not_found' };
  const a: Assignment = { teacherUserId: r.teacher_user_id, classId: r.class_id, subjectId: r.subject_id };
  if (decision === 'confirm') {
    const row = await teacherRowFor(db, actor, a.teacherUserId);
    if ('reason' in row) return { ok: false, reason: row.reason };
    await writeAssignment(db, actor, row.teacherId, a);
  }
  const state = decision === 'confirm' ? 'confirmed' : 'declined';
  await db.query(`update teacher_subject_requests set state = $3, decided_by = $4 where school_id = $1 and request_id = $2 and state = 'pending'`, [actor.schoolId, requestId, state, actor.userId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `teacher_subject.request_${state}`, targetType: 'teacher_subject_requests', targetId: requestId,
    afterState: { teacherUserId: a.teacherUserId, classId: a.classId, subjectId: a.subjectId },
  });
  return { ok: true, state };
}

const REQUEST_SELECT = `select r.request_id as "requestId", r.teacher_user_id as "teacherUserId", r.class_id as "classId", r.subject_id as "subjectId", r.state,
         r.requested_at as "requestedAt", r.decided_at as "decidedAt"
    from teacher_subject_requests r`;
const asLine = (r: RequestLine): RequestLine => ({ ...r, requestedAt: new Date(r.requestedAt).toISOString(), decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : null });
export const REQUESTS_SHOWN = 50;

// The proposals waiting for the office, oldest first.
export async function waitingRequests(db: Sql, schoolId: string): Promise<RequestLine[]> {
  const { rows } = await db.query(`${REQUEST_SELECT} where r.school_id = $1 and r.state = 'pending' order by r.requested_at, r.request_id limit $2`, [schoolId, REQUESTS_SHOWN]);
  return rows.map(asLine);
}

// A teacher's own proposals, newest first: waiting, confirmed and declined.
export async function myRequests(db: Sql, schoolId: string, userId: string): Promise<RequestLine[]> {
  const { rows } = await db.query(`${REQUEST_SELECT} where r.school_id = $1 and r.teacher_user_id = $2 order by r.requested_at desc, r.request_id limit $3`, [schoolId, userId, REQUESTS_SHOWN]);
  return rows.map(asLine);
}

// For My Day: how many proposals wait for the office.
export async function requestsWaiting(db: Sql, schoolId: string): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from teacher_subject_requests where school_id = $1 and state = 'pending'`, [schoolId]);
  return rows[0]?.n ?? 0;
}
