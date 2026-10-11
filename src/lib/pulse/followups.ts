import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';

// The "needs help" queue (D6, docs/20 5f, C148). A student who needs a
// follow-up from their teacher: why, a suggested follow-up, and the outcome
// once the teacher has acted. In P2 the teacher or the office adds an item;
// a parent's reply adds it from P4. The queue is in the order the items
// arrived: it never ranks children.
//
// Every function runs in the caller's own tenant transaction; RLS limits a
// teacher to their own classes.

export const FOLLOWUP_KINDS = ['did_not_understand', 'homework_help', 'missed_class', 'other'] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];
export const FOLLOWUP_OUTCOMES = ['done', 'not_needed'] as const;
export type FollowupOutcome = (typeof FOLLOWUP_OUTCOMES)[number];
export const MAX_REASON = 300;
export const MAX_OUTCOME = 500;
const STAFF: readonly string[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export type Followup = {
  followup_id: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  kind: FollowupKind;
  reason: string | null;
  source: 'staff' | 'parent_reply';
  status: 'open' | FollowupOutcome;
  outcome: string | null;
  created_at: string;
  decided_at: string | null;
};
type Actor = { schoolId: string; userId: string; role: StaffRole };

const SELECT = `select f.followup_id, f.student_id, s.name as student_name, f.class_id, c.name as class_name, f.kind, f.reason, f.source, f.status, f.outcome, f.created_at, f.decided_at
    from pulse_followups f
    join students s on s.school_id = f.school_id and s.student_id = f.student_id
    join classes c on c.school_id = f.school_id and c.class_id = f.class_id`;

// Open items first come, first shown; then the most recently decided.
export async function listFollowups(db: PoolClient, schoolId: string): Promise<{ open: Followup[]; decided: Followup[] }> {
  const open = (await db.query(`${SELECT} where f.school_id = $1 and f.status = 'open' order by f.created_at, f.followup_id`, [schoolId])).rows;
  const decided = (await db.query(`${SELECT} where f.school_id = $1 and f.status <> 'open' order by f.decided_at desc limit 30`, [schoolId])).rows;
  return { open, decided };
}

export type CreateResult = { ok: true; followup: Followup; already: boolean } | { ok: false; reason: 'not_allowed' | 'unknown_student' };

// One open item per student and kind: asking twice shows the one that is there.
export async function createFollowup(db: PoolClient, actor: Actor, input: { studentId: string; kind: FollowupKind; reason: string | null }): Promise<CreateResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  // The students policy already limits a teacher to their own classes.
  const student = (await db.query(`select class_id from students where school_id = $1 and student_id = $2 and class_id is not null and status in ('active', 'pending_consent')`, [actor.schoolId, input.studentId])).rows[0];
  if (!student) return { ok: false, reason: 'unknown_student' };
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`followup:${actor.schoolId}:${input.studentId}:${input.kind}`]);
  const existing = (await db.query(`${SELECT} where f.school_id = $1 and f.student_id = $2 and f.kind = $3 and f.status = 'open'`, [actor.schoolId, input.studentId, input.kind])).rows[0] as Followup | undefined;
  if (existing) return { ok: true, followup: existing, already: true };
  const made = await db.query(
    `insert into pulse_followups (school_id, student_id, class_id, kind, reason, source, created_by) values ($1, $2, $3, $4, $5, 'staff', $6) returning followup_id`,
    [actor.schoolId, input.studentId, student.class_id, input.kind, input.reason, actor.userId]
  );
  const id = made.rows[0].followup_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'followup.opened', targetType: 'pulse_followups', targetId: id, beforeState: undefined, afterState: { studentId: input.studentId, kind: input.kind, source: 'staff' } });
  return { ok: true, followup: (await db.query(`${SELECT} where f.school_id = $1 and f.followup_id = $2`, [actor.schoolId, id])).rows[0], already: false };
}

export type DecideResult = { ok: true; followup: Followup } | { ok: false; reason: 'not_allowed' | 'outcome_required' | 'not_found' };

// Open → done or not needed, with what happened. A decided item is not reopened: a new need is a new item.
export async function decideFollowup(db: PoolClient, actor: Actor, followupId: string, input: { status: FollowupOutcome; outcome: string }): Promise<DecideResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const outcome = input.outcome.trim().replace(/\s+/g, ' ');
  if (!outcome) return { ok: false, reason: 'outcome_required' };
  const moved = await db.query(
    `update pulse_followups set status = $3, outcome = $4, decided_by = $5, decided_at = now() where school_id = $1 and followup_id = $2 and status = 'open' returning student_id, kind`,
    [actor.schoolId, followupId, input.status, outcome.slice(0, MAX_OUTCOME), actor.userId]
  );
  if (!moved.rows[0]) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `followup.${input.status}`, targetType: 'pulse_followups', targetId: followupId, beforeState: { status: 'open' }, afterState: { status: input.status, outcome, studentId: moved.rows[0].student_id, kind: moved.rows[0].kind } });
  return { ok: true, followup: (await db.query(`${SELECT} where f.school_id = $1 and f.followup_id = $2`, [actor.schoolId, followupId])).rows[0] };
}
