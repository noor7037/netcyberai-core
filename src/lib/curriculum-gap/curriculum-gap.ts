import type { SchoolRole } from '@/lib/contracts/modules';
import { classLabel } from '@/lib/frameworks/class-label';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { gapStates, type GapCounts, type GapPaper, type UnitFacts, type UnitGap } from './rules';
import { classOrderSql } from '@/lib/classes/class-order';

// The Curriculum Gap Detector's screen (docs/27 row 9d, C216): for one class and one subject, every unit of the
// syllabus map once, in the map's order, with its state and the days it rests on, and a count of each state. The
// states are worked out here, on every read, by rules.ts; nothing is stored.
//
// Who reads what (docs/27 section 3 rule 6): the principal, the school admin and the academic coordinator any class
// of the school; a teacher their own classes (teacher_own_class_ids(): a class they teach a subject in, or their class
// as class teacher), every subject of it. Nobody else. The database holds the same rule in the reader
// public.curriculum_gap_units, which this calls in the person's own tenant transaction. A class with no map for the
// subject is "not set up", never a row of zeros.
//
// ONE SESSION AT A TIME (C219): the screen is for one academic session of the school, the current one unless another
// is chosen. Lessons count when they were marked "Taught" on the session's days, and papers when their exam belongs to
// the session (exams.session_id). A school with no session, or a session with no lesson of the class and subject yet,
// is "not set up" too, and says which.

export const GAP_READERS: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];
const WHOLE_SCHOOL: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator'];

export type Actor = { schoolId: string; userId: string; role: SchoolRole };

// Why a class and subject is not set up: no syllabus map, no lesson of it marked in the session, or no session at all.
export type NotSetUp = 'no_map' | 'no_lessons' | 'no_session';
export type GapView = { setUp: false; why: NotSetUp } | { setUp: true; units: UnitGap[]; counts: GapCounts; total: number };
export type GapSession = { sessionId: string; label: string; startDate: string; endDate: string; current: boolean };

export type GapScreen = {
  wholeSchool: boolean; // the office and the coordinator: every class; a teacher: their own
  classes: { classId: string; name: string }[];
  // Every subject of the school, and whether the chosen class has a syllabus map for it.
  subjects: { subjectId: string; name: string; mapped: boolean }[];
  classId: string | null;
  subjectId: string | null;
  // The school's sessions, newest first, and the one shown (null: the school has none).
  sessions: GapSession[];
  sessionId: string | null;
  // null when there is no class or no subject to show.
  gap: GapView | null;
};

export type GapAnswer = { ok: true; screen: GapScreen } | { ok: false; reason: 'not_allowed' | 'not_found' };

const given = (v: unknown) => v !== null && v !== undefined && v !== '';

// The facts of one class and subject's units in one session, from the database's own reader, in the map's order.
export async function unitFacts(db: Sql, classId: string, subjectId: string, sessionId: string): Promise<UnitFacts[]> {
  const { rows } = await db.query(
    `select unit_id, place, chapter, topic, to_char(added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as added_at,
            taught_first::text as taught_first, taught_last::text as taught_last, lessons, papers
       from public.curriculum_gap_units($1, $2, $3)`,
    [classId, subjectId, sessionId]
  );
  return rows.map((r) => ({
    unitId: r.unit_id as string,
    place: Number(r.place),
    chapter: r.chapter as string,
    topic: r.topic as string,
    addedAt: r.added_at as string,
    taughtFirst: (r.taught_first as string | null) ?? null,
    taughtLast: (r.taught_last as string | null) ?? null,
    lessons: Number(r.lessons),
    papers: ((r.papers ?? []) as Record<string, unknown>[]).map(
      (p): GapPaper => ({ paperId: String(p.paperId), examId: String(p.examId), examName: String(p.examName), date: typeof p.date === 'string' ? p.date : null })
    ),
  }));
}

