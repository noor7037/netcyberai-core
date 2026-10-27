import { isUuid } from '@/lib/frameworks/custom-fields';
import { planHasFeature } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import { coAreasOf, coScholasticOf } from './co-scholastic';
import { papersOf, type Actor } from './exams';
import { ON_ROLL, ROLL_ORDER, type Mark, type MarkKind, type PaperComponent } from './papers';
import { publicationInForce, REPORT_CARD_OFFICE } from './publish';
import { childResult, weightedForClass, type ResultPaper, type Shown, type WeightedChild, type WeightedMeta } from './results';
import type { Layout } from './scheme';
import { weightedNamesOf, type WeightedNames } from './weighted-view';

// A report card (docs/27 row 9c, C215): one child's marks in an exam as published for their class, laid out as the
// grading scheme kept with the publication says (its layout: components, total, percent, grade, attendance,
// remarks, co-scholastic areas). Every percent and grade is percent() and grade() by that kept scheme (childResult in
// results.ts), so a later change of the scheme never rewrites a card. Attendance is the one kept with the publication
// (C219): each child's days in the exam's session up to the day it was published, worked out by the database when it
// was published, so a later correction of attendance never changes a card. Co-scholastic grades are the class's own,
// frozen with its publication. Personal Best and Most Improved are those kept with the publication (each child compared only
// with themselves, own-progress.ts), shown only while the school's plan has the 'personal-best' feature.
// Downloaded by the office (the principal, the school admin, the academic coordinator) and the class teacher, only
// while the class is published. Nothing here names another child on a child's card.

export type CardSubject = { subjectId: string; subjectName: string; components: PaperComponent[]; marks: Record<string, Mark>; total: { score: number; max: number } | null; result: Shown };
export type CardRecognition =
  | { kind: 'first' }
  | { kind: 'shown'; personalBest: { subject: string; now: number; best: number }[]; mostImproved: { subject: string; now: number; before: number; exam: string } | null };
export type ReportCard = {
  studentId: string;
  name: string;
  rollNo: string | null;
  admissionNo: string | null;
  subjects: CardSubject[];
  overall: Shown & { total: { score: number; max: number } | null };
  attendance: { present: number; days: number } | null;
  remark: string | null;
  coScholastic: { area: string; grade: string | null; meaning: string | null }[]; // each area of the kept scheme, in its order
  recognition: CardRecognition | null; // null: the plan does not have the feature, or nothing was kept for this child
  // The result across the exam types the kept scheme counts, by its weights (C230-AJ part 2); there only when the scheme
  // counts exam types and this exam is of one. Worked out from the marks of the class's exams of those types that are
  // published, so a type with none published yet leaves it "not entered".
  weighted?: WeightedChild;
};
export type ReportCardSet = {
  schoolName: string;
  exam: { name: string; term: string | null; session: string | null };
  className: string;
  publication: { version: number; schemeVersion: number; publishedAt: string; publishedBy: string | null };
  layout: Layout;
  decimals: 0 | 1;
  hasSession: boolean;
  columns: { key: string; name: string }[]; // every component of the class's papers, in the order they first appear
  recognitionOn: boolean;
  cards: ReportCard[];
  weighted?: WeightedMeta; // the weights and the exams they were worked out from; with each card's `weighted`
  weightedNames?: WeightedNames; // the counted exam types' names in both languages (there with `weighted`)
};
export type CardsResult = { ok: true; set: ReportCardSet } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_published' };

// The marks a child has that are scores: the total is what they scored of the maximum of those parts. Absent and
// exempt are not marks, so they are left out of both, as from the percent. None until every part has a mark.
function totalOf(components: readonly PaperComponent[], marks: Readonly<Record<string, Mark>>): { score: number; max: number } | null {
  if (!components.every((c) => marks[c.key])) return null;
  const scored = components.filter((c) => marks[c.key].kind === 'score');
  if (!scored.length) return null;
  return { score: Math.round(scored.reduce((s, c) => s + (marks[c.key].score ?? 0), 0) * 10) / 10, max: Math.round(scored.reduce((s, c) => s + c.max, 0) * 10) / 10 };
}

