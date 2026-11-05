import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { lockSchoolClasses } from '@/lib/classes/standard-classes';
import type { StaffRole } from '@/lib/auth/types';
import { planPromotion, type ClassToMake, type Destination, type MoveOutcome, type OverrideDecision, type PlanClass, type PlanOverride, type PlanStudent, type PromotionPlan } from './promotion-plan';
import type { SessionRow } from './session-input';

// One-click promotion to the next academic session (W21-M2), for the principal. Every function runs in the caller's
// own tenant transaction, as the app's role; the database holds the same rules (migration w21_m2_promotion).
//
//   readPromotion   the dry run: the current session -> the next one, each class and where it goes, each student,
//                   the principal's overrides, the students still undecided, and the last promotion (undo until when).
//   setOverride     one student's decision (repeat, leave, move to another section), with a reason; or clear it.
//   promote         in one transaction: the missing classes made, every class re-tagged to the new session, every
//                   student (active or awaiting consent) moved, leavers marked as left with the date, one
//                   promotion_events row each, and the new session made current. Attendance, marks and fees are not
//                   touched (each is kept by class and date, by exam, or by its own session). Fee structures are
//                   not copied.
//   undoPromotion   within 24 hours of the promotion, by the principal: the reverse of every event, written as new
//                   events of an undo run. After that the promotion is final.
//
// Classes are the school's own rows across years (no class list filters by session, and a class carries its
// timetable and teachers), so a class is re-tagged, not copied. Audit rows hold ids and counts only (C56).

type Sql = Pick<PoolClient, 'query'>;
export type PromotionActor = { schoolId: string; userId: string; role: StaffRole };
export const UNDO_HOURS = 24;

export type PromotionStudentView = { studentId: string; name: string; rollNo: string | null; outcome: MoveOutcome; toName: string | null; reason: string | null; toSection: string | null };
export type PromotionClassView = { classId: string; name: string; students: PromotionStudentView[]; to: { kind: Destination['kind']; name: string | null } };
export type PromotionRunView = { runId: string; fromLabel: string; toLabel: string; at: string; undoUntil: string; canUndo: boolean };
export type PromotionView = {
  from: SessionRow | null;
  to: SessionRow | null;
  classes: PromotionClassView[];
  toMake: string[];
  counts: { promoted: number; repeated: number; movedSection: number; left: number; undecided: number };
  alreadyPromoted: boolean;
  lastRun: PromotionRunView | null;
};

const SESSION_COLUMNS = `session_id, label, start_date::text as start_date, end_date::text as end_date, is_current`;
const sessionRow = (r: Record<string, unknown>): SessionRow => ({ sessionId: r.session_id as string, label: r.label as string, startDate: r.start_date as string, endDate: r.end_date as string, isCurrent: r.is_current === true });
const lockSessions = (db: Sql, schoolId: string) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`sessions:${schoolId}`]);

async function sessionsOf(db: Sql, schoolId: string): Promise<{ from: SessionRow | null; to: SessionRow | null }> {
  const cur = (await db.query(`select ${SESSION_COLUMNS} from academic_sessions where school_id = $1 and is_current`, [schoolId])).rows[0];
  if (!cur) return { from: null, to: null };
  const next = (await db.query(`select ${SESSION_COLUMNS} from academic_sessions where school_id = $1 and start_date > $2::date order by start_date, session_id limit 1`, [schoolId, cur.start_date])).rows[0];
  return { from: sessionRow(cur), to: next ? sessionRow(next) : null };
}

async function inputsOf(db: Sql, schoolId: string, fromSessionId: string | null) {
  const classes = (await db.query(`select class_id, name, grade, section from classes where school_id = $1`, [schoolId])).rows.map(
    (r): PlanClass => ({ classId: r.class_id, name: r.name, grade: r.grade, section: r.section })
  );
  const students = (
    await db.query(`select student_id, name, roll_no, class_id, status::text as status from students where school_id = $1 and class_id is not null and status in ('active', 'pending_consent') order by name, student_id`, [schoolId])
  ).rows.map((r): PlanStudent & { status: string } => ({ studentId: r.student_id, name: r.name, rollNo: r.roll_no, classId: r.class_id, status: r.status }));
  const overrides = fromSessionId
    ? (await db.query(`select student_id, decision, to_section, reason from promotion_overrides where school_id = $1 and from_session_id = $2`, [schoolId, fromSessionId])).rows.map(
        (r): PlanOverride => ({ studentId: r.student_id, decision: r.decision, toSection: r.to_section, reason: r.reason })
      )
    : [];
  return { classes, students, overrides };
}

