import { OTHER_EXAM_TYPE } from '@/lib/contracts/exam-types';
import type { Sql } from '@/lib/jobs/types';
import { examTypesOf } from './exam-types';
import { EXAM_READERS, papersOf, type Actor } from './exams';
import { grade, percent, roundPercent, weightedPercent, type MarkPart, type NoGradeReason, type TypePercent } from './grading';
import { markParts, ON_ROLL, ROLL_ORDER, type Mark, type MarkKind, type PaperComponent } from './papers';
import { publicationInForce } from './publish';
import type { ExamTypeWeight, GradingScheme } from './scheme';
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
// `weighted` is there only when the scheme counts exam types (C230-AJ part 2) and this exam is of one of them.
export type ResultChild = { studentId: string; name: string; rollNo: string | null; papers: (Shown & { marks: Record<string, Mark> })[]; overall: Shown; weighted?: WeightedChild };
export type ClassResult = {
  exam: { examId: string; name: string; term: string | null; status: 'open' | 'published' };
  classId: string;
  className: string;
  papers: ResultPaper[];
  scheme: { version: number; decimals: 0 | 1 } | null;
  publication: { version: number } | null; // published for this class (C215): graded by the scheme kept with it
  children: ResultChild[];
  notShown: number;
  weighted?: WeightedMeta;
};

// A percent and its grade, as every screen says them.
export function shown(parts: readonly MarkPart[], scheme: Pick<GradingScheme, 'bands' | 'decimals'> | null): Shown {
  return shownPercent(percent(parts), scheme);
}

