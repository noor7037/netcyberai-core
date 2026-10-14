import { writeAuditLog } from '@/lib/audit/log';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { planHasFeature } from '@/lib/frameworks/plans';
import type { Sql } from '@/lib/jobs/types';
import { coAreasOf, coScholasticOf, CO_SCHOLASTIC_OFFICE } from './co-scholastic';
import { EXAM_READERS, EXAM_RUNNERS, papersOf, type Actor, type PaperSummary } from './exams';
import { roundPercent } from './grading';
import { ownRecognition, paperPercent, type EarlierExam, type OwnRecognition } from './own-progress';
import { ON_ROLL, ROLL_ORDER, type Mark, type MarkKind, type PaperComponent } from './papers';
import type { CoScholastic, GradingScheme } from './scheme';
import { schemeInForce } from './schemes';

// Publishing an exam for a class, reopening it, and the class teacher's remarks (docs/27 row 9c and section 3 rule
// 4, C215). The principal, the school admin or the academic coordinator publishes a class once every paper of it is
// entered: its marks, papers and remarks are then frozen by the database, and the grading scheme in force is kept
// with the publication, so a later change of the scheme never rewrites a report card. Only the principal reopens a
// publication, with a reason; it is then published again as the next version. Every one of these is audited.
// Everything runs in the caller's own tenant transaction: row level security and the triggers hold the same rules
// (the migration ending _p6_report_cards.sql).

export const REPORT_CARD_OFFICE: readonly Actor['role'][] = EXAM_RUNNERS;
export const REOPEN_ROLE: Actor['role'] = 'principal';
export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const REMARK_MAX = 500;

export type Publication = {
  version: number;
  schemeVersion: number;
  publishedBy: string | null;
  publishedAt: string;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reason: string | null;
};
// Attendance kept with a publication (C219): each child on the roll when it was published, their days marked in the
// exam's session up to that day and how many of them they were in school. Null: the exam has no session.
export type KeptAttendance = Record<string, { present: number; days: number }>;
export type KeptPublication = Publication & { publicationId: string; scheme: GradingScheme; recognition: Record<string, OwnRecognition>; attendance: KeptAttendance | null };

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

// The publications of an exam for a class, newest first, with who published and reopened them.
export async function publicationsOf(db: Sql, schoolId: string, examId: string, classId: string): Promise<KeptPublication[]> {
  const { rows } = await db.query(
    `select x.publication_id, x.version, x.scheme_version, x.scheme, x.recognition, x.attendance, x.published_at, x.reopened_at, x.reopen_reason,
            pu.display_name as published_by, ru.display_name as reopened_by
       from exam_publications x
       left join users pu on pu.school_id = x.school_id and pu.user_id = x.published_by
       left join users ru on ru.school_id = x.school_id and ru.user_id = x.reopened_by
      where x.school_id = $1 and x.exam_id = $2 and x.class_id = $3
      order by x.version desc`,
    [schoolId, examId, classId]
  );
  return rows.map((r) => ({
    publicationId: r.publication_id,
    version: Number(r.version),
    schemeVersion: Number(r.scheme_version),
    scheme: r.scheme as GradingScheme,
    recognition: (r.recognition ?? {}) as Record<string, OwnRecognition>,
    attendance: (r.attendance ?? null) as KeptAttendance | null,
    publishedBy: r.published_by ?? null,
    publishedAt: iso(r.published_at) as string,
    reopenedBy: r.reopened_by ?? null,
    reopenedAt: iso(r.reopened_at),
    reason: r.reopen_reason ?? null,
  }));
}

// The publication in force (not reopened), or null.
export async function publicationInForce(db: Sql, schoolId: string, examId: string, classId: string): Promise<KeptPublication | null> {
  return (await publicationsOf(db, schoolId, examId, classId)).find((p) => p.reopenedAt === null) ?? null;
}

const bare = (p: KeptPublication): Publication => ({ version: p.version, schemeVersion: p.schemeVersion, publishedBy: p.publishedBy, publishedAt: p.publishedAt, reopenedBy: p.reopenedBy, reopenedAt: p.reopenedAt, reason: p.reason });

const isClassTeacher = async (db: Sql, classId: string): Promise<boolean> => (await db.query(`select public.is_class_teacher_of($1) as yes`, [classId])).rows[0]?.yes === true;

