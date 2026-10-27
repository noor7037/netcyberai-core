import { DEFAULT_EXAM_TYPES, examTypeLabel, OTHER_EXAM_TYPE, type ExamTypeRow } from '@/lib/contracts/exam-types';
import type { ProgressExam, ProgressGroup, ProgressSession, ProgressWeighted } from '@/lib/contracts/progress-report';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { examTypesOf } from './exam-types';
import type { Actor } from './exams';
import type { Mark, MarkKind, PaperComponent } from './papers';
import { REPORT_CARD_OFFICE } from './publish';
import { childResult, weightedChildResult, type ResultPaper, type Shown, type WeightedPaper } from './results';
import type { GradingScheme } from './scheme';

// A child's progress report (C230-AJ part 5, slice E): one child across a session's assessments, grouped by the
// school's exam types (exam-types.ts), oldest first within each. It is made ONLY from the marks of classes the school
// has published (a publication in force, not reopened): an exam not published for the child's class is not in it, in
// the staff view, the printable report or the Family app. Every percent and grade is childResult() by the scheme kept
// with that exam's publication, as the report card is, so a later change of the scheme never rewrites it. It sets the
// child against nobody: no rank, no position, no other child's mark anywhere (C76).
//
// The staff view is for the office (the principal, the school admin, the academic coordinator) and the child's class
// teacher. The Family app reads the same rows as the guardian (src/lib/school-link/progress.ts), where the school's
// parent rules decide every row and only classes whose outputs the office made (exam_outputs) are shown.

export type ProgressSource = 'staff' | 'guardian';
type Row = { exam_id: string; class_id: string; subject_id: string; scheme: GradingScheme; published_at: Date | string; name: string; term: string | null; exam_type: string; exam_date: string | null; created_day: string; paper_id: string; subject: string | null; paper_date: string | null; components: PaperComponent[] };

// The publications to read. Staff: every publication in force of the school (row level security narrows it to what the
// role may read). Guardian: the guardian's own children's classes whose outputs were made (guardian_exam_outputs).
const PUBLICATIONS: Record<ProgressSource, string> = {
  staff: `select x.exam_id, x.class_id, x.scheme, x.published_at from exam_publications x where x.school_id = $1 and x.reopened_at is null`,
  guardian: `select g.exam_id, g.class_id, g.scheme, g.published_at from public.guardian_publications() g
              join public.guardian_exam_outputs() o on o.exam_id = g.exam_id and o.class_id = g.class_id and o.version = g.version`,
};

const gradeOf = (s: Shown) => (s.grade.kind === 'grade' ? s.grade.grade : null);
const indiaDay = (v: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(v));

// What the counted result is worked out from (C230-AJ part 2): the child's published papers in the session with their marks
// and each paper's exam type as the exam holds it, and the grading scheme kept with the newest of those exams (whose
// `examTypes` are the weights). Read with the exams, so a guardian's session reads nothing more than it already does.
export type WeightedMaterial = { papers: (WeightedPaper & { rawType: string })[]; marks: Record<string, Mark>[]; scheme: GradingScheme };
export type ProgressData = { exams: (ProgressExam & { type: string })[]; material: WeightedMaterial | null };