export function shownPercent(p: number | null, scheme: Pick<GradingScheme, 'bands' | 'decimals'> | null): Shown {
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

// ---- exam types that count together (C230-AJ part 2, C357) --------------------------------------------------------
// When the scheme names the exam types that count toward a report card and their weights, a child's result in a subject
// (and overall) across the class's exams of those types in the session is the weighted mean of their percent in each
// type: percent() over the marks of every paper of that type (marks over maximum, all its exams together), then
// weightedPercent(). A type with no complete paper for the child leaves the result unknown ("not entered"), never a
// mean of some of the weights. Children are never sorted or compared (docs/27 section 3 rule 2).

export type WeightedPaper = ResultPaper & { subjectId: string; examType: string };
export type WeightedSubject = { subjectId: string; subjectName: string; types: TypePercent[]; result: Shown };
export type WeightedChild = { subjects: WeightedSubject[]; types: TypePercent[]; overall: Shown };
export type WeightedMeta = { weights: ExamTypeWeight[]; exams: { examId: string; name: string; examType: string }[] };

// One child's weighted result. Pure: the same marks, weights and scheme give the same result.
export function weightedChildResult(
  papers: readonly WeightedPaper[],
  marks: readonly Readonly<Record<string, Mark>>[],
  weights: readonly ExamTypeWeight[],
  scheme: Pick<GradingScheme, 'bands' | 'decimals'> | null
): WeightedChild {
  // A paper's parts once every component has an entry; none before.
  const parts = papers.map((p, i) => {
    const own = marks[i] ?? {};
    return p.components.every((c) => own[c.key]) ? markParts(p.components, own) : null;
  });
  const typePercents = (of: readonly number[]): TypePercent[] =>
    weights.map((w) => {
      const mine = of.filter((i) => papers[i].examType === w.type);
      return { type: w.type, percent: mine.length === 0 || mine.some((i) => parts[i] === null) ? null : percent(mine.flatMap((i) => parts[i] as MarkPart[])) };
    });
  const verdict = (types: TypePercent[]): Shown => {
    const p = weightedPercent(types, weights);
    return p === null ? NOT_ENTERED : shownPercent(p, scheme);
  };
  const subjects: WeightedSubject[] = [];
  for (const [i, p] of papers.entries()) {
    if (subjects.some((x) => x.subjectId === p.subjectId)) continue;
    const types = typePercents(papers.flatMap((q, j) => (q.subjectId === p.subjectId ? [j] : [])));
    subjects.push({ subjectId: p.subjectId, subjectName: papers[i].subjectName, types, result: verdict(types) });
  }
  const types = typePercents(papers.map((_, i) => i));
  return { subjects, types, overall: verdict(types) };
}

// The weighted result of the students of a class, from the class's exams in a session that are of the types the scheme
// counts. Null when the scheme counts no type, or when `ownType` (the type of the exam being read) is not one of them:
// the result belongs to the exams that count. `publishedOnly`: only the exams published for the class (in force), which
// is what a report card rests on. An exam's type is its own while the school still has it in its list, else "other"
// (as examTypeName reads it).
export async function weightedForClass(
  db: Sql,
  schoolId: string,
  o: { classId: string; sessionId: string | null; ownType: string | null; scheme: Pick<GradingScheme, 'bands' | 'decimals'> & { examTypes?: ExamTypeWeight[] }; studentIds: readonly string[]; publishedOnly: boolean }
): Promise<{ meta: WeightedMeta; byStudent: Map<string, WeightedChild> } | null> {
  const weights = o.scheme.examTypes ?? [];
  if (!weights.length) return null;
  const known = new Set((await examTypesOf(db, schoolId)).map((t) => t.key));
  const typeOf = (key: string | null) => (key && known.has(key) ? key : OTHER_EXAM_TYPE);
  const counted = new Set(weights.map((w) => w.type));
  if (!counted.has(typeOf(o.ownType))) return null;
  const exams = (await db.query(
    `select e.exam_id, e.name, e.exam_type
       from exams e
      where e.school_id = $1 and e.session_id is not distinct from $2::uuid
        and exists (select 1 from exam_papers p where p.school_id = e.school_id and p.exam_id = e.exam_id and p.class_id = $3)
        and ($4::boolean is false or exists (select 1 from exam_publications x where x.school_id = e.school_id and x.exam_id = e.exam_id and x.class_id = $3 and x.reopened_at is null))
      order by e.created_at, e.exam_id`,
    [schoolId, o.sessionId, o.classId, o.publishedOnly]
  )).rows
    .map((r) => ({ examId: r.exam_id as string, name: r.name as string, examType: typeOf((r.exam_type as string | null) ?? null) }))
    .filter((e) => counted.has(e.examType));
  const papers = (await papersOf(db, schoolId, exams.map((e) => e.examId))).filter((p) => p.classId === o.classId);
  const typeOfExam = new Map(exams.map((e) => [e.examId, e.examType]));
  const weightedPapers: WeightedPaper[] = papers.map((p) => ({ paperId: p.paperId, subjectId: p.subjectId, subjectName: p.subjectName, date: p.date, components: p.components, examType: typeOfExam.get(p.examId) as string }));
  const found = new Map<string, Record<string, Mark>>();
  if (papers.length && o.studentIds.length) {
    const rows = (await db.query(
      `select paper_id, student_id, component, kind, score from marks where school_id = $1 and paper_id = any ($2::uuid[]) and student_id = any ($3::uuid[])`,
      [schoolId, papers.map((p) => p.paperId), [...o.studentIds]]
    )).rows;
    for (const r of rows) {
      const key = `${r.paper_id}|${r.student_id}`;
      const m = found.get(key) ?? {};
      m[r.component] = { kind: r.kind as MarkKind, score: r.score === null ? null : Number(r.score) };
      found.set(key, m);
    }
  }
  const byStudent = new Map<string, WeightedChild>();
  for (const id of o.studentIds) byStudent.set(id, weightedChildResult(weightedPapers, weightedPapers.map((p) => found.get(`${p.paperId}|${id}`) ?? {}), weights, o.scheme));
  return { meta: { weights: weights.map((w) => ({ ...w })), exams }, byStudent };
}

export async function classResult(db: Sql, actor: Actor, examId: string, classId: string): Promise<ClassResult | null> {
  if (!EXAM_READERS.includes(actor.role)) return null;
  const exam = (await db.query(`select exam_id, name, term, status, session_id, exam_type from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
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
  // Exam types that count together (C230-AJ part 2): only when the scheme sets weights; otherwise nothing is added.
  const weighted = scheme
    ? await weightedForClass(db, actor.schoolId, { classId, sessionId: exam.session_id ?? null, ownType: exam.exam_type ?? null, scheme, studentIds: roll.map((s) => s.student_id as string), publishedOnly: false })
    : null;
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
      ...(weighted ? { weighted: weighted.byStudent.get(s.student_id) } : {}),
    })),
    notShown: Math.max(0, papers[0].roll - roll.length),
    ...(weighted ? { weighted: weighted.meta } : {}),
  };
}
