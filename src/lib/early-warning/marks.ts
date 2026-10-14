import type { PoolClient } from 'pg';
import { passed, percent } from '@/lib/exams/grading';
import type { Mark, MarkKind, PaperComponent } from '@/lib/exams/papers';
import { childResult, type ResultPaper } from '@/lib/exams/results';
import type { GradingScheme } from '@/lib/exams/scheme';
import { schemeInForce } from '@/lib/exams/schemes';
import { classLabel } from '@/lib/frameworks/class-label';
import type { BelowPass, MarksEvidence, MarksExam, MarksSettings } from './rules';

// Early Warning v2: the marks signal (docs/27 row 9f, C218). Rules only: no language model.
//
//   - WHICH EXAMS COUNT. An exam counts for a class once it is published for that class, and only while a
//     publication of it is in force (exam_publications, not reopened: docs/27, C219). A class is published only when
//     every paper of it is entered, and its marks are frozen while it stays published; a class the principal has
//     reopened to correct a mark is left out until it is published again.
//   - A CHILD'S EXAMS are those counted exams in which they have at least one mark that is a score: an exam they
//     were absent or exempt from throughout gives them no percent, and is not a result. Their LATEST is the one sat
//     last: the latest date of its papers for that class, or, where no paper is dated, India's day the office made
//     it; then when it was made (exams.created_at, which never changes), then its id. Their PREVIOUS is the one
//     before it. An exam made early for later in the year is not taken for the latest, and a correction made later
//     to an old exam's marks does not make it the latest either.
//   - THE PERCENTS are the class result's own: childResult and percent() of src/lib/exams, rounded as the grading
//     scheme in force rounds them (one decimal place without a scheme). Absent and exempt are not marks and are
//     left out, never counted as zero. The scheme in force is the one the class result uses; the report-card slice
//     keeps the scheme an exam was published with.
//   - THE SIGNAL: the child's percent in their latest exam fell by at least the school's number of points against
//     their own previous exam; or, in that exam, they are below the scheme's pass mark (passed(): the subject's, and
//     a part's where the scheme sets one) in at least the school's number of subjects. A child is compared only with
//     themselves: never with another child, a class average or a rank.
//   - "CANNOT BE JUDGED" SAYS NOTHING. A first exam has no fall to measure; a school with no scheme, or a scheme with
//     no pass mark, has no pass mark to be below. Neither is a reason, and neither is an all-clear for the other part.
//   - Fees are never read here, and nothing here reaches a parent.

// One child's marks in one exam: the papers of that exam for the class the child sat it in, and their own marks on
// each, by component.
export type ChildExam = { examId: string; name: string; className: string; papers: (ResultPaper & { marks: Readonly<Record<string, Mark>> })[] };
type Scheme = { version: number; scheme: Pick<GradingScheme, 'bands' | 'decimals' | 'passMark' | 'components'> };

const tenth = (n: number) => Math.round(n * 10) / 10;

// What one exam says, by the class result's own rule: the whole percent and each paper's, as shown. Null when the
// child has no percent in it (a component with nothing entered, or no score at all).
function summarise(exam: ChildExam, scheme: Scheme['scheme'] | null): (MarksExam & { results: ReturnType<typeof childResult>['papers'] }) | null {
  const result = childResult(exam.papers, exam.papers.map((p) => p.marks), scheme);
  if (result.overall.rounded === null) return null;
  return {
    examId: exam.examId,
    name: exam.name,
    className: exam.className,
    percent: result.overall.rounded,
    papers: exam.papers.map((p, i) => ({ paperId: p.paperId, subject: p.subjectName, percent: result.papers[i].rounded })),
    results: result.papers,
  };
}

// The subjects of an exam (and their parts, where the scheme gives a part its own pass mark) below the pass mark,
// by passed(). A paper with no mark (absent or exempt throughout) is not below anything.
function belowPassMark(exam: ChildExam, results: ReturnType<typeof childResult>['papers'], scheme: Scheme['scheme']): BelowPass[] {
  const below: BelowPass[] = [];
  exam.papers.forEach((p, i) => {
    const components: Record<string, number | null> = {};
    for (const c of p.components) {
      const m = p.marks[c.key];
      components[c.key] = m ? percent([{ score: m.kind === 'score' ? m.score : null, max: c.max, absent: m.kind === 'absent', exempt: m.kind === 'exempt' }]) : null;
    }
    const pass = passed({ percent: results[i].percent, components }, scheme);
    if (pass.kind !== 'not_passed') return;
    for (const b of pass.below) {
      const part = b.key === null ? null : (p.components.find((c: PaperComponent) => c.key === b.key)?.name ?? scheme.components.find((c) => c.key === b.key)?.name ?? b.key);
      below.push({ paperId: p.paperId, subject: p.subjectName, part, percent: b.rounded, passMark: b.passMark });
    }
  });
  return below;
}