// The latest promotion that has not been undone, and whether it can still be (the database's clock decides).
async function lastRunOf(db: Sql, schoolId: string): Promise<(PromotionRunView & { fromSessionId: string; toSessionId: string }) | null> {
  const r = (
    await db.query(
      `select r.run_id, r.from_session_id, r.to_session_id, f.label as from_label, t.label as to_label, r.created_at,
              r.created_at + make_interval(hours => $2) as undo_until, now() < r.created_at + make_interval(hours => $2) as can_undo
         from promotion_runs r join academic_sessions f on f.session_id = r.from_session_id join academic_sessions t on t.session_id = r.to_session_id
        where r.school_id = $1 and r.action = 'promoted' and not exists (select 1 from promotion_runs u where u.undoes_run_id = r.run_id)
        order by r.created_at desc limit 1`,
      [schoolId, UNDO_HOURS]
    )
  ).rows[0];
  if (!r) return null;
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();
  return { runId: r.run_id, fromSessionId: r.from_session_id, toSessionId: r.to_session_id, fromLabel: r.from_label, toLabel: r.to_label, at: iso(r.created_at), undoUntil: iso(r.undo_until), canUndo: r.can_undo === true };
}

function view(plan: PromotionPlan, names: Map<string, PlanStudent>, overrides: PlanOverride[]): Pick<PromotionView, 'classes' | 'toMake' | 'counts'> {
  const byClass = new Map<string, PromotionStudentView[]>();
  const section = new Map(overrides.map((o) => [o.studentId, o.toSection]));
  for (const m of plan.moves) {
    const s = names.get(m.studentId)!;
    const toName = m.to.kind === 'class' || m.to.kind === 'make' ? m.to.name : null;
    const list = byClass.get(m.fromClassId) ?? [];
    list.push({ studentId: m.studentId, name: s.name, rollNo: s.rollNo, outcome: m.outcome, toName, reason: m.reason, toSection: section.get(m.studentId) ?? null });
    byClass.set(m.fromClassId, list);
  }
  const count = (o: MoveOutcome) => plan.moves.filter((m) => m.outcome === o).length;
  return {
    classes: plan.classes.map((c) => ({ classId: c.classId, name: c.name, students: byClass.get(c.classId) ?? [], to: { kind: c.to.kind, name: c.to.kind === 'class' || c.to.kind === 'make' ? c.to.name : null } })),
    toMake: plan.toMake.map((c) => c.name),
    counts: { promoted: count('promoted'), repeated: count('repeated'), movedSection: count('moved_section'), left: count('left'), undecided: count('undecided') },
  };
}

const runFrom = async (db: Sql, schoolId: string, fromSessionId: string) =>
  Boolean((await db.query(`select 1 from promotion_runs r where r.school_id = $1 and r.action = 'promoted' and r.from_session_id = $2 and not exists (select 1 from promotion_runs u where u.undoes_run_id = r.run_id)`, [schoolId, fromSessionId])).rows[0]);

// The dry run. Changes nothing.
export async function readPromotion(db: Sql, schoolId: string): Promise<PromotionView> {
  const { from, to } = await sessionsOf(db, schoolId);
  const { classes, students, overrides } = await inputsOf(db, schoolId, from?.sessionId ?? null);
  const plan = planPromotion(classes, students, overrides);
  const names = new Map(students.map((s) => [s.studentId, s]));
  return { from, to, ...view(plan, names, overrides), alreadyPromoted: from ? await runFrom(db, schoolId, from.sessionId) : false, lastRun: await lastRunOf(db, schoolId) };
}

export type OverrideInput = { studentId: string; decision: OverrideDecision | 'promote'; toSection: string | null; reason: string | null };
export type OverrideResult = { ok: true } | { ok: false; reason: 'no_session' | 'not_found' | 'needs_reason' | 'needs_section' };

