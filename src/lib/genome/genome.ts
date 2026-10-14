import type { SchoolRole } from '@/lib/contracts/modules';
import { windowFrom } from '@/lib/early-warning/early-warning';
import { markParts, ON_ROLL, ROLL_ORDER, type Mark, type MarkKind, type PaperComponent } from '@/lib/exams/papers';
import { shown } from '@/lib/exams/results';
import { schemeInForce } from '@/lib/exams/schemes';
import type { MarkPart } from '@/lib/exams/grading';
import { classLabel } from '@/lib/frameworks/class-label';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { DEFAULT_GENOME_SETTINGS, findings, GENOME_READERS, type ChapterGenome, type ExamOverall, type ExamPoint, type Genome, type GenomeSettings, type SubjectGenome } from './rules';

// Learning Genome v1 (docs/27 row 9e, C217): one child's genome, worked out when it is read, from the rows the
// person reading may see. Nothing is stored and nothing is written.
//
//   - EXAMS: per subject, the child's own percent in each exam, by percent() and grade() through the class result's
//     own shown() (src/lib/exams/results.ts), so the genome and the class result never disagree about a paper.
//     Which exams count: those whose paper of the child's class and subject is recorded as entered (COUNTED_PAPER).
//     Report cards and publishing (slice 9c, C215) change this to the published exams; until then an entered paper
//     is the nearest thing to a result, and the screen says "marks entered".
//   - HOMEWORK: per subject, the child's homework_status rows (done or not) for homework due in the days looked back.
//   - CHAPTERS: per chapter of a class's syllabus map, the parents' Daily Pulse replies about this child, "needs help"
//     (tier 2) and "understood" (tier 1), to the lessons of its taught units: pulse_response_log →
//     pulse_messages.source_progress_id → syllabus_progress.unit_id → syllabus_units.chapter, for lessons taught in
//     the days looked back.
//   - Strengths and gaps by the rules of ./rules.ts, against the school's own settings. The child is compared only
//     with themselves.
//   - EVERY READ IS UNDER THE READER'S OWN ROW LEVEL SECURITY, in their own tenant transaction: a teacher reads the
//     children of their own classes (students, marks, exam papers, homework and the Pulse are each scoped by the
//     database), the office and the academic coordinator every class, the accountant nothing (refused here, and the
//     database gives an accountant no mark and no homework). The app also asks, for a teacher, that the child is in
//     one of their own classes: both say the same.
//   - Rules only: no language model is called. Nothing here reaches a parent.

export type Actor = { schoolId: string; userId: string; role: SchoolRole };

// The papers that count, as SQL on exam_papers p. Slice 9c (C215) replaces this with the exam's publication for the
// class; the genome reads nothing else about it.
export const COUNTED_PAPER = `p.entered_by is not null`;

// The school's lines: its own settings, or the schema's defaults. The settings engine takes any number between a
// field's minimum and maximum: points and "in every 100" keep a decimal a school typed; a count of replies, of
// homeworks or of days is a whole number, so its decimal is cut, as Early Warning cuts its own. A stored value the
// schema would refuse is not used.
export async function genomeSettings(db: Sql, schoolId: string): Promise<GenomeSettings> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'learning-genome');
  if (!schema) return DEFAULT_GENOME_SETTINGS;
  const set = (await readSettings(db, schoolId, schema)).effective;
  const num = (key: string, fallback: number, whole: boolean) => {
    const def = schema.fields.find((f) => f.key === key);
    const v = set[key];
    if (!def || typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    if ((typeof def.min === 'number' && v < def.min) || (typeof def.max === 'number' && v > def.max)) return fallback;
    return whole ? Math.floor(v) : v;
  };
  const d = DEFAULT_GENOME_SETTINGS;
  return {
    trendPoints: num('trend_points', d.trendPoints, false),
    spreadPoints: num('spread_points', d.spreadPoints, false),
    needsHelpReplies: num('needs_help_replies', d.needsHelpReplies, true),
    understoodReplies: num('understood_replies', d.understoodReplies, true),
    homeworkDoneBelow: num('homework_done_below', d.homeworkDoneBelow, false),
    homeworkMinChecked: num('homework_min_checked', d.homeworkMinChecked, true),
    windowDays: num('window_days', d.windowDays, true),
  };
}