// One child's published exams in a session (or of every session when `sessionId` is null), each with its type key.
export async function progressExams(db: Sql, p: { schoolId: string; studentId: string; sessionId: string | null; source: ProgressSource }): Promise<ProgressData> {
  const rows = (
    await db.query(
      `with pubs as (${PUBLICATIONS[p.source]})
       select pub.exam_id, pub.class_id, q.subject_id, pub.scheme, pub.published_at, e.name, e.term, e.exam_type, e.date::text as exam_date,
              (e.created_at at time zone 'Asia/Kolkata')::date::text as created_day,
              q.paper_id, sub.name as subject, q.paper_date::text as paper_date, q.components
         from pubs pub
         join exams e on e.school_id = $1 and e.exam_id = pub.exam_id
         join exam_papers q on q.school_id = e.school_id and q.exam_id = pub.exam_id and q.class_id = pub.class_id
         left join subjects sub on sub.school_id = q.school_id and sub.subject_id = q.subject_id
        where ($3::uuid is null or e.session_id = $3)
          and exists (select 1 from marks m where m.school_id = q.school_id and m.paper_id = q.paper_id and m.student_id = $2)
        order by e.created_at, e.exam_id, sub.name, q.paper_id`,
      [p.schoolId, p.studentId, p.sessionId]
    )
  ).rows as Row[];
  if (!rows.length) return { exams: [], material: null };
  const marks = (
    await db.query(`select paper_id, component, kind, score from marks where school_id = $1 and student_id = $2 and paper_id = any ($3::uuid[])`, [p.schoolId, p.studentId, rows.map((r) => r.paper_id)])
  ).rows as { paper_id: string; component: string; kind: MarkKind; score: string | null }[];
  const marksOf = (paperId: string): Record<string, Mark> =>
    Object.fromEntries(marks.filter((m) => m.paper_id === paperId).map((m) => [m.component, { kind: m.kind, score: m.score === null ? null : Number(m.score) } satisfies Mark]));

  const byExam = new Map<string, Row[]>();
  for (const r of rows) byExam.set(r.exam_id, [...(byExam.get(r.exam_id) ?? []), r]);
  const out: (ProgressExam & { type: string; created: string })[] = [];
  for (const [examId, papers] of byExam) {
    const first = papers[0];
    const resultPapers: ResultPaper[] = papers.map((r) => ({ paperId: r.paper_id, subjectName: r.subject ?? '', date: r.paper_date, components: r.components }));
    const result = childResult(resultPapers, papers.map((r) => marksOf(r.paper_id)), first.scheme);
    const dates = papers.map((r) => r.paper_date).filter((d): d is string => !!d).sort();
    out.push({
      examId,
      name: first.name,
      term: first.term ?? null,
      day: dates[0] ?? first.exam_date ?? first.created_day,
      publishedOn: indiaDay(first.published_at),
      subjects: papers.map((r, i) => ({ name: r.subject ?? '', percent: result.papers[i].rounded, grade: gradeOf(result.papers[i]) })),
      overall: { percent: result.overall.rounded, grade: gradeOf(result.overall) },
      type: first.exam_type,
      created: first.created_day,
    });
  }
  // In time order: the day it was held, then the day it was made.
  out.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || a.created.localeCompare(b.created) || a.examId.localeCompare(b.examId));
  const newest = out.length ? byExam.get(out[out.length - 1].examId)![0].scheme : null;
  const material: WeightedMaterial | null =
    newest && (newest.examTypes ?? []).length
      ? {
          papers: rows.map((r) => ({ paperId: r.paper_id, subjectId: r.subject_id, subjectName: r.subject ?? '', date: r.paper_date, components: r.components, examType: '', rawType: r.exam_type })),
          marks: rows.map((r) => marksOf(r.paper_id)),
          scheme: newest,
        }
      : null;
  return { exams: out.map(({ created: _created, ...exam }) => exam), material };
}

// The counted result across the exam types the scheme weighs (C230-AJ part 2), from the child's published papers, or null
// when the newest scheme weighs none (then nothing is added anywhere). An exam's type is its own while the school still
// lists it, else "other". Each counted type's percent is over the marks of all its published papers together; a counted
// type with none reads "not entered" and so does the result. Pure.
export function progressWeighted(material: WeightedMaterial | null, types: readonly ExamTypeRow[]): ProgressWeighted | null {
  const weights = material?.scheme.examTypes ?? [];
  if (!material || !weights.length) return null;
  const known = new Set(types.map((t) => t.key));
  const papers = material.papers.map(({ rawType, ...p }) => ({ ...p, examType: known.has(rawType) ? rawType : OTHER_EXAM_TYPE }));
  const r = weightedChildResult(papers, material.marks, weights, material.scheme);
  const at = (list: readonly { type: string; percent: number | null }[]) => weights.map((w) => list.find((x) => x.type === w.type)?.percent ?? null);
  return {
    weights: weights.map((w) => {
      const l = examTypeLabel(types, w.type);
      return { type: w.type, name: { en: l.en, hi: l.hi }, weight: w.weight };
    }),
    subjects: r.subjects.map((s) => ({ name: s.subjectName, types: at(s.types), percent: s.result.rounded, grade: gradeOf(s.result) })),
    overall: { types: at(r.types), percent: r.overall.rounded, grade: gradeOf(r.overall) },
  };
}