// One student's decision for the current session's promotion; 'promote' clears it. Audited with ids only.
export async function setOverride(db: Sql, actor: PromotionActor, input: OverrideInput): Promise<OverrideResult> {
  const { from } = await sessionsOf(db, actor.schoolId);
  if (!from) return { ok: false, reason: 'no_session' };
  const student = (await db.query(`select 1 from students where school_id = $1 and student_id = $2 and class_id is not null and status in ('active', 'pending_consent')`, [actor.schoolId, input.studentId])).rows[0];
  if (!student) return { ok: false, reason: 'not_found' };
  if (input.decision === 'promote') {
    const gone = await db.query(`delete from promotion_overrides where school_id = $1 and from_session_id = $2 and student_id = $3 returning 1`, [actor.schoolId, from.sessionId, input.studentId]);
    if (gone.rows.length > 0) {
      await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'setup.promotion_override_cleared', targetType: 'students', targetId: input.studentId, afterState: { session_id: from.sessionId } });
    }
    return { ok: true };
  }
  if (!input.reason) return { ok: false, reason: 'needs_reason' };
  if (input.decision === 'move_section' && !input.toSection) return { ok: false, reason: 'needs_section' };
  const toSection = input.decision === 'move_section' ? input.toSection : null;
  await db.query(
    `insert into promotion_overrides (school_id, from_session_id, student_id, decision, to_section, reason, set_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (school_id, from_session_id, student_id) do update set decision = excluded.decision, to_section = excluded.to_section, reason = excluded.reason, set_by = excluded.set_by, set_at = now()`,
    [actor.schoolId, from.sessionId, input.studentId, input.decision, toSection, input.reason, actor.userId]
  );
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'setup.promotion_override_set',
    targetType: 'students',
    targetId: input.studentId,
    afterState: { session_id: from.sessionId, decision: input.decision, to_section: toSection },
  });
  return { ok: true };
}

export type PromoteResult =
  | { ok: true; runId: string; counts: PromotionView['counts']; classesMade: number }
  | { ok: false; reason: 'no_session' | 'no_next_session' | 'already_promoted' | 'students_undecided'; undecided?: number };

type EventRow = { outcome: string; studentId?: string | null; classId?: string | null; fromClassId?: string | null; toClassId?: string | null; fromSessionId?: string | null; toSessionId?: string | null; fromStatus?: string | null; fromRollNo?: string | null; reason?: string | null };

async function writeEvents(db: Sql, actor: PromotionActor, runId: string, events: EventRow[]) {
  if (events.length === 0) return;
  await db.query(
    `insert into promotion_events (school_id, run_id, outcome, student_id, class_id, from_class_id, to_class_id, from_session_id, to_session_id, from_status, from_roll_no, reason, actor_user_id)
     select $1, $2, e->>'outcome', (e->>'studentId')::uuid, (e->>'classId')::uuid, (e->>'fromClassId')::uuid, (e->>'toClassId')::uuid,
            (e->>'fromSessionId')::uuid, (e->>'toSessionId')::uuid, (e->>'fromStatus')::student_status, e->>'fromRollNo', e->>'reason', $3
       from jsonb_array_elements($4::jsonb) with ordinality as x(e, n) order by x.n`,
    [actor.schoolId, runId, actor.userId, JSON.stringify(events)]
  );
}

const makeCurrent = async (db: Sql, schoolId: string, sessionId: string) => {
  await db.query(`update academic_sessions set is_current = false where school_id = $1 and is_current`, [schoolId]);
  await db.query(`update academic_sessions set is_current = true where school_id = $1 and session_id = $2`, [schoolId, sessionId]);
};

