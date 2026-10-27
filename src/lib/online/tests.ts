import { writeAuditLog } from '@/lib/audit/log';
import {
  ONLINE_MINUTES_MAX,
  ONLINE_MINUTES_MIN,
  ONLINE_WINDOW_DAYS_MAX,
  type OnlineAnswer,
  type OnlineAttemptRow,
  type OnlineAttemptState,
  type OnlineScriptAnswers,
  type OnlineTest,
  type OnlineTestScreen,
  type PaperSitting,
} from '@/lib/contracts/marking';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { markingPaper, paperRoster, type Actor } from '@/lib/marking/context';
import { askToMarkAgain } from '@/lib/marking/review';
import { structureProblems } from '@/lib/marking/rollup';
import { questionsOf } from '@/lib/marking/setup';
import { indiaLocalToIso } from './time';

// The teacher's side of online tests (docs/36 §1.3, C365), on the paper's marking hub: how the paper is sat, the
// test's times, minutes and shuffle, "Open" and "Close", and the class's attempts in roll order (not started, being
// sat, submitted, timed out, set aside) with the times each child left the test screen. Never a score or a rank: a
// script's marks are seen in the review, and by families only at publication. Everything runs in the caller's own
// tenant transaction, so the row rules (migration ..._aq_4_online.sql) hold as here: the office and the coordinator
// read every paper, a teacher their own classes'; whoever may mark the paper changes it.

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export type OnlineProblem = 'not_found' | 'not_allowed' | 'closed' | 'sitting' | 'fixed' | 'state' | 'times' | 'minutes' | 'questions' | 'no_test' | 'marked';
export type OnlineResult = { ok: true } | { ok: false; reason: OnlineProblem };

async function sittingOf(db: Sql, schoolId: string, paperId: string): Promise<PaperSitting | null> {
  return ((await db.query(`select sitting from exam_papers where school_id = $1 and paper_id = $2`, [schoolId, paperId])).rows[0]?.sitting ?? null) as PaperSitting | null;
}

type TestRow = { test_id: string; opens_at: Date; closes_at: Date; minutes: number; shuffle: boolean; opened_at: Date | null; opened_by: string | null; closed_at: Date | null; closed_by: string | null };

async function testOf(db: Sql, schoolId: string, paperId: string, lock = false): Promise<(TestRow & { opener: string | null; closer: string | null }) | null> {
  const row = (
    await db.query(
      `select t.test_id, t.opens_at, t.closes_at, t.minutes, t.shuffle, t.opened_at, t.opened_by, t.closed_at, t.closed_by,
              (select u.display_name from users u where u.school_id = t.school_id and u.user_id = t.opened_by) as opener,
              (select u.display_name from users u where u.school_id = t.school_id and u.user_id = t.closed_by) as closer
         from online_tests t where t.school_id = $1 and t.paper_id = $2${lock ? ' for update of t' : ''}`,
      [schoolId, paperId]
    )
  ).rows[0];
  return row ?? null;
}

const testView = (t: TestRow & { opener: string | null; closer: string | null }): OnlineTest => ({
  testId: t.test_id,
  opensAt: iso(t.opens_at) as string,
  closesAt: iso(t.closes_at) as string,
  minutes: Number(t.minutes),
  shuffle: t.shuffle === true,
  openedAt: iso(t.opened_at),
  openedBy: t.opened_at ? t.opener ?? '' : null,
  closedAt: iso(t.closed_at),
  closedBy: t.closed_at ? t.closer ?? '' : null,
});