// Groups the child's exams by the school's exam types, in the order of the school's list; a type the list no longer has
// reads as "other" (examTypeName's rule). A type with no exam of the child's is left out.
export function groupByType(exams: readonly (ProgressExam & { type: string })[], types: readonly ExamTypeRow[]): ProgressGroup[] {
  const other = types.find((t) => t.key === OTHER_EXAM_TYPE) ?? DEFAULT_EXAM_TYPES[DEFAULT_EXAM_TYPES.length - 1];
  const rowOf = (key: string) => types.find((t) => t.key === key) ?? other;
  const groups = new Map<string, ProgressGroup>();
  for (const { type, ...exam } of exams) {
    const row = rowOf(type);
    const g = groups.get(row.key) ?? { type: row.key, name: { en: row.en, hi: row.hi }, exams: [] };
    g.exams.push(exam);
    groups.set(row.key, g);
  }
  const order = types.map((t) => t.key);
  return [...groups.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

// The session a report is read for: the one asked for, else the school's current one; null when the school has none
// (every published exam is then in it). Read by the school's staff or by the guardian (academic sessions are readable).
export async function sessionFor(db: Sql, schoolId: string, asked: string | null): Promise<ProgressSession> {
  if (asked !== null) {
    const r = (await db.query(`select session_id, label from academic_sessions where school_id = $1 and session_id = $2`, [schoolId, asked])).rows[0];
    if (r) return { sessionId: r.session_id, label: r.label };
  }
  const cur = (await db.query(`select session_id, label from academic_sessions where school_id = $1 and is_current order by start_date desc limit 1`, [schoolId])).rows[0];
  return cur ? { sessionId: cur.session_id, label: cur.label } : { sessionId: null, label: null };
}

// ---- The staff view ---------------------------------------------------------------------------------------------------

export type ProgressReport = {
  schoolName: string;
  student: { studentId: string; name: string; rollNo: string | null; admissionNo: string | null; className: string | null };
  session: ProgressSession;
  sessions: { sessionId: string; label: string; current: boolean }[]; // to choose another session
  groups: ProgressGroup[];
  weighted?: ProgressWeighted; // only when the scheme weighs exam types (C230-AJ part 2)
};
export type ProgressResult = { ok: true; report: ProgressReport } | { ok: false; reason: 'not_allowed' | 'not_found' };

export async function progressReport(db: Sql, actor: Actor, studentId: string, askedSession: string | null): Promise<ProgressResult> {
  if (!isUuid(studentId) || (askedSession !== null && !isUuid(askedSession))) return { ok: false, reason: 'not_found' };
  const office = REPORT_CARD_OFFICE.includes(actor.role);
  if (!office && actor.role !== 'teacher') return { ok: false, reason: 'not_allowed' };
  const child = (
    await db.query(
      `select s.student_id, s.name, s.roll_no, s.admission_no, s.class_id, c.name as class_name from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
        where s.school_id = $1 and s.student_id = $2`,
      [actor.schoolId, studentId]
    )
  ).rows[0];
  if (!child) return { ok: false, reason: 'not_found' };
  // The class teacher of the child's class, like the report card; any other teacher reads nothing here.
  if (!office && !(child.class_id && (await db.query(`select public.is_class_teacher_of($1) as yes`, [child.class_id])).rows[0]?.yes === true)) return { ok: false, reason: 'not_allowed' };
  const session = await sessionFor(db, actor.schoolId, askedSession);
  const { exams, material } = await progressExams(db, { schoolId: actor.schoolId, studentId, sessionId: session.sessionId, source: 'staff' });
  const types = await examTypesOf(db, actor.schoolId);
  const weighted = progressWeighted(material, types);
  const sessions = (await db.query(`select session_id, label, is_current from academic_sessions where school_id = $1 order by start_date desc`, [actor.schoolId])).rows.map((r) => ({
    sessionId: r.session_id as string,
    label: r.label as string,
    current: r.is_current === true,
  }));
  const school = (await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0];
  return {
    ok: true,
    report: {
      schoolName: school?.name ?? '',
      student: { studentId: child.student_id, name: child.name, rollNo: child.roll_no ?? null, admissionNo: child.admission_no ?? null, className: child.class_name ?? null },
      session,
      sessions,
      groups: groupByType(exams, types),
      ...(weighted ? { weighted } : {}),
    },
  };
}