// The rule, with no database: what a child's latest exam and their own exam before it say. Null when marks are no
// reason to look (or cannot be judged at all).
export function readMarks(latest: ChildExam | null, previous: ChildExam | null, scheme: Scheme | null, settings: MarksSettings): MarksEvidence | null {
  if (!latest) return null;
  const now = summarise(latest, scheme?.scheme ?? null);
  if (!now) return null;
  const before = previous ? summarise(previous, scheme?.scheme ?? null) : null;
  // The fall, between the two percents as they are shown, to one decimal place.
  const by = before ? tenth(before.percent - now.percent) : null;
  const fell = by !== null && by >= settings.marksDropPoints ? { by, points: settings.marksDropPoints } : null;
  const below = scheme ? belowPassMark(latest, now.results, scheme.scheme) : [];
  const subjects = new Set(below.map((b) => b.paperId)).size;
  const belowPass = subjects >= settings.marksBelowPassSubjects ? { subjects: below, atLeast: settings.marksBelowPassSubjects } : null;
  if (!fell && !belowPass) return null;
  const plain = (e: NonNullable<typeof now>): MarksExam => ({ examId: e.examId, name: e.name, className: e.className, percent: e.percent, papers: e.papers });
  return { exam: plain(now), previous: before ? plain(before) : null, fell, belowPass, scheme: scheme?.version ?? null };
}

// The marks signal for the students looked at (active, in a class), read under the caller's own row level security:
// the office and the academic coordinator read every mark, and the nightly check runs as the office.
export async function findMarks(db: Pick<PoolClient, 'query'>, schoolId: string, studentIds: readonly string[], settings: MarksSettings): Promise<Map<string, MarksEvidence>> {
  const found = new Map<string, MarksEvidence>();
  if (!studentIds.length) return found;
  // Each child's two latest counted exams with a score, one class an exam (the class they are in now first).
  const { rows: taken } = await db.query(
    `with counted as (
       select p.exam_id, p.class_id, max(p.paper_date) as held
         from exam_papers p
         join exam_publications x on x.school_id = p.school_id and x.exam_id = p.exam_id and x.class_id = p.class_id and x.reopened_at is null
        where p.school_id = $1
        group by p.exam_id, p.class_id
     ), sat as (
       select distinct on (m.student_id, c.exam_id) m.student_id, c.exam_id, c.class_id, e.created_at,
              coalesce(c.held, (e.created_at at time zone 'Asia/Kolkata')::date) as held
         from counted c
         join exams e on e.school_id = $1 and e.exam_id = c.exam_id
         join exam_papers p on p.school_id = $1 and p.exam_id = c.exam_id and p.class_id = c.class_id
         join marks m on m.school_id = $1 and m.paper_id = p.paper_id and m.kind = 'score'
         join students s on s.school_id = $1 and s.student_id = m.student_id
        where m.student_id = any ($2::uuid[])
        order by m.student_id, c.exam_id, (c.class_id = s.class_id) desc, c.class_id
     )
     select student_id, exam_id, class_id, n
       from (select sat.*, row_number() over (partition by student_id order by held desc, created_at desc, exam_id desc) as n from sat) r
      where n <= 2`,
    [schoolId, [...studentIds]]
  );
  if (!taken.length) return found;
  const pairs = [...new Map(taken.map((t) => [`${t.exam_id}|${t.class_id}`, { exam: t.exam_id as string, cls: t.class_id as string }])).values()];
  const { rows: paperRows } = await db.query(
    `select p.paper_id, p.exam_id, p.class_id, p.paper_date::text as paper_date, p.components, e.name as exam_name, c.name as class_name, c.section, sb.name as subject_name
       from exam_papers p
       join unnest($2::uuid[], $3::uuid[]) as x(exam_id, class_id) on x.exam_id = p.exam_id and x.class_id = p.class_id
       join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
       join classes c on c.school_id = p.school_id and c.class_id = p.class_id
       join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
      where p.school_id = $1
      order by sb.name, p.paper_id`,
    [schoolId, pairs.map((p) => p.exam), pairs.map((p) => p.cls)]
  );
  const { rows: markRows } = await db.query(
    `select paper_id, student_id, component, kind, score from marks where school_id = $1 and paper_id = any ($2::uuid[]) and student_id = any ($3::uuid[])`,
    [schoolId, paperRows.map((p) => p.paper_id), [...new Set(taken.map((t) => t.student_id as string))]]
  );
  const marksOf = new Map<string, Record<string, Mark>>();
  for (const r of markRows) {
    const key = `${r.paper_id}|${r.student_id}`;
    const m = marksOf.get(key) ?? {};
    m[r.component] = { kind: r.kind as MarkKind, score: r.score === null ? null : Number(r.score) };
    marksOf.set(key, m);
  }
  const current = await schemeInForce(db, schoolId);
  const scheme: Scheme | null = current ? { version: current.version, scheme: current.scheme } : null;
  const examOf = (studentId: string, examId: string, classId: string): ChildExam => {
    const papers = paperRows.filter((p) => p.exam_id === examId && p.class_id === classId);
    return {
      examId,
      name: papers[0]?.exam_name ?? '',
      className: classLabel(papers[0]?.class_name, papers[0]?.section) ?? '',
      papers: papers.map((p) => ({ paperId: p.paper_id, subjectName: p.subject_name, date: p.paper_date ?? null, components: p.components as PaperComponent[], marks: marksOf.get(`${p.paper_id}|${studentId}`) ?? {} })),
    };
  };
  const byChild = new Map<string, { latest?: ChildExam; previous?: ChildExam }>();
  for (const t of taken) {
    const mine = byChild.get(t.student_id) ?? {};
    mine[Number(t.n) === 1 ? 'latest' : 'previous'] = examOf(t.student_id, t.exam_id, t.class_id);
    byChild.set(t.student_id, mine);
  }
  for (const [studentId, mine] of byChild) {
    const evidence = readMarks(mine.latest ?? null, mine.previous ?? null, scheme, settings);
    if (evidence) found.set(studentId, evidence);
  }
  return found;
}