// The promotion, in the caller's one transaction: either all of it happens or none of it.
export async function promote(db: Sql, actor: PromotionActor): Promise<PromoteResult> {
  await lockSessions(db, actor.schoolId);
  await lockSchoolClasses(db, actor.schoolId);
  const { from, to } = await sessionsOf(db, actor.schoolId);
  if (!from) return { ok: false, reason: 'no_session' };
  if (!to) return { ok: false, reason: 'no_next_session' };
  if (await runFrom(db, actor.schoolId, from.sessionId)) return { ok: false, reason: 'already_promoted' };
  const { classes, students, overrides } = await inputsOf(db, actor.schoolId, from.sessionId);
  const plan = planPromotion(classes, students, overrides);
  if (plan.undecided > 0) return { ok: false, reason: 'students_undecided', undecided: plan.undecided };

  const runId = (
    await db.query(`insert into promotion_runs (school_id, action, from_session_id, to_session_id, actor_user_id) values ($1, 'promoted', $2, $3, $4) returning run_id`, [actor.schoolId, from.sessionId, to.sessionId, actor.userId])
  ).rows[0].run_id as string;
  const events: EventRow[] = [];

  // The classes the school does not have yet, made for the new session (no class teacher: chosen on the Classes list).
  const made = new Map<string, string>();
  if (plan.toMake.length > 0) {
    const rows = (
      await db.query(
        `insert into classes (school_id, name, grade, section, session_id)
         select $1, n.name, n.grade, n.section, $2::uuid from unnest($3::text[], $4::text[], $5::text[]) with ordinality as n(name, grade, section, i) order by n.i
         returning class_id, name`,
        [actor.schoolId, to.sessionId, plan.toMake.map((c: ClassToMake) => c.name), plan.toMake.map((c) => c.grade), plan.toMake.map((c) => c.section)]
      )
    ).rows as { class_id: string; name: string }[];
    const byName = new Map(rows.map((r) => [r.name, r.class_id]));
    for (const c of plan.toMake) {
      const id = byName.get(c.name)!;
      made.set(c.key, id);
      events.push({ outcome: 'class_made', classId: id, toSessionId: to.sessionId });
    }
  }
  // Every other class of the school now belongs to the new session; what it was before is kept for the undo.
  const retagged = (
    await db.query(
      `with old as (select class_id, session_id from classes where school_id = $1 and session_id is distinct from $2::uuid for update)
       update classes c set session_id = $2::uuid from old where c.school_id = $1 and c.class_id = old.class_id returning c.class_id, old.session_id as before`,
      [actor.schoolId, to.sessionId]
    )
  ).rows as { class_id: string; before: string | null }[];
  for (const r of retagged) events.push({ outcome: 'class_retagged', classId: r.class_id, fromSessionId: r.before, toSessionId: to.sessionId });

  const status = new Map(students.map((s) => [s.studentId, s.status]));
  const roll = new Map(students.map((s) => [s.studentId, s.rollNo]));
  const target = (d: Destination): string | null => (d.kind === 'class' ? d.classId : d.kind === 'make' ? made.get(d.key)! : null);
  const moving = plan.moves.filter((m) => m.outcome === 'promoted' || m.outcome === 'moved_section');
  if (moving.length > 0) {
    await db.query(
      `update students s set class_id = m.to_class, roll_no = null, updated_at = now() from unnest($2::uuid[], $3::uuid[]) as m(student_id, to_class) where s.school_id = $1 and s.student_id = m.student_id`,
      [actor.schoolId, moving.map((m) => m.studentId), moving.map((m) => target(m.to))]
    );
  }
  const leaving = plan.moves.filter((m) => m.outcome === 'left');
  if (leaving.length > 0) {
    await db.query(`update students set status = 'inactive', left_on = current_date, updated_at = now() where school_id = $1 and student_id = any ($2::uuid[])`, [actor.schoolId, leaving.map((m) => m.studentId)]);
  }
  for (const m of plan.moves) {
    events.push({ outcome: m.outcome, studentId: m.studentId, fromClassId: m.fromClassId, toClassId: target(m.to), fromSessionId: from.sessionId, toSessionId: to.sessionId, fromStatus: status.get(m.studentId) ?? null, fromRollNo: roll.get(m.studentId) ?? null, reason: m.reason });
  }
  await writeEvents(db, actor, runId, events);
  await makeCurrent(db, actor.schoolId, to.sessionId);

  const counts = view(plan, new Map(students.map((s) => [s.studentId, s])), overrides).counts;
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'setup.promotion_done',
    targetType: 'promotion_runs',
    targetId: runId,
    beforeState: { session_id: from.sessionId },
    afterState: { session_id: to.sessionId, promoted: counts.promoted, repeated: counts.repeated, moved_section: counts.movedSection, left: counts.left, classes_made: made.size },
  });
  return { ok: true, runId, counts, classesMade: made.size };
}

export type UndoResult = { ok: true; runId: string; restored: number; classesRemoved: number } | { ok: false; reason: 'nothing_to_undo' | 'undo_too_late' };