export async function reportCards(db: Sql, actor: Actor, examId: string, classId: string, studentId: string | null): Promise<CardsResult> {
  if (!isUuid(examId) || !isUuid(classId) || (studentId !== null && !isUuid(studentId))) return { ok: false, reason: 'not_found' };
  const office = REPORT_CARD_OFFICE.includes(actor.role);
  const classTeacher = !office && (await db.query(`select public.is_class_teacher_of($1) as yes`, [classId])).rows[0]?.yes === true;
  if (!office && !classTeacher) return { ok: false, reason: 'not_allowed' };
  const exam = (await db.query(
    `select e.name, e.term, e.session_id, e.exam_type, a.label as session, a.start_date::text as session_start, a.end_date::text as session_end
       from exams e left join academic_sessions a on a.school_id = e.school_id and a.session_id = e.session_id
      where e.school_id = $1 and e.exam_id = $2`,
    [actor.schoolId, examId]
  )).rows[0];
  if (!exam) return { ok: false, reason: 'not_found' };
  const papers = (await papersOf(db, actor.schoolId, [examId])).filter((p) => p.classId === classId);
  if (!papers.length) return { ok: false, reason: 'not_found' };
  const kept = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!kept) return { ok: false, reason: 'not_published' };

  const roll = (await db.query(
    `select s.student_id, s.name, s.roll_no, s.admission_no from students s
      where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} and ($3::uuid is null or s.student_id = $3::uuid) order by ${ROLL_ORDER}`,
    [actor.schoolId, classId, studentId]
  )).rows;
  if (studentId !== null && !roll.length) return { ok: false, reason: 'not_found' };
  const ids = roll.map((s) => s.student_id as string);
  const markRows = (await db.query(
    `select paper_id, student_id, component, kind, score from marks where school_id = $1 and paper_id = any ($2::uuid[]) and student_id = any ($3::uuid[])`,
    [actor.schoolId, papers.map((p) => p.paperId), ids]
  )).rows;
  const found = new Map<string, Record<string, Mark>>();
  for (const r of markRows) {
    const key = `${r.paper_id}|${r.student_id}`;
    const m = found.get(key) ?? {};
    m[r.component] = { kind: r.kind as MarkKind, score: r.score === null ? null : Number(r.score) };
    found.set(key, m);
  }
  const remarks = new Map(
    (await db.query(`select student_id, remark from report_remarks where school_id = $1 and exam_id = $2 and class_id = $3 and student_id = any ($4::uuid[])`, [actor.schoolId, examId, classId, ids])).rows.map((r) => [r.student_id as string, r.remark as string])
  );
  // Attendance as kept with the publication (null: the exam had no session when it was published).
  const keptAttendance = kept.attendance;
  const co = coAreasOf(kept.scheme.coScholastic);
  const coGrades = co ? await coScholasticOf(db, actor.schoolId, examId, classId, ids) : new Map<string, Record<string, string>>();
  const recognitionOn = await planHasFeature(db, actor.schoolId, 'personal-best');
  const subjectName = new Map(papers.map((p) => [p.subjectId, p.subjectName]));
  const exams = new Map<string, string>();
  if (recognitionOn) {
    const earlierIds = [...new Set(Object.values(kept.recognition).flatMap((r) => (!r.first && r.mostImproved ? [r.mostImproved.examId] : [])))];
    if (earlierIds.length) for (const r of (await db.query(`select exam_id, name from exams where school_id = $1 and exam_id = any ($2::uuid[])`, [actor.schoolId, earlierIds])).rows) exams.set(r.exam_id, r.name);
  }
  const resultPapers: ResultPaper[] = papers.map((p) => ({ paperId: p.paperId, subjectName: p.subjectName, date: p.date, components: p.components }));
  const scheme = kept.scheme;
  const columns: { key: string; name: string }[] = [];
  for (const p of papers) for (const c of p.components) if (!columns.some((x) => x.key === c.key)) columns.push({ key: c.key, name: c.name });

  const weighted = await weightedForClass(db, actor.schoolId, { classId, sessionId: exam.session_id ?? null, ownType: exam.exam_type ?? null, scheme, studentIds: ids, publishedOnly: true });

  const cards: ReportCard[] = roll.map((s) => {
    const own = papers.map((p) => found.get(`${p.paperId}|${s.student_id}`) ?? {});
    const result = childResult(resultPapers, own, scheme);
    const subjects: CardSubject[] = papers.map((p, i) => ({ subjectId: p.subjectId, subjectName: p.subjectName, components: p.components, marks: own[i], total: totalOf(p.components, own[i]), result: result.papers[i] }));
    const totals = subjects.map((x) => x.total);
    const overallTotal = result.overall.percent !== null && totals.some((x) => x !== null)
      ? { score: Math.round(totals.reduce((a, x) => a + (x?.score ?? 0), 0) * 10) / 10, max: Math.round(totals.reduce((a, x) => a + (x?.max ?? 0), 0) * 10) / 10 }
      : null;
    const kept1 = kept.recognition[s.student_id];
    let recognition: CardRecognition | null = null;
    if (recognitionOn && kept1) {
      recognition = kept1.first
        ? { kind: 'first' }
        : {
            kind: 'shown',
            personalBest: kept1.personalBest.filter((b) => subjectName.has(b.subjectId)).map((b) => ({ subject: subjectName.get(b.subjectId) as string, now: b.now, best: b.best })),
            mostImproved: kept1.mostImproved && subjectName.has(kept1.mostImproved.subjectId)
              ? { subject: subjectName.get(kept1.mostImproved.subjectId) as string, now: kept1.mostImproved.now, before: kept1.mostImproved.before, exam: exams.get(kept1.mostImproved.examId) ?? '' }
              : null,
          };
    }
    return {
      studentId: s.student_id,
      name: s.name,
      rollNo: s.roll_no ?? null,
      admissionNo: s.admission_no ?? null,
      subjects,
      overall: { ...result.overall, total: overallTotal },
      attendance: keptAttendance === null ? null : (keptAttendance[s.student_id] ?? { present: 0, days: 0 }),
      remark: remarks.get(s.student_id) ?? null,
      coScholastic: co
        ? co.areas.map((area) => {
            const grade = coGrades.get(s.student_id)?.[area] ?? null;
            return { area, grade, meaning: grade === null ? null : (co.grades.find((g) => g.grade === grade)?.meaning ?? null) };
          })
        : [],
      recognition,
      ...(weighted ? { weighted: weighted.byStudent.get(s.student_id) } : {}),
    };
  });
  const school = (await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0];
  return {
    ok: true,
    set: {
      schoolName: school?.name ?? '',
      exam: { name: exam.name, term: exam.term ?? null, session: exam.session ?? null },
      className: papers[0].className,
      publication: { version: kept.version, schemeVersion: kept.schemeVersion, publishedAt: kept.publishedAt, publishedBy: kept.publishedBy },
      layout: scheme.layout,
      decimals: scheme.decimals,
      hasSession: keptAttendance !== null,
      columns,
      recognitionOn,
      cards,
      ...(weighted ? { weighted: weighted.meta, weightedNames: await weightedNamesOf(db, actor.schoolId, weighted.meta.weights) } : {}),
    },
  };
}
