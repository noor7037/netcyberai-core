import type { Sql } from '@/lib/jobs/types';
import { EXAM_READERS, papersOf, type Actor } from './exams';
import { grade, percent, roundPercent, type MarkPart, type NoGradeReason } from './grading';
import { markParts, ON_ROLL, ROLL_ORDER, type Mark, type MarkKind, type PaperComponent } from './papers';
import { publicationInForce } from './publish';
import type { GradingScheme } from './scheme';
import { schemeInForce } from './schemes';

// The class result of an exam (docs/27 row 9b, C214): each child of the class, in roll order, with their marks in
// every paper, and the percent and grade of each subject and of all of them, by the grading scheme in force. The
// percent is percent() and the grade grade() (src/lib/exams/grading.ts): absent and exempt are not marks and are
// left out. A paper on which a child still has a component with nothing entered has no percent yet ("not entered"),
// and nor has their overall: a percent of half the marks would read as a result. Children are never sorted by
// marks, and no rank or position is worked out (docs/27 section 3 rule 2).

export type Shown = { percent: number | null; rounded: number | null; grade: { kind: 'grade'; grade: string; meaning: string | null } | { kind: 'no_grade'; reason: NoGradeReason | 'no_scheme' | 'not_entered' } };
const NOT_ENTERED: Shown = { percent: null, rounded: null, grade: { kind: 'no_grade', reason: 'not_entered' } };
export type ResultPaper = { paperId: string; subjectName: string; date: string | null; components: PaperComponent[] };
export type ResultChild = { studentId: string; name: string; rollNo: string | null; papers: (Shown & { marks: Record<string, Mark> })[]; overall: Shown };
export type ClassResult = {
  exam: { examId: string; name: string; term: string | null; status: 'open' | 'published' };
  classId: string;
  className: string;
  papers: ResultPaper[];
  scheme: { version: number; decimals: 0 | 1 } | null;
  publication: { version: number } | null; // published for this class (C215): graded by the scheme kept with it
  children: ResultChild[];
  notShown: number;
};

// A percent and its grade, as every screen says them.
export function shown(parts: readonly MarkPart[], scheme: Pick<GradingScheme, 'bands' | 'decimals'> | null): Shown {
  const p = percent(parts);
  if (!scheme) return { percent: p, rounded: p === null ? null : roundPercent(p, 1), grade: { kind: 'no_grade', reason: p === null ? 'no_marks' : 'no_scheme' } };
  const g = grade(p, scheme);
  return { percent: p, rounded: g.rounded, grade: g.kind === 'grade' ? { kind: 'grade', grade: g.grade, meaning: g.meaning } : { kind: 'no_grade', reason: g.reason } };
}

// One child's result, from their marks in each paper. Pure: the same marks and scheme give the same result.
export function childResult(papers: readonly ResultPaper[], marks: readonly Readonly<Record<string, Mark>>[], scheme: Pick<GradingScheme, 'bands' | 'decimals'> | null): Pick<ResultChild, 'papers' | 'overall'> {
  const all: MarkPart[] = [];
  let complete = true;
  const each = papers.map((p, i) => {
    const own = marks[i] ?? {};
    if (!p.components.every((c) => own[c.key])) {
      complete = false;
      return { ...NOT_ENTERED, marks: { ...own } };
    }
    const parts = markParts(p.components, own);
    all.push(...parts);
    return { ...shown(parts, scheme), marks: { ...own } };
  });
  return { papers: each, overall: complete ? shown(all, scheme) : NOT_ENTERED };
}

export async function classResult(db: Sql, actor: Actor, examId: string, classId: string): Promise<ClassResult | null> {
  if (!EXAM_READERS.includes(actor.role)) return null;
  const exam = (await db.query(`select exam_id, name, term, status from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
  if (!exam) return null;
  const papers = (await papersOf(db, actor.schoolId, [examId])).filter((p) => p.classId === classId);
  if (!papers.length) return null;
  const roll = (await db.query(
    `select s.student_id, s.name, s.roll_no from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} order by ${ROLL_ORDER}`,
    [actor.schoolId, classId]
  )).rows;
  const rows = (await db.query(
    `select paper_id, student_id, component, kind, score from marks where school_id = $1 and paper_id = any ($2::uuid[])`,
    [actor.schoolId, papers.map((p) => p.paperId)]
  )).rows;
  const found = new Map<string, Record<string, Mark>>();
  for (const r of rows) {
    const key = `${r.paper_id}|${r.student_id}`;
    const m = found.get(key) ?? {};
    m[r.component] = { kind: r.kind as MarkKind, score: r.score === null ? null : Number(r.score) };
    found.set(key, m);
  }
  // A published class keeps the scheme it was published with (C215): a later change of the scheme never rewrites it.
  const kept = await publicationInForce(db, actor.schoolId, examId, classId);
  const current = kept ? { version: kept.schemeVersion, scheme: kept.scheme } : await schemeInForce(db, actor.schoolId);
  const scheme = current?.scheme ?? null;
  const resultPapers: ResultPaper[] = papers.map((p) => ({ paperId: p.paperId, subjectName: p.subjectName, date: p.date, components: p.components }));
  return {
    exam: { examId: exam.exam_id, name: exam.name, term: exam.term ?? null, status: exam.status },
    classId,
    className: papers[0].className,
    papers: resultPapers,
    scheme: current ? { version: current.version, decimals: current.scheme.decimals } : null,
    publication: kept ? { version: kept.version } : null,
    children: roll.map((s) => ({
      studentId: s.student_id,
      name: s.name,
      rollNo: s.roll_no ?? null,
      ...childResult(resultPapers, papers.map((p) => found.get(`${p.paperId}|${s.student_id}`) ?? {}), scheme),
    })),
    notShown: Math.max(0, papers[0].roll - roll.length),
  };
}
