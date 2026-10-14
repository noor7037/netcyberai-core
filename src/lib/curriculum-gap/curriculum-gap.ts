import type { SchoolRole } from '@/lib/contracts/modules';
import { classLabel } from '@/lib/frameworks/class-label';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { gapStates, type GapCounts, type GapPaper, type UnitFacts, type UnitGap } from './rules';

// The Curriculum Gap Detector's screen (docs/27 row 9d, C216): for one class and one subject, every unit of the
// syllabus map once, in the map's order, with its state and the days it rests on, and a count of each state. The
// states are worked out here, on every read, by rules.ts; nothing is stored.
//
// Who reads what (docs/27 section 3 rule 6): the principal, the school admin and the academic coordinator any class
// of the school; a teacher their own classes (teacher_own_class_ids(): a class they teach a subject in, or their class
// as class teacher), every subject of it. Nobody else. The database holds the same rule in the reader
// public.curriculum_gap_units, which this calls in the person's own tenant transaction. A class with no map for the
// subject is "not set up", never a row of zeros.

export const GAP_READERS: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];
const WHOLE_SCHOOL: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator'];

export type Actor = { schoolId: string; userId: string; role: SchoolRole };

export type GapView = { setUp: false } | { setUp: true; units: UnitGap[]; counts: GapCounts; total: number };

export type GapScreen = {
  wholeSchool: boolean; // the office and the coordinator: every class; a teacher: their own
  classes: { classId: string; name: string }[];
  // Every subject of the school, and whether the chosen class has a syllabus map for it.
  subjects: { subjectId: string; name: string; mapped: boolean }[];
  classId: string | null;
  subjectId: string | null;
  // null when there is no class or no subject to show.
  gap: GapView | null;
};

export type GapAnswer = { ok: true; screen: GapScreen } | { ok: false; reason: 'not_allowed' | 'not_found' };

const given = (v: unknown) => v !== null && v !== undefined && v !== '';

// The facts of one class and subject's units, from the database's own reader, in the map's order.
export async function unitFacts(db: Sql, classId: string, subjectId: string): Promise<UnitFacts[]> {
  const { rows } = await db.query(
    `select unit_id, place, chapter, topic, to_char(added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as added_at,
            taught_first::text as taught_first, taught_last::text as taught_last, lessons, papers
       from public.curriculum_gap_units($1, $2)`,
    [classId, subjectId]
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

// One class and subject's gaps: "not set up" without a map, otherwise every unit with its state and the counts.
export async function classGap(db: Sql, classId: string, subjectId: string): Promise<GapView> {
  const facts = await unitFacts(db, classId, subjectId);
  if (facts.length === 0) return { setUp: false };
  const { units, counts } = gapStates(facts);
  return { setUp: true, units, counts, total: units.length };
}

// The screen: the person's classes, the school's subjects, and the chosen class and subject's gaps. A class or a
// subject asked for that is not this person's to read is "not found", so it says nothing about what exists.
export async function gapScreen(db: Sql, actor: Actor, ask: { classId?: unknown; subjectId?: unknown }): Promise<GapAnswer> {
  if (!GAP_READERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const wholeSchool = WHOLE_SCHOOL.includes(actor.role);
  const classes = (
    await db.query(
      `select class_id, name, section from classes
        where school_id = $1 and ($2::boolean or class_id = any (public.teacher_own_class_ids()))
        order by name, section nulls first, class_id`,
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

  const gap = classId && subjectId ? await classGap(db, classId, subjectId) : null;
  return { ok: true, screen: { wholeSchool, classes, subjects, classId, subjectId, gap } };
}