// The paper's online test as the person may see it; null when the paper is not one they read.
export async function onlineTestScreen(db: Sql, actor: Actor, paperId: string): Promise<OnlineTestScreen | null> {
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return null;
  const sitting = (await sittingOf(db, actor.schoolId, paperId)) ?? 'written';
  const test = await testOf(db, actor.schoolId, paperId);
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const counts = ((await db.query(`select choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0]?.choice_counts ?? {}) as Record<string, number>;
  const scripts = Number((await db.query(`select count(*)::int as n from marking_sheets where school_id = $1 and paper_id = $2 and state <> 'set_aside'`, [actor.schoolId, paperId])).rows[0]?.n ?? 0);
  const roster = await paperRoster(db, actor.schoolId, paper);
  const rows = (
    await db.query(`select student_id, state, started_at, submitted_at, voided_at, left_count, sheet_id from online_attempts where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])
  ).rows as { student_id: string; state: OnlineAttemptState; started_at: Date; submitted_at: Date | null; voided_at: Date | null; left_count: number; sheet_id: string | null }[];
  const byStudent = new Map(rows.map((r) => [r.student_id, r]));
  const now = iso((await db.query(`select now() as now`)).rows[0]?.now) as string;
  // An attempt still open past its deadline reads as timed out (the sweep records it within minutes).
  const due = new Map(
    ((await db.query(`select student_id from online_attempts where school_id = $1 and paper_id = $2 and state = 'open' and deadline_at <= now()`, [actor.schoolId, paperId])).rows as { student_id: string }[]).map((r) => [r.student_id, true])
  );
  const attempts: OnlineAttemptRow[] = roster.map((student) => {
    const a = byStudent.get(student.studentId);
    if (!a) return { student, state: 'not_started', startedAt: null, endedAt: null, leftCount: 0, marked: false };
    return {
      student,
      state: a.state === 'open' && due.get(student.studentId) ? 'timed_out' : a.state,
      startedAt: iso(a.started_at),
      endedAt: iso(a.submitted_at ?? a.voided_at),
      leftCount: Number(a.left_count),
      marked: a.sheet_id !== null,
    };
  });
  return {
    paper,
    sitting,
    test: test ? testView(test) : null,
    ready: structureProblems(paper.components, questions, counts).length === 0,
    scripts,
    attempts,
    mayChange: paper.mayMark && !paper.published,
    now,
  };
}

// The checks every change starts with: a paper the person may mark, its class not published.
async function forChange(db: Sql, actor: Actor, paperId: string): Promise<{ ok: true } | { ok: false; reason: OnlineProblem }> {
  if (!isUuid(paperId)) return { ok: false, reason: 'not_found' };
  const paper = await markingPaper(db, actor, paperId);
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.published) return { ok: false, reason: 'closed' };
  if (!paper.mayMark) return { ok: false, reason: 'not_allowed' };
  return { ok: true };
}

const audit = (db: Sql, actor: Actor, paperId: string, action: string, after: Record<string, unknown> = {}) =>
  writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `marking.online_${action}`, targetType: 'exam_papers', targetId: paperId, afterState: after });