// For a teacher: only their own classes (teacher_own_class_ids(), the rule the database holds on students). As SQL,
// with the role's flag as the parameter numbered `n`.
const OWN_CLASS = (column: string, n: number) => `($${n}::boolean is false or ${column} = any (public.teacher_own_class_ids()))`;

export type GenomePicker = {
  role: SchoolRole;
  classes: { classId: string; name: string }[];
  classId: string | null;
  // The children on the chosen class's roll, in roll order (never by marks). Null until a class is chosen.
  children: { studentId: string; name: string; rollNo: string | null }[] | null;
};

// The classes this person may open, and (with a class) the children on its roll. Null: this role does not open the
// genome. 'not_found': a class that is not one this person may open.
export async function genomePicker(db: Sql, actor: Actor, classId: string | null): Promise<GenomePicker | 'not_found' | null> {
  if (!GENOME_READERS.includes(actor.role)) return null;
  const own = actor.role === 'teacher';
  const classes = (await db.query(
    `select c.class_id, c.name, c.section from classes c where c.school_id = $1 and ${OWN_CLASS('c.class_id', 2)} order by c.name, c.section nulls first, c.class_id`,
    [actor.schoolId, own]
  )).rows.map((r) => ({ classId: r.class_id as string, name: classLabel(r.name, r.section) ?? '' }));
  if (classId === null) return { role: actor.role, classes, classId: null, children: null };
  if (!classes.some((c) => c.classId === classId)) return 'not_found';
  const children = (await db.query(
    `select s.student_id, s.name, s.roll_no from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} order by ${ROLL_ORDER}`,
    [actor.schoolId, classId]
  )).rows.map((r) => ({ studentId: r.student_id as string, name: r.name as string, rollNo: (r.roll_no as string | null) ?? null }));
  return { role: actor.role, classes, classId, children };
}