// One class and subject's gaps in a session: "not set up" without a map, or with neither a lesson marked nor a paper
// set in the session; otherwise every unit with its state and the counts (a paper before any lesson is the gap the
// detector exists to show: review of C219).
export async function classGap(db: Sql, classId: string, subjectId: string, sessionId: string): Promise<GapView> {
  const facts = await unitFacts(db, classId, subjectId, sessionId);
  if (facts.length === 0) return { setUp: false, why: 'no_map' };
  if (!facts.some((f) => f.lessons > 0 || f.papers.length > 0)) return { setUp: false, why: 'no_lessons' };
  const { units, counts } = gapStates(facts);
  return { setUp: true, units, counts, total: units.length };
}

// The school's sessions, newest first, and the one shown by default: the one marked current, else the one India's
// today falls in, else the newest.
export async function gapSessions(db: Sql, schoolId: string, today: string = indiaDate()): Promise<{ sessions: GapSession[]; current: string | null }> {
  const sessions = (
    await db.query(
      `select session_id, label, start_date::text as start_date, end_date::text as end_date, is_current
         from academic_sessions where school_id = $1 order by start_date desc, session_id`,
      [schoolId]
    )
  ).rows.map((r): GapSession => ({ sessionId: r.session_id, label: r.label, startDate: r.start_date, endDate: r.end_date, current: r.is_current === true }));
  const current = sessions.find((s) => s.current) ?? sessions.find((s) => s.startDate <= today && today <= s.endDate) ?? sessions[0] ?? null;
  return { sessions, current: current?.sessionId ?? null };
}

// The screen: the person's classes, the school's subjects, and the chosen class and subject's gaps. A class or a
// subject asked for that is not this person's to read is "not found", so it says nothing about what exists.
export async function gapScreen(db: Sql, actor: Actor, ask: { classId?: unknown; subjectId?: unknown; sessionId?: unknown }, today: string = indiaDate()): Promise<GapAnswer> {
  if (!GAP_READERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const wholeSchool = WHOLE_SCHOOL.includes(actor.role);
  const classes = (
    await db.query(
      `select class_id, name, section from classes
        where school_id = $1 and ($2::boolean or class_id = any (public.teacher_own_class_ids()))
        order by ${classOrderSql('')}, class_id`,
      [actor.schoolId, wholeSchool]
    )
  ).rows.map((r) => ({ classId: r.class_id as string, name: classLabel(r.name, r.section) ?? '' }));

  if (given(ask.classId) && !(isUuid(ask.classId) && classes.some((c) => c.classId === ask.classId))) return { ok: false, reason: 'not_found' };
  const classId = given(ask.classId) ? (ask.classId as string) : (classes[0]?.classId ?? null);

  const subjects = (
    await db.query(
      `select s.subject_id, s.name,
              exists (select 1 from syllabus_units u where u.school_id = s.school_id and u.class_id = $2::uuid and u.subject_id = s.subject_id) as mapped
         from subjects s
        where s.school_id = $1
        order by s.name, s.subject_id`,
      [actor.schoolId, classId]
    )
  ).rows.map((r) => ({ subjectId: r.subject_id as string, name: r.name as string, mapped: r.mapped === true }));

  if (given(ask.subjectId) && !(isUuid(ask.subjectId) && subjects.some((s) => s.subjectId === ask.subjectId))) return { ok: false, reason: 'not_found' };
  // Asked for, or the first subject the class has a map for, or the first subject.
  const subjectId = given(ask.subjectId) ? (ask.subjectId as string) : ((subjects.find((s) => s.mapped) ?? subjects[0])?.subjectId ?? null);

  const { sessions, current } = await gapSessions(db, actor.schoolId, today);
  if (given(ask.sessionId) && !(isUuid(ask.sessionId) && sessions.some((s) => s.sessionId === ask.sessionId))) return { ok: false, reason: 'not_found' };
  const sessionId = given(ask.sessionId) ? (ask.sessionId as string) : current;

  const gap: GapView | null = classId && subjectId ? (sessionId ? await classGap(db, classId, subjectId, sessionId) : { setUp: false, why: 'no_session' }) : null;
  return { ok: true, screen: { wholeSchool, classes, subjects, classId, subjectId, sessions, sessionId, gap } };
}