export type ReportCardsScreen = {
  exam: { examId: string; name: string; term: string | null };
  classId: string;
  className: string;
  classTeacher: string | null;
  papers: { paperId: string; subjectName: string; entered: boolean }[];
  scheme: { version: number } | null; // in force now
  inForce: Publication | null;
  history: Publication[];
  children: { studentId: string; name: string; rollNo: string | null; remark: string | null; coScholastic: Record<string, string> }[];
  // The co-scholastic areas and grades: of the scheme kept with the publication, or (not published) of the scheme in
  // force. Null: the scheme has none.
  coScholastic: CoScholastic | null;
  notShown: number;
  mayPublish: boolean; // the person's role publishes
  ready: boolean; // every paper entered, a scheme saved, and not published
  mayReopen: boolean;
  mayDownload: boolean;
  mayWriteRemarks: boolean;
  mayWriteCoScholastic: boolean; // not published, the scheme has areas, and the class teacher or the office
  recognitionOn: boolean; // the school's plan has Personal Best and Most Improved
};

// What the report cards screen of an exam's class shows. Read by whoever reads the class result; downloading is for
// the office and the class teacher, remarks for the class teacher.
export async function reportCardsScreen(db: Sql, actor: Actor, examId: string, classId: string): Promise<ReportCardsScreen | null> {
  if (!EXAM_READERS.includes(actor.role)) return null;
  const exam = (await db.query(`select exam_id, name, term from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
  if (!exam) return null;
  const papers = (await papersOf(db, actor.schoolId, [examId])).filter((p) => p.classId === classId);
  if (!papers.length) return null;
  const roll = (await db.query(
    `select s.student_id, s.name, s.roll_no from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} order by ${ROLL_ORDER}`,
    [actor.schoolId, classId]
  )).rows;
  const remarks = new Map(
    (await db.query(`select student_id, remark from report_remarks where school_id = $1 and exam_id = $2 and class_id = $3`, [actor.schoolId, examId, classId])).rows.map((r) => [r.student_id as string, r.remark as string])
  );
  const teacher = (await db.query(
    `select u.display_name from classes c left join users u on u.school_id = c.school_id and u.user_id = c.class_teacher_id where c.school_id = $1 and c.class_id = $2`,
    [actor.schoolId, classId]
  )).rows[0];
  const history = await publicationsOf(db, actor.schoolId, examId, classId);
  const inForce = history.find((p) => p.reopenedAt === null) ?? null;
  const scheme = await schemeInForce(db, actor.schoolId);
  const classTeacher = await isClassTeacher(db, classId);
  const mayPublish = REPORT_CARD_OFFICE.includes(actor.role);
  const coScholastic = coAreasOf(inForce ? inForce.scheme.coScholastic : scheme?.scheme.coScholastic);
  const coGrades = coScholastic ? await coScholasticOf(db, actor.schoolId, examId, classId) : new Map<string, Record<string, string>>();
  return {
    exam: { examId: exam.exam_id, name: exam.name, term: exam.term ?? null },
    classId,
    className: papers[0].className,
    classTeacher: teacher?.display_name ?? null,
    papers: papers.map((p) => ({ paperId: p.paperId, subjectName: p.subjectName, entered: p.enteredAt !== null })),
    scheme: scheme ? { version: scheme.version } : null,
    inForce: inForce ? bare(inForce) : null,
    history: history.map(bare),
    children: roll.map((s) => ({ studentId: s.student_id, name: s.name, rollNo: s.roll_no ?? null, remark: remarks.get(s.student_id) ?? null, coScholastic: coGrades.get(s.student_id) ?? {} })),
    coScholastic,
    notShown: Math.max(0, papers[0].roll - roll.length),
    mayPublish,
    ready: !inForce && scheme !== null && papers.every((p) => p.enteredAt !== null),
    mayReopen: actor.role === REOPEN_ROLE && inForce !== null,
    mayDownload: inForce !== null && (REPORT_CARD_OFFICE.includes(actor.role) || classTeacher),
    mayWriteRemarks: inForce === null && classTeacher,
    mayWriteCoScholastic: inForce === null && coScholastic !== null && (CO_SCHOLASTIC_OFFICE.includes(actor.role) || classTeacher),
    recognitionOn: await planHasFeature(db, actor.schoolId, 'personal-best'),
  };
}

// ---- each child's own earlier published exams ------------------------------------------------------------------

type MarkRow = { student_id: string; exam_id: string; subject_id: string; paper_id: string; components: PaperComponent[]; component: string; kind: MarkKind; score: string | number | null };

// The subject percents of some children in some papers, from their marks: child -> exam -> subject -> percent.
function percentsByChild(rows: readonly MarkRow[], decimals: 0 | 1): Map<string, Map<string, Map<string, number | null>>> {
  const marks = new Map<string, { row: MarkRow; marks: Record<string, Mark> }>();
  for (const r of rows) {
    const key = `${r.student_id}|${r.paper_id}`;
    const m = marks.get(key) ?? { row: r, marks: {} };
    m.marks[r.component] = { kind: r.kind, score: r.score === null ? null : Number(r.score) };
    marks.set(key, m);
  }
  const out = new Map<string, Map<string, Map<string, number | null>>>();
  for (const { row, marks: own } of marks.values()) {
    const p = paperPercent(row.components, own);
    const byExam = out.get(row.student_id) ?? new Map<string, Map<string, number | null>>();
    const bySubject = byExam.get(row.exam_id) ?? new Map<string, number | null>();
    bySubject.set(row.subject_id, p === null ? null : roundPercent(p, decimals));
    byExam.set(row.exam_id, bySubject);
    out.set(row.student_id, byExam);
  }
  return out;
}

// When an exam took place, for putting a child's exams in time: its class's earliest paper date, else the exam's
// own date, else the day it was made (in India); then when it was made.
const EXAM_DAY_SQL = (cls: string) => `coalesce((select min(pd.paper_date) from exam_papers pd where pd.school_id = e.school_id and pd.exam_id = e.exam_id and pd.class_id = ${cls}), e.date, (e.created_at at time zone 'Asia/Kolkata')::date)`;

// Personal Best and Most Improved for every child with marks in this exam's class, each compared only with their own
// earlier published exams (any class, any session). Read as the person publishing: the office and the coordinator
// read every class's marks.
export async function recognitionForClass(db: Sql, schoolId: string, examId: string, classId: string, decimals: 0 | 1): Promise<Record<string, OwnRecognition>> {
  const cols = `m.student_id, p.exam_id, p.subject_id, p.paper_id, p.components, m.component, m.kind, m.score`;
  const now = (await db.query(
    `select ${cols} from marks m join exam_papers p on p.school_id = m.school_id and p.paper_id = m.paper_id
      where m.school_id = $1 and p.exam_id = $2 and p.class_id = $3`,
    [schoolId, examId, classId]
  )).rows as MarkRow[];
  const children = [...new Set(now.map((r) => r.student_id))];
  if (!children.length) return {};
  // The subjects of this exam's class, in the order the card lists them.
  const papers = (await db.query(
    `select p.subject_id from exam_papers p join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
      where p.school_id = $1 and p.exam_id = $2 and p.class_id = $3 order by sb.name, p.paper_id`,
    [schoolId, examId, classId]
  )).rows.map((r) => r.subject_id as string);
  // Every exam published (in force) for some class before this one, in time order: their marks of these children
  // are read below.
  const earlierExams = (await db.query(
    `with here as (select ${EXAM_DAY_SQL('$3::uuid')} as day, e.created_at, e.exam_id from exams e where e.school_id = $1 and e.exam_id = $2)
     select x.exam_id, x.class_id from exam_publications x join exams e on e.school_id = x.school_id and e.exam_id = x.exam_id cross join here h
      where x.school_id = $1 and x.reopened_at is null and x.exam_id <> $2
        and (${EXAM_DAY_SQL('x.class_id')}, e.created_at, e.exam_id) < (h.day, h.created_at, h.exam_id)
      order by ${EXAM_DAY_SQL('x.class_id')}, e.created_at, e.exam_id`,
    [schoolId, examId, classId]
  )).rows as { exam_id: string; class_id: string }[];
  const before = earlierExams.length
    ? ((await db.query(
        `select ${cols} from marks m join exam_papers p on p.school_id = m.school_id and p.paper_id = m.paper_id
          join unnest($3::uuid[], $4::uuid[]) as x(exam_id, class_id) on x.exam_id = p.exam_id and x.class_id = p.class_id
         where m.school_id = $1 and m.student_id = any ($2::uuid[])`,
        [schoolId, children, earlierExams.map((e) => e.exam_id), earlierExams.map((e) => e.class_id)]
      )).rows as MarkRow[])
    : [];
  const current = percentsByChild(now, decimals);
  const history = percentsByChild(before, decimals);
  const order = [...new Set(earlierExams.map((e) => e.exam_id))];
  const out: Record<string, OwnRecognition> = {};
  for (const child of children) {
    const own = current.get(child)?.get(examId) ?? new Map<string, number | null>();
    const earlier: EarlierExam[] = order
      .filter((id) => history.get(child)?.has(id))
      .map((id) => ({ examId: id, subjects: [...(history.get(child)!.get(id) as Map<string, number | null>)].map(([subjectId, percent]) => ({ subjectId, percent })) }));
    out[child] = ownRecognition(papers.map((subjectId) => ({ subjectId, percent: own.get(subjectId) ?? null })), earlier);
  }
  return out;
}

// ---- writes ----------------------------------------------------------------------------------------------------

export type PublishProblem = 'not_allowed' | 'not_found' | 'not_entered' | 'no_scheme' | 'published' | 'not_published' | 'reason' | 'remarks' | 'child' | 'remark';
export type PublishResult = { ok: true; version: number } | { ok: false; reason: PublishProblem; at?: number };

async function classPapers(db: Sql, actor: Actor, examId: string, classId: string): Promise<PaperSummary[] | null> {
  if (!isUuid(examId) || !isUuid(classId)) return null;
  const papers = (await papersOf(db, actor.schoolId, [examId])).filter((p) => p.classId === classId);
  return papers.length ? papers : null;
}

// Publishes an exam for a class: the office or the coordinator, once every paper is entered and a scheme is saved.
export async function publishClass(db: Sql, actor: Actor, examId: string, classId: string): Promise<PublishResult> {
  if (!REPORT_CARD_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isUuid(examId) || !isUuid(classId)) return { ok: false, reason: 'not_found' };
  // Marks, papers and remarks of this exam and class are written in turn with publishing (exam_class_lock_key): from
  // here on, what is read below is what is frozen.
  await db.query(`select pg_advisory_xact_lock(public.exam_class_lock_key($1, $2))`, [examId, classId]);
  const papers = await classPapers(db, actor, examId, classId);
  if (!papers) return { ok: false, reason: 'not_found' };
  if (await publicationInForce(db, actor.schoolId, examId, classId)) return { ok: false, reason: 'published' };
  if (papers.some((p) => p.enteredAt === null)) return { ok: false, reason: 'not_entered' };
  const scheme = await schemeInForce(db, actor.schoolId);
  if (!scheme) return { ok: false, reason: 'no_scheme' };
  const recognition = await recognitionForClass(db, actor.schoolId, examId, classId, scheme.scheme.decimals);
  // A savepoint, so a rule the database holds (published in the same moment, a paper no longer entered) leaves this
  // transaction usable and is said plainly.
  await db.query('savepoint exam_publish');
  let row: { publication_id: string; version: number; scheme_version: number };
  try {
    row = (await db.query(
      `insert into exam_publications (school_id, exam_id, class_id, version, scheme_version, scheme, recognition, published_by)
       values ($1, $2, $3, 1, $4, $5::jsonb, $6::jsonb, $7) returning publication_id, version, scheme_version`,
      [actor.schoolId, examId, classId, scheme.version, JSON.stringify(scheme.scheme), JSON.stringify(recognition), actor.userId]
    )).rows[0];
    await db.query('release savepoint exam_publish');
  } catch (err) {
    await db.query('rollback to savepoint exam_publish');
    const e = err as { code?: string; message?: string };
    if (e.code === '23505') return { ok: false, reason: 'published' };
    if (e.code === '23514' && /entered/.test(e.message ?? '')) return { ok: false, reason: 'not_entered' };
    if (e.code === '23514' && /grading scheme/.test(e.message ?? '')) return { ok: false, reason: 'no_scheme' };
    throw err;
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'exam.published',
    targetType: 'exam_publications',
    targetId: row.publication_id,
    afterState: { exam_id: examId, class_id: classId, version: Number(row.version), scheme_version: Number(row.scheme_version), papers: papers.length },
  });
  return { ok: true, version: Number(row.version) };
}

// The principal reopens a publication, with a reason: the class's marks can be corrected, and it is published again.
export async function reopenClass(db: Sql, actor: Actor, examId: string, classId: string, rawReason: unknown): Promise<PublishResult> {
  if (actor.role !== REOPEN_ROLE) return { ok: false, reason: 'not_allowed' };
  if (!isUuid(examId) || !isUuid(classId)) return { ok: false, reason: 'not_found' };
  const reason = typeof rawReason === 'string' ? rawReason.trim().replace(/\s+/g, ' ') : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return { ok: false, reason: 'reason' };
  const kept = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!kept) return { ok: false, reason: 'not_published' };
  const { rowCount } = await db.query(
    `update exam_publications set reopened_by = $3, reopen_reason = $4 where school_id = $1 and publication_id = $2 and reopened_at is null`,
    [actor.schoolId, kept.publicationId, actor.userId, reason]
  );
  if (!rowCount) return { ok: false, reason: 'not_published' };
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'exam.reopened',
    targetType: 'exam_publications',
    targetId: kept.publicationId,
    afterState: { exam_id: examId, class_id: classId, version: kept.version, reason },
  });
  return { ok: true, version: kept.version };
}

export type RemarksResult = { ok: true; saved: number; cleared: number } | { ok: false; reason: PublishProblem; at?: number };

// The class teacher writes, changes or clears remarks: [{ studentId, remark }], an empty remark clears it. Only while
// the class is not published (the database freezes them with the marks).
export async function saveRemarks(db: Sql, actor: Actor, examId: string, classId: string, raw: unknown): Promise<RemarksResult> {
  if (!EXAM_READERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const papers = await classPapers(db, actor, examId, classId);
  if (!papers) return { ok: false, reason: 'not_found' };
  if (!(await isClassTeacher(db, classId))) return { ok: false, reason: 'not_allowed' };
  if (await publicationInForce(db, actor.schoolId, examId, classId)) return { ok: false, reason: 'published' };
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 200) return { ok: false, reason: 'remarks' };
  const roll = new Set((await db.query(`select s.student_id from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL}`, [actor.schoolId, classId])).rows.map((r) => r.student_id as string));
  const writes: { studentId: string; remark: string }[] = [];
  const clears: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i] as Record<string, unknown> | null;
    if (typeof e !== 'object' || e === null || typeof e.studentId !== 'string' || !roll.has(e.studentId) || seen.has(e.studentId)) return { ok: false, reason: 'child', at: i };
    seen.add(e.studentId);
    const remark = e.remark === null || e.remark === undefined ? '' : typeof e.remark === 'string' ? e.remark.trim() : null;
    if (remark === null || remark.length > REMARK_MAX) return { ok: false, reason: 'remark', at: i };
    if (remark) writes.push({ studentId: e.studentId, remark });
    else clears.push(e.studentId);
  }
  await db.query('savepoint exam_remarks');
  let saved = 0;
  let cleared = 0;
  try {
    if (writes.length) {
      saved = (await db.query(
        `insert into report_remarks (school_id, exam_id, class_id, student_id, remark, written_by)
         select $1, $2, $3, x.student_id, x.remark, $4 from unnest($5::uuid[], $6::text[]) as x(student_id, remark)
         on conflict (school_id, exam_id, student_id) do update set remark = excluded.remark, written_by = excluded.written_by
          where report_remarks.remark is distinct from excluded.remark`,
        [actor.schoolId, examId, classId, actor.userId, writes.map((w) => w.studentId), writes.map((w) => w.remark)]
      )).rowCount ?? 0;
    }
    if (clears.length) {
      cleared = (await db.query(`delete from report_remarks where school_id = $1 and exam_id = $2 and class_id = $3 and student_id = any ($4::uuid[])`, [actor.schoolId, examId, classId, clears])).rowCount ?? 0;
    }
    await db.query('release savepoint exam_remarks');
  } catch (err) {
    await db.query('rollback to savepoint exam_remarks');
    const code = (err as { code?: string }).code;
    if (code === '55000') return { ok: false, reason: 'published' };
    if (code === '42501') return { ok: false, reason: 'not_allowed' };
    throw err;
  }
  if (saved + cleared > 0) {
    // Which children and how many; never the words of a remark.
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam.remarks_saved', targetType: 'report_remarks', targetId: examId, afterState: { exam_id: examId, class_id: classId, saved, cleared } });
  }
  return { ok: true, saved, cleared };
}