// The reverse of the last promotion, within 24 hours. A class it made is removed when nothing refers to it any more;
// one that is in use since (attendance taken, a fee set) is kept, empty of the students it was made for.
export async function undoPromotion(db: Sql, actor: PromotionActor): Promise<UndoResult> {
  await lockSessions(db, actor.schoolId);
  await lockSchoolClasses(db, actor.schoolId);
  const run = await lastRunOf(db, actor.schoolId);
  if (!run) return { ok: false, reason: 'nothing_to_undo' };
  if (!run.canUndo) return { ok: false, reason: 'undo_too_late' };
  const events = (
    await db.query(
      `select outcome, student_id, class_id, from_class_id, to_class_id, from_session_id, from_status::text as from_status, from_roll_no from promotion_events where school_id = $1 and run_id = $2 order by created_at, event_id`,
      [actor.schoolId, run.runId]
    )
  ).rows as { outcome: string; student_id: string | null; class_id: string | null; from_class_id: string | null; to_class_id: string | null; from_session_id: string | null; from_status: string | null; from_roll_no: string | null }[];
  const undoId = (
    await db.query(`insert into promotion_runs (school_id, action, from_session_id, to_session_id, undoes_run_id, actor_user_id) values ($1, 'undone', $2, $3, $4, $5) returning run_id`, [
      actor.schoolId,
      run.toSessionId,
      run.fromSessionId,
      run.runId,
      actor.userId,
    ])
  ).rows[0].run_id as string;

  const moved = events.filter((e) => e.outcome === 'promoted' || e.outcome === 'moved_section');
  if (moved.length > 0) {
    // Everyone leaves the new classes first, then takes back the old class and roll number, so no roll clashes midway.
    await db.query(`update students set roll_no = null where school_id = $1 and student_id = any ($2::uuid[])`, [actor.schoolId, moved.map((e) => e.student_id)]);
    await db.query(
      `update students s set class_id = m.from_class, roll_no = m.roll_no, updated_at = now() from unnest($2::uuid[], $3::uuid[], $4::text[]) as m(student_id, from_class, roll_no) where s.school_id = $1 and s.student_id = m.student_id`,
      [actor.schoolId, moved.map((e) => e.student_id), moved.map((e) => e.from_class_id), moved.map((e) => e.from_roll_no)]
    );
  }
  const left = events.filter((e) => e.outcome === 'left');
  if (left.length > 0) {
    await db.query(
      `update students s set status = m.status::student_status, left_on = null, updated_at = now() from unnest($2::uuid[], $3::text[]) as m(student_id, status) where s.school_id = $1 and s.student_id = m.student_id`,
      [actor.schoolId, left.map((e) => e.student_id), left.map((e) => e.from_status ?? 'active')]
    );
  }
  const retagged = events.filter((e) => e.outcome === 'class_retagged');
  if (retagged.length > 0) {
    await db.query(`update classes c set session_id = m.session_id from unnest($2::uuid[], $3::uuid[]) as m(class_id, session_id) where c.school_id = $1 and c.class_id = m.class_id`, [
      actor.schoolId,
      retagged.map((e) => e.class_id),
      retagged.map((e) => e.from_session_id),
    ]);
  }
  let classesRemoved = 0;
  for (const e of events.filter((x) => x.outcome === 'class_made')) {
    await db.query('savepoint promotion_class');
    try {
      const gone = await db.query(`delete from classes where school_id = $1 and class_id = $2 and not exists (select 1 from students where school_id = $1 and class_id = $2) returning 1`, [actor.schoolId, e.class_id]);
      await db.query('release savepoint promotion_class');
      classesRemoved += gone.rows.length;
    } catch {
      // Something refers to it now (attendance, a timetable, a fee): it stays.
      await db.query('rollback to savepoint promotion_class');
    }
  }
  const reverse: EventRow[] = events
    .filter((e) => e.student_id && e.outcome !== 'repeated')
    .map((e) => ({ outcome: 'undone', studentId: e.student_id, fromClassId: e.to_class_id, toClassId: e.from_class_id, fromSessionId: run.toSessionId, toSessionId: run.fromSessionId, fromStatus: e.outcome === 'left' ? 'inactive' : null }));
  await writeEvents(db, actor, undoId, reverse);
  await makeCurrent(db, actor.schoolId, run.fromSessionId);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'setup.promotion_undone',
    targetType: 'promotion_runs',
    targetId: run.runId,
    beforeState: { session_id: run.toSessionId },
    afterState: { session_id: run.fromSessionId, undo_run_id: undoId, restored: reverse.length, classes_removed: classesRemoved },
  });
  return { ok: true, runId: undoId, restored: reverse.length, classesRemoved };
}