// One child's genome. Null: this role does not open it, or the child is not one this person may read (another
// class's child for a teacher, another school's, not on a roll): the same answer, so nothing says the child exists.
export async function childGenome(db: Sql, actor: Actor, studentId: string, today: string = indiaDate()): Promise<Genome | null> {
  if (!GENOME_READERS.includes(actor.role)) return null;
  const own = actor.role === 'teacher';
  const child = (await db.query(
    `select s.student_id, s.name, s.roll_no, s.class_id, c.name as class_name, c.section
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      where s.school_id = $1 and s.student_id = $2 and ${ON_ROLL} and ${OWN_CLASS('s.class_id', 3)}`,
    [actor.schoolId, studentId, own]
  )).rows[0];
  if (!child) return null;
  const settings = await genomeSettings(db, actor.schoolId);
  const from = windowFrom(today, settings.windowDays);
  const scheme = await schemeInForce(db, actor.schoolId);

  // Exams: the child's own marks in the papers that count, oldest first (the paper's date, or the day the exam was
  // made when the paper has none).
  const markRows = (await db.query(
    `select p.paper_id, p.exam_id, e.name as exam_name, e.term, p.paper_date::text as paper_date, p.class_id, c.name as class_name, c.section,
            p.subject_id, sb.name as subject_name, p.components, m.component, m.kind, m.score
       from marks m
       join exam_papers p on p.school_id = m.school_id and p.paper_id = m.paper_id
       join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
       join classes c on c.school_id = p.school_id and c.class_id = p.class_id
       join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
      where m.school_id = $1 and m.student_id = $2 and ${COUNTED_PAPER}
      order by coalesce(p.paper_date, (e.created_at at time zone 'Asia/Kolkata')::date), e.created_at, e.exam_id, p.paper_id, m.component`,
    [actor.schoolId, studentId]
  )).rows;
  const points = new Map<string, ExamPoint & { subjectId: string; subjectName: string }>();
  for (const r of markRows) {
    let p = points.get(r.paper_id);
    if (!p) {
      p = {
        paperId: r.paper_id,
        examId: r.exam_id,
        examName: r.exam_name,
        term: r.term ?? null,
        date: r.paper_date ?? null,
        className: classLabel(r.class_name, r.section) ?? '',
        components: r.components as PaperComponent[],
        marks: {},
        shown: shown([], null),
        subjectId: r.subject_id,
        subjectName: r.subject_name,
      };
      points.set(r.paper_id, p);
    }
    p.marks[r.component] = { kind: r.kind as MarkKind, score: r.score === null ? null : Number(r.score) } satisfies Mark;
  }
  // Each paper's percent and grade, as the class result works them out: a part with nothing entered leaves the paper
  // without a percent. The parts of every complete paper make the child's overall in its exam.
  const examParts = new Map<string, { examName: string; parts: MarkPart[]; subjects: number; last: number }>();
  let order = 0;
  for (const p of points.values()) {
    order += 1;
    const complete = p.components.every((c) => p.marks[c.key]);
    const parts = complete ? markParts(p.components, p.marks) : [];
    p.shown = complete ? shown(parts, scheme?.scheme ?? null) : { percent: null, rounded: null, grade: { kind: 'no_grade', reason: 'not_entered' } };
    const e = examParts.get(p.examId) ?? { examName: p.examName, parts: [], subjects: 0, last: 0 };
    e.parts.push(...parts);
    if (p.shown.rounded !== null) e.subjects += 1;
    e.last = order;
    examParts.set(p.examId, e);
  }
  // The latest exam in which the child has a percent in two subjects or more: what "their own overall" is.
  let latestOverall: ExamOverall | null = null;
  let latestAt = 0;
  for (const [examId, e] of examParts) {
    if (e.subjects < 2 || e.last < latestAt) continue;
    latestAt = e.last;
    latestOverall = { examId, examName: e.examName, shown: shown(e.parts, scheme?.scheme ?? null), subjects: e.subjects };
  }

  // Homework: what was checked for the child, by subject, for homework due in the days looked back.
  const homeworkRows = (await db.query(
    `select h.subject_id, sb.name as subject_name, count(*)::int as checked, (count(*) filter (where st.done))::int as done,
            min(t.due_date)::text as first_due, max(t.due_date)::text as last_due
       from homework_status st
       join homework_targets t on t.school_id = st.school_id and t.target_id = st.target_id
       join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id
       join subjects sb on sb.school_id = h.school_id and sb.subject_id = h.subject_id
      where st.school_id = $1 and st.student_id = $2 and t.due_date between $3::date and $4::date
      group by h.subject_id, sb.name`,
    [actor.schoolId, studentId, from, today]
  )).rows;

  // Chapters: the parents' replies about this child to the lessons of each chapter's taught units, in the days looked back.
  const chapterRows = (await db.query(
    `select class_id, class_name, section, subject_id, subject_name, chapter, needs_help, understood, lessons,
            first_taught::text as first_taught, last_taught::text as last_taught
       from public.genome_chapter_replies($1, $2::date, $3::date)
      order by subject_name, subject_id, class_name, section nulls first, class_id, first_place, chapter`,
    [studentId, from, today]
  )).rows;
  const chapters: ChapterGenome[] = chapterRows.map((r) => ({
    classId: r.class_id,
    className: classLabel(r.class_name, r.section) ?? '',
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    chapter: r.chapter,
    needsHelp: Number(r.needs_help),
    understood: Number(r.understood),
    lessons: Number(r.lessons),
    firstTaught: r.first_taught,
    lastTaught: r.last_taught,
  }));

  // One entry a subject that has an exam or homework, by name.
  const subjects = new Map<string, SubjectGenome>();
  const subjectOf = (subjectId: string, subjectName: string) => {
    const s = subjects.get(subjectId) ?? { subjectId, subjectName, exams: [], homework: { done: 0, checked: 0, firstDue: null, lastDue: null } };
    subjects.set(subjectId, s);
    return s;
  };
  for (const p of points.values()) {
    const { subjectId, subjectName, ...point } = p;
    subjectOf(subjectId, subjectName).exams.push(point);
  }
  for (const r of homeworkRows) subjectOf(r.subject_id, r.subject_name).homework = { done: Number(r.done), checked: Number(r.checked), firstDue: r.first_due, lastDue: r.last_due };
  const list = [...subjects.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.subjectId.localeCompare(b.subjectId));

  return {
    child: { studentId: child.student_id, name: child.name, rollNo: child.roll_no ?? null, classId: child.class_id ?? null, className: classLabel(child.class_name, child.section) },
    today,
    window: { from, to: today },
    settings,
    scheme: scheme ? { version: scheme.version } : null,
    subjects: list,
    chapters,
    latestOverall,
    ...findings(list, chapters, latestOverall, settings),
  };
}