// Sit the paper online, or back in the answer book. Fixed once a script of the paper exists or a child has started
// it (the database holds both); a paper sat on bubble sheets is not changed from here.
export async function setSitting(db: Sql, actor: Actor, paperId: string, sitting: unknown): Promise<OnlineResult> {
  if (sitting !== 'online' && sitting !== 'written') return { ok: false, reason: 'sitting' };
  const may = await forChange(db, actor, paperId);
  if (!may.ok) return may;
  const now = await sittingOf(db, actor.schoolId, paperId);
  if (now === sitting) return { ok: true };
  if (now === 'bubble') return { ok: false, reason: 'sitting' };
  const scripts = (await db.query(`select 1 from marking_sheets where school_id = $1 and paper_id = $2 limit 1`, [actor.schoolId, paperId])).rows[0];
  const started = (await db.query(`select 1 from online_attempts where school_id = $1 and paper_id = $2 limit 1`, [actor.schoolId, paperId])).rows[0];
  if (scripts || started) return { ok: false, reason: 'fixed' };
  const test = await testOf(db, actor.schoolId, paperId);
  if (sitting === 'written' && test?.opened_at && !test.closed_at) return { ok: false, reason: 'state' };
  await db.query(`update exam_papers set sitting = $3 where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId, sitting]);
  await audit(db, actor, paperId, 'sitting', { sitting });
  return { ok: true };
}

// The test's times, minutes and shuffle, as India's date and time. The window holds the minutes, ends in the future
// and lasts at most ONLINE_WINDOW_DAYS_MAX days; fixed once a child has started.
export async function saveTest(db: Sql, actor: Actor, paperId: string, raw: unknown): Promise<OnlineResult> {
  const b = (raw ?? {}) as { opensAt?: unknown; closesAt?: unknown; minutes?: unknown; shuffle?: unknown };
  const opens = indiaLocalToIso(b.opensAt);
  const closes = indiaLocalToIso(b.closesAt);
  const minutes = b.minutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < ONLINE_MINUTES_MIN || minutes > ONLINE_MINUTES_MAX) return { ok: false, reason: 'minutes' };
  if (!opens || !closes || typeof b.shuffle !== 'boolean') return { ok: false, reason: 'times' };
  const span = new Date(closes).getTime() - new Date(opens).getTime();
  if (span < minutes * 60_000 || span > ONLINE_WINDOW_DAYS_MAX * 86_400_000 || new Date(closes).getTime() <= Date.now()) return { ok: false, reason: 'times' };
  const may = await forChange(db, actor, paperId);
  if (!may.ok) return may;
  if ((await sittingOf(db, actor.schoolId, paperId)) !== 'online') return { ok: false, reason: 'sitting' };
  const test = await testOf(db, actor.schoolId, paperId, true);
  if (test) {
    if (test.closed_at) return { ok: false, reason: 'state' };
    const started = (await db.query(`select 1 from online_attempts where school_id = $1 and test_id = $2 limit 1`, [actor.schoolId, test.test_id])).rows[0];
    if (started) return { ok: false, reason: 'fixed' };
    await db.query(`update online_tests set opens_at = $3, closes_at = $4, minutes = $5, shuffle = $6 where school_id = $1 and test_id = $2`, [actor.schoolId, test.test_id, opens, closes, minutes, b.shuffle]);
  } else {
    await db.query(`insert into online_tests (school_id, paper_id, opens_at, closes_at, minutes, shuffle, updated_by) values ($1, $2, $3, $4, $5, $6, $7)`, [
      actor.schoolId,
      paperId,
      opens,
      closes,
      minutes,
      b.shuffle,
      actor.userId,
    ]);
  }
  await audit(db, actor, paperId, 'saved', { opens_at: opens, closes_at: closes, minutes, shuffle: b.shuffle });
  return { ok: true };
}

// "Open": from now the children of the class see the test (it can be sat from its opening time). Only a paper sat
// online whose questions make up the paper, before its closing time.
export async function openTest(db: Sql, actor: Actor, paperId: string): Promise<OnlineResult> {
  const may = await forChange(db, actor, paperId);
  if (!may.ok) return may;
  if ((await sittingOf(db, actor.schoolId, paperId)) !== 'online') return { ok: false, reason: 'sitting' };
  const test = await testOf(db, actor.schoolId, paperId, true);
  if (!test) return { ok: false, reason: 'no_test' };
  if (test.opened_at) return { ok: false, reason: 'state' };
  if (new Date(test.closes_at).getTime() <= Date.now()) return { ok: false, reason: 'times' };
  const paper = await markingPaper(db, actor, paperId);
  const questions = await questionsOf(db, actor.schoolId, paperId);
  const counts = ((await db.query(`select choice_counts from marking_setups where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows[0]?.choice_counts ?? {}) as Record<string, number>;
  if (!paper || structureProblems(paper.components, questions, counts).length) return { ok: false, reason: 'questions' };
  await db.query(`update online_tests set opened_at = now(), opened_by = $3 where school_id = $1 and test_id = $2`, [actor.schoolId, test.test_id, actor.userId]);
  await audit(db, actor, paperId, 'opened');
  return { ok: true };
}

