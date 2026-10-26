import { writeAuditLog } from '@/lib/audit/log';
import type { ExamCandidates, RosterChild } from '@/lib/contracts/marking';
import { EXAM_READERS, EXAM_RUNNERS } from '@/lib/exams/exams';
import { ON_ROLL, ROLL_ORDER } from '@/lib/exams/papers';
import { classLabel } from '@/lib/frameworks/class-label';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { classOrderSql } from '@/lib/classes/class-order';
import type { Actor } from './context';

// An exam's candidates and exam numbers (C348). Candidates are the rolls of the exam's classes less the children the
// office withdrew from it, counted by the database from the rows every time (exam_candidate_counts). Exam numbers are
// the database's: turned on per exam by the office, issued in class and roll order, and to a child who joins later at
// once; never reused or changed. Official roll numbers are never touched. Everything runs in the caller's own tenant
// transaction; the office (EXAM_RUNNERS) changes, a teacher reads their own classes.

export const REASON_MIN = 3;
export const REASON_MAX = 300;
export const PREFIX_RE = /^[A-Z0-9]{0,6}$/;

export async function examCandidates(db: Sql, actor: Actor, examId: string): Promise<ExamCandidates | null> {
  if (!EXAM_READERS.includes(actor.role) || !isUuid(examId)) return null;
  const exam = (await db.query(`select exam_id, numbering, seat_prefix from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
  if (!exam) return null;
  const counts = (
    await db.query(
      `select k.class_id, c.name, c.section, k.on_roll, k.withdrawn, k.candidates, k.numbered
         from public.exam_candidate_counts($1) k join classes c on c.school_id = $2 and c.class_id = k.class_id
        order by ${classOrderSql('c')}, c.class_id`,
      [examId, actor.schoolId]
    )
  ).rows;
  const withdrawals = (
    await db.query(
      `select w.student_id, s.name, s.roll_no, c.name as class_name, c.section, w.reason, w.withdrawn_at
         from exam_withdrawals w join students s on s.school_id = w.school_id and s.student_id = w.student_id
         left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
        where w.school_id = $1 and w.exam_id = $2 order by ${classOrderSql('c')}, ${ROLL_ORDER}`,
      [actor.schoolId, examId]
    )
  ).rows;
  return {
    examId,
    numbering: exam.numbering,
    seatPrefix: exam.seat_prefix,
    classes: counts.map((r) => ({
      classId: r.class_id,
      className: classLabel(r.name, r.section) ?? '',
      onRoll: Number(r.on_roll),
      withdrawn: Number(r.withdrawn),
      candidates: Number(r.candidates),
      numbered: Number(r.numbered),
    })),
    withdrawals: withdrawals.map((r) => ({
      studentId: r.student_id,
      name: r.name,
      className: classLabel(r.class_name, r.section) ?? '',
      rollNo: r.roll_no ?? null,
      reason: r.reason,
      withdrawnAt: new Date(r.withdrawn_at).toISOString(),
    })),
    mayChange: EXAM_RUNNERS.includes(actor.role),
  };
}

// One class's candidates with their exam numbers, in roll order: the seat list the office prints.
export async function classCandidates(db: Sql, actor: Actor, examId: string, classId: string): Promise<(RosterChild & { withdrawn: boolean })[] | null> {
  if (!EXAM_READERS.includes(actor.role) || !isUuid(examId) || !isUuid(classId)) return null;
  const paper = (await db.query(`select 1 from exam_papers where school_id = $1 and exam_id = $2 and class_id = $3 limit 1`, [actor.schoolId, examId, classId])).rows[0];
  if (!paper) return null;
  const { rows } = await db.query(
    `select s.student_id, s.name, s.roll_no, x.seat_no, w.student_id is not null as withdrawn
       from students s
       left join exam_seat_numbers x on x.school_id = s.school_id and x.exam_id = $2 and x.student_id = s.student_id
       left join exam_withdrawals w on w.school_id = s.school_id and w.exam_id = $2 and w.student_id = s.student_id
      where s.school_id = $1 and s.class_id = $3 and ${ON_ROLL}
      order by ${ROLL_ORDER}`,
    [actor.schoolId, examId, classId]
  );
  return rows.map((r) => ({ studentId: r.student_id, name: r.name, rollNo: r.roll_no ?? null, seatNo: r.seat_no ?? null, withdrawn: r.withdrawn === true }));
}

export type CandidateProblem = 'not_allowed' | 'not_found' | 'reason' | 'prefix' | 'fixed' | 'closed' | 'already';
export type CandidateResult = { ok: true } | { ok: false; reason: CandidateProblem };

export async function withdrawCandidate(db: Sql, actor: Actor, examId: string, studentId: unknown, reasonRaw: unknown): Promise<CandidateResult> {
  if (!EXAM_RUNNERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isUuid(examId) || typeof studentId !== 'string' || !isUuid(studentId)) return { ok: false, reason: 'not_found' };
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return { ok: false, reason: 'reason' };
  const ok = (
    await db.query(
      `select 1 from exams e join exam_papers p on p.school_id = e.school_id and p.exam_id = e.exam_id
         join students s on s.school_id = p.school_id and s.class_id = p.class_id and s.student_id = $3
        where e.school_id = $1 and e.exam_id = $2 limit 1`,
      [actor.schoolId, examId, studentId]
    )
  ).rows[0];
  if (!ok) return { ok: false, reason: 'not_found' };
  await db.query('savepoint exam_withdraw');
  try {
    const r = await db.query(
      `insert into exam_withdrawals (school_id, exam_id, student_id, reason, withdrawn_by) values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [actor.schoolId, examId, studentId, reason, actor.userId]
    );
    await db.query('release savepoint exam_withdraw');
    if (!r.rowCount) return { ok: false, reason: 'already' };
  } catch (err) {
    await db.query('rollback to savepoint exam_withdraw');
    if ((err as { code?: string }).code === '42501') return { ok: false, reason: 'closed' };
    throw err;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam.candidate_withdrawn', targetType: 'students', targetId: studentId, afterState: { exam_id: examId } });
  return { ok: true };
}

// Taking a withdrawal back makes the child a candidate again; an exam with numbers on gives them one at once if they
// never had one.
export async function undoWithdrawal(db: Sql, actor: Actor, examId: string, studentId: unknown): Promise<CandidateResult> {
  if (!EXAM_RUNNERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isUuid(examId) || typeof studentId !== 'string' || !isUuid(studentId)) return { ok: false, reason: 'not_found' };
  const r = await db.query(`delete from exam_withdrawals where school_id = $1 and exam_id = $2 and student_id = $3`, [actor.schoolId, examId, studentId]);
  if (!r.rowCount) return { ok: false, reason: 'not_found' };
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam.candidate_restored', targetType: 'students', targetId: studentId, afterState: { exam_id: examId } });
  return { ok: true };
}

// Exam numbers on or off, and their prefix (fixed once a number is issued). Turning them on issues every candidate's.
export async function setNumbering(db: Sql, actor: Actor, examId: string, numbering: unknown, prefixRaw: unknown): Promise<CandidateResult> {
  if (!EXAM_RUNNERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isUuid(examId) || (numbering !== 'roll' && numbering !== 'seat')) return { ok: false, reason: 'not_found' };
  const prefix = typeof prefixRaw === 'string' ? prefixRaw.trim().toUpperCase() : prefixRaw === undefined || prefixRaw === null ? undefined : null;
  if (prefix === null || (prefix !== undefined && !PREFIX_RE.test(prefix))) return { ok: false, reason: 'prefix' };
  const exam = (await db.query(`select numbering, seat_prefix, status from exams where school_id = $1 and exam_id = $2 for update`, [actor.schoolId, examId])).rows[0];
  if (!exam) return { ok: false, reason: 'not_found' };
  if (exam.status !== 'open') return { ok: false, reason: 'closed' };
  await db.query('savepoint exam_numbering');
  try {
    if (prefix !== undefined && prefix !== exam.seat_prefix) await db.query(`update exams set seat_prefix = $3 where school_id = $1 and exam_id = $2`, [actor.schoolId, examId, prefix]);
    if (numbering !== exam.numbering) await db.query(`update exams set numbering = $3 where school_id = $1 and exam_id = $2`, [actor.schoolId, examId, numbering]);
    await db.query('release savepoint exam_numbering');
  } catch (err) {
    await db.query('rollback to savepoint exam_numbering');
    if ((err as { code?: string }).code === '23514') return { ok: false, reason: 'fixed' };
    throw err;
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam.numbering_set', targetType: 'exams', targetId: examId, afterState: { numbering, prefix: prefix ?? exam.seat_prefix } });
  return { ok: true };
}