// "Close": no attempt starts from now; one being sat keeps its own time (never past the closing time).
export async function closeTest(db: Sql, actor: Actor, paperId: string): Promise<OnlineResult> {
  const may = await forChange(db, actor, paperId);
  if (!may.ok) return may;
  const test = await testOf(db, actor.schoolId, paperId, true);
  if (!test) return { ok: false, reason: 'no_test' };
  if (!test.opened_at || test.closed_at) return { ok: false, reason: 'state' };
  await db.query(`update online_tests set closed_at = now(), closed_by = $3 where school_id = $1 and test_id = $2`, [actor.schoolId, test.test_id, actor.userId]);
  await audit(db, actor, paperId, 'closed');
  return { ok: true };
}

// A child's attempt set aside: it ends now if it is being sat, and no script is made from it. Not one whose script is
// made (that script is set aside in the review instead); never undone.
export async function voidAttempt(db: Sql, actor: Actor, paperId: string, studentId: unknown): Promise<OnlineResult> {
  if (!isUuid(studentId)) return { ok: false, reason: 'not_found' };
  const may = await forChange(db, actor, paperId);
  if (!may.ok) return may;
  const a = (await db.query(`select attempt_id, state, sheet_id from online_attempts where school_id = $1 and paper_id = $2 and student_id = $3 for update`, [actor.schoolId, paperId, studentId])).rows[0];
  if (!a) return { ok: false, reason: 'not_found' };
  if (a.sheet_id) return { ok: false, reason: 'marked' };
  if (a.state === 'voided') return { ok: false, reason: 'state' };
  await db.query(`update online_attempts set state = 'voided' where school_id = $1 and attempt_id = $2`, [actor.schoolId, a.attempt_id]);
  await audit(db, actor, paperId, 'voided', { attempt_id: a.attempt_id });
  return { ok: true };
}

// An online script's typed answers, for the review screen, read under the viewer's own row rules; null for a script
// that is not an online one the person may read.
export async function scriptAnswers(db: Sql, actor: Actor, sheetId: string): Promise<OnlineScriptAnswers | null> {
  if (!isUuid(sheetId)) return null;
  const a = (
    await db.query(`select attempt_id, paper_id, started_at, submitted_at, voided_at, state, left_count from online_attempts where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])
  ).rows[0];
  if (!a || !(await markingPaper(db, actor, a.paper_id))) return null;
  const answers = (
    await db.query(
      `select q.question_id, w.answer, coalesce(w.flagged, false) as flagged, w.saved_at
         from marking_questions q
         left join online_answers w on w.school_id = q.school_id and w.attempt_id = $3 and w.question_id = q.question_id
        where q.school_id = $1 and q.paper_id = $2
        order by q.position, q.question_id`,
      [actor.schoolId, a.paper_id, a.attempt_id]
    )
  ).rows.map((r) => ({ questionId: r.question_id as string, answer: (r.answer ?? null) as OnlineAnswer | null, flagged: r.flagged === true, savedAt: iso(r.saved_at) }));
  return { sheetId, startedAt: iso(a.started_at) as string, endedAt: iso(a.submitted_at ?? a.voided_at), state: a.state, leftCount: Number(a.left_count), answers };
}

// "Mark again" for an online script: the review's own step (the teacher's changes cleared, the script waiting), then
// its marking queued as an online script's (src/lib/online/mark.ts), never the page pictures' job.
export async function markOnlineAgain(db: Sql, actor: Actor, sheetId: string): Promise<{ ok: true; queued: boolean } | { ok: false; reason: string }> {
  if (!isUuid(sheetId)) return { ok: false, reason: 'not_found' };
  const online = (await db.query(`select 1 from online_attempts where school_id = $1 and sheet_id = $2`, [actor.schoolId, sheetId])).rows[0];
  if (!online) return { ok: false, reason: 'not_found' };
  const asked = await askToMarkAgain(db, actor, sheetId);
  if (!asked.ok) return asked;
  const r = (await db.query(`select public.online_queue_marking($1) as r`, [sheetId])).rows[0]?.r as string;
  if (r === 'queued' || r === 'off') return { ok: true, queued: r === 'queued' };
  return { ok: false, reason: r };
}
