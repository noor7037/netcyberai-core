import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolRole } from '@/lib/contracts/modules';
import { classLabel } from '@/lib/frameworks/class-label';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { paperComponents, schemeParts, TO_ENTER_SQL, type PaperComponent } from './papers';
import { schemeInForce } from './schemes';
import { classOrderSql } from '@/lib/classes/class-order';

// Exams of a session and their papers (docs/27 row 9b, C214). The principal, the school admin and the academic
// coordinator make an exam for a term, with a paper for each class and subject (its date, the chapters it assesses,
// and the scheme's components with their maxima), and change or remove a paper while it has no marks. A teacher
// reads the exams of their own classes and sees the papers whose marks they may enter. The accountant reads none.
// Everything runs in the caller's own tenant transaction: row level security holds the same rules.

export const EXAM_RUNNERS: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator'];
export const EXAM_READERS: readonly SchoolRole[] = [...EXAM_RUNNERS, 'teacher'];

export type Actor = { schoolId: string; userId: string; role: SchoolRole };

export type PaperSummary = {
  paperId: string;
  examId: string;
  examName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  date: string | null;
  unitIds: string[];
  chapters: string[];
  components: PaperComponent[];
  roll: number; // children on the class's roll
  entered: number; // of them, with a mark, absent or exempt for every component
  enteredBy: string | null;
  enteredAt: string | null;
  mayEnter: boolean; // false while the class is published (C215)
  hasMarks: boolean;
  published: boolean; // the exam is published for this paper's class: its marks are frozen (C215)
};
export type ExamSummary = { examId: string; name: string; term: string | null; status: 'open' | 'published'; sessionId: string | null; madeBy: string | null; madeAt: string; papers: PaperSummary[] };
export type ExamsScreen = {
  role: SchoolRole;
  mayRun: boolean;
  today: string;
  sessions: { sessionId: string; label: string; isCurrent: boolean }[];
  session: string | null; // the session shown; null: the exams recorded with no session
  exams: ExamSummary[];
  // The papers this person may enter that still wait for marks, of any session (TO_ENTER_SQL, the rule My Day's
  // card counts by).
  toEnter: PaperSummary[];
  classes: { classId: string; name: string }[];
  subjects: { subjectId: string; name: string }[];
  scheme: { version: number; parts: { key: string; name: string; share: number | null }[]; terms: string[] } | null;
};

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

// The papers of some exams, with how far their entry has come (exam_paper_progress, counted over the whole roll).
export async function papersOf(db: Sql, schoolId: string, examIds: readonly string[]): Promise<PaperSummary[]> {
  if (!examIds.length) return [];
  const { rows } = await db.query(
    `select p.paper_id, p.exam_id, e.name as exam_name, p.class_id, c.name as class_name, c.section, p.subject_id, sb.name as subject_name,
            p.paper_date::text as paper_date, p.unit_ids, p.components, p.entered_at, eu.display_name as entered_by_name,
            g.roll, g.entered, public.exam_class_published(p.exam_id, p.class_id) as published,
            public.may_enter_marks(p.class_id, p.subject_id) and not public.exam_class_published(p.exam_id, p.class_id) as may_enter,
            exists (select 1 from marks m where m.school_id = p.school_id and m.paper_id = p.paper_id) as has_marks
       from exam_papers p
       join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
       join classes c on c.school_id = p.school_id and c.class_id = p.class_id
       join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
       left join users eu on eu.school_id = p.school_id and eu.user_id = p.entered_by
       cross join lateral public.exam_paper_progress(p.paper_id) g
      where p.school_id = $1 and p.exam_id = any ($2::uuid[])
      order by ${classOrderSql('c')}, c.class_id, sb.name, p.paper_id`,
    [schoolId, examIds]
  );
  const unitIds = [...new Set(rows.flatMap((r) => r.unit_ids as string[]))];
  const units = unitIds.length
    ? (await db.query(`select unit_id, chapter, position from syllabus_units where school_id = $1 and unit_id = any ($2::uuid[])`, [schoolId, unitIds])).rows
    : [];
  const byId = new Map(units.map((u) => [u.unit_id as string, u]));
  return rows.map((r) => {
    // The chapters, once each, in the order of the syllabus map. A unit since taken off the map is not named.
    const chapters = (r.unit_ids as string[])
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((u) => u.chapter as string);
    return {
      paperId: r.paper_id,
      examId: r.exam_id,
      examName: r.exam_name,
      classId: r.class_id,
      className: classLabel(r.class_name, r.section) ?? '',
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      date: r.paper_date ?? null,
      unitIds: r.unit_ids as string[],
      chapters: [...new Set(chapters)],
      components: r.components as PaperComponent[],
      roll: Number(r.roll),
      entered: Number(r.entered),
      enteredBy: r.entered_by_name ?? null,
      enteredAt: iso(r.entered_at),
      mayEnter: r.may_enter === true,
      hasMarks: r.has_marks === true,
      published: r.published === true,
    };
  });
}

export async function examsScreen(db: Sql, actor: Actor, sessionParam: string | null): Promise<ExamsScreen | null> {
  if (!EXAM_READERS.includes(actor.role)) return null;
  const mayRun = EXAM_RUNNERS.includes(actor.role);
  const sessions = (await db.query(`select session_id, label, is_current from academic_sessions where school_id = $1 order by start_date desc, session_id`, [actor.schoolId])).rows.map((r) => ({
    sessionId: r.session_id as string,
    label: r.label as string,
    isCurrent: r.is_current === true,
  }));
  // The session asked for; otherwise the current one, the latest, or (a school with none) the exams with none.
  const session =
    sessionParam === 'none' ? null
    : sessionParam && sessions.some((s) => s.sessionId === sessionParam) ? sessionParam
    : (sessions.find((s) => s.isCurrent) ?? sessions[0])?.sessionId ?? null;
  const exams = (await db.query(
    `select e.exam_id, e.name, e.term, e.status, e.session_id, e.created_at, u.display_name as made_by
       from exams e left join users u on u.school_id = e.school_id and u.user_id = e.created_by
      where e.school_id = $1 and e.session_id is not distinct from $2::uuid
      order by e.created_at desc, e.exam_id`,
    [actor.schoolId, session]
  )).rows;
  const papers = await papersOf(db, actor.schoolId, exams.map((e) => e.exam_id as string));
  const today = indiaDate();
  const list: ExamSummary[] = exams.map((e) => ({
    examId: e.exam_id,
    name: e.name,
    term: e.term ?? null,
    status: e.status,
    sessionId: e.session_id ?? null,
    madeBy: e.made_by ?? null,
    madeAt: iso(e.created_at) as string,
    papers: papers.filter((p) => p.examId === e.exam_id),
  }));
  const waiting = (await db.query(TO_ENTER_SQL, [actor.schoolId])).rows as { paper_id: string; exam_id: string }[];
  const waitingIds = new Set(waiting.map((w) => w.paper_id));
  const toEnter = (await papersOf(db, actor.schoolId, [...new Set(waiting.map((w) => w.exam_id))])).filter((p) => waitingIds.has(p.paperId));
  const current = await schemeInForce(db, actor.schoolId);
  return {
    role: actor.role,
    mayRun,
    today,
    sessions,
    session,
    exams: list,
    toEnter,
    classes: mayRun ? (await db.query(`select class_id, name, grade, section from classes where school_id = $1 order by ${classOrderSql('')}, class_id`, [actor.schoolId])).rows.map((r) => ({ classId: r.class_id as string, name: classLabel(r.name, r.section) ?? '' })) : [],
    subjects: mayRun ? (await db.query(`select subject_id, name from subjects where school_id = $1 order by name, subject_id`, [actor.schoolId])).rows.map((r) => ({ subjectId: r.subject_id as string, name: r.name as string })) : [],
    scheme: current ? { version: current.version, parts: schemeParts(current.scheme), terms: current.scheme.terms.map((x) => x.name) } : null,
  };
}

export type ExamProblem = 'not_allowed' | 'not_found' | 'name' | 'name_taken' | 'session' | 'term' | 'papers' | 'class' | 'subject' | 'date' | 'maxima' | 'units' | 'paper_twice' | 'has_marks' | 'published';
export type ExamResult = { ok: true; examId: string; paperId?: string } | { ok: false; reason: ExamProblem; at?: number };

type PaperInput = { classId: string; subjectId: string; date: string | null; unitIds: string[]; components: PaperComponent[] };

// One paper as sent: its class and subject must be the school's, the chapters units of that class's syllabus map
// for that subject, and the maxima the scheme's components.
async function checkPaper(db: Sql, schoolId: string, raw: unknown, scheme: Awaited<ReturnType<typeof schemeInForce>>): Promise<{ ok: true; paper: PaperInput } | { ok: false; reason: ExamProblem }> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'papers' };
  const p = raw as Record<string, unknown>;
  if (!isUuid(p.classId) || !(await db.query(`select 1 from classes where school_id = $1 and class_id = $2`, [schoolId, p.classId])).rows[0]) return { ok: false, reason: 'class' };
  if (!isUuid(p.subjectId) || !(await db.query(`select 1 from subjects where school_id = $1 and subject_id = $2`, [schoolId, p.subjectId])).rows[0]) return { ok: false, reason: 'subject' };
  const date = p.date === null || p.date === undefined || p.date === '' ? null : p.date;
  if (date !== null && !isIsoDate(date)) return { ok: false, reason: 'date' };
  const units = await checkUnits(db, schoolId, p.classId, p.subjectId, p.unitIds ?? []);
  if (!units) return { ok: false, reason: 'units' };
  const made = paperComponents(scheme?.scheme ?? null, p.maxima);
  if (!made.ok) return { ok: false, reason: 'maxima' };
  return { ok: true, paper: { classId: p.classId, subjectId: p.subjectId, date: date as string | null, unitIds: units, components: made.components } };
}

async function checkUnits(db: Sql, schoolId: string, classId: string, subjectId: string, raw: unknown): Promise<string[] | null> {
  if (!Array.isArray(raw) || raw.length > 60 || !raw.every(isUuid)) return null;
  const ids = [...new Set(raw as string[])];
  if (ids.length !== raw.length) return null;
  if (!ids.length) return [];
  const found = Number((await db.query(`select count(*) as n from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 and unit_id = any ($4::uuid[])`, [schoolId, classId, subjectId, ids])).rows[0].n);
  return found === ids.length ? ids : null;
}

const insertPaper = async (db: Sql, actor: Actor, examId: string, p: PaperInput): Promise<string> =>
  (await db.query(
    `insert into exam_papers (school_id, exam_id, class_id, subject_id, paper_date, unit_ids, components, created_by)
     values ($1, $2, $3, $4, $5, $6::uuid[], $7::jsonb, $8) returning paper_id`,
    [actor.schoolId, examId, p.classId, p.subjectId, p.date, p.unitIds, JSON.stringify(p.components), actor.userId]
  )).rows[0].paper_id as string;

const isUnique = (err: unknown) => (err as { code?: string }).code === '23505';

// Makes an exam with its papers, in one go: all of it, or nothing.
export async function makeExam(db: Sql, actor: Actor, input: Record<string, unknown>): Promise<ExamResult> {
  if (!EXAM_RUNNERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 120) return { ok: false, reason: 'name' };
  const sessionId = input.sessionId === null || input.sessionId === undefined ? null : input.sessionId;
  if (sessionId !== null && (!isUuid(sessionId) || !(await db.query(`select 1 from academic_sessions where school_id = $1 and session_id = $2`, [actor.schoolId, sessionId])).rows[0])) return { ok: false, reason: 'session' };
  const scheme = await schemeInForce(db, actor.schoolId);
  // The term is one of the scheme's terms, as named there, or none.
  const term = input.term === null || input.term === undefined || input.term === '' ? null : input.term;
  if (term !== null && !(typeof term === 'string' && (scheme?.scheme.terms ?? []).some((x) => x.name === term))) return { ok: false, reason: 'term' };
  if (!Array.isArray(input.papers) || input.papers.length < 1 || input.papers.length > 120) return { ok: false, reason: 'papers' };
  const papers: PaperInput[] = [];
  for (let i = 0; i < input.papers.length; i++) {
    const checked = await checkPaper(db, actor.schoolId, input.papers[i], scheme);
    if (!checked.ok) return { ok: false, reason: checked.reason, at: i };
    if (papers.some((p) => p.classId === checked.paper.classId && p.subjectId === checked.paper.subjectId)) return { ok: false, reason: 'paper_twice', at: i };
    papers.push(checked.paper);
  }
  // A savepoint, so an exam of the same name made in the same moment leaves this transaction usable.
  await db.query('savepoint exam_make');
  let examId: string;
  try {
    examId = (await db.query(`insert into exams (school_id, name, session_id, term, created_by) values ($1, $2, $3, $4, $5) returning exam_id`, [actor.schoolId, name, sessionId, term, actor.userId])).rows[0].exam_id;
    await db.query('release savepoint exam_make');
  } catch (err) {
    await db.query('rollback to savepoint exam_make');
    if (isUnique(err)) return { ok: false, reason: 'name_taken' };
    throw err;
  }
  for (const p of papers) await insertPaper(db, actor, examId, p);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam.made', targetType: 'exams', targetId: examId, afterState: { name, term, session_id: sessionId, papers: papers.length, scheme_version: scheme?.version ?? null } });
  return { ok: true, examId };
}

// A change to an exam: add a paper, change a paper's date and chapters, remove a paper, or remove the exam. A paper
// or an exam with marks is not removed: the marks would go with it.
export async function changeExam(db: Sql, actor: Actor, examId: string, input: Record<string, unknown>): Promise<ExamResult> {
  if (!EXAM_RUNNERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const exam = (await db.query(`select exam_id, name from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
  if (!exam) return { ok: false, reason: 'not_found' };
  const audit = (eventAction: string, targetType: string, targetId: string, afterState: Record<string, unknown>) =>
    writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction, targetType, targetId, afterState: { exam_id: examId, ...afterState } });
  const paperOf = async (paperId: unknown) =>
    isUuid(paperId)
      ? ((await db.query(
          `select p.paper_id, p.class_id, p.subject_id,
                  exists (select 1 from marks m where m.school_id = p.school_id and m.paper_id = p.paper_id)
                  or exists (select 1 from marking_uploads u where u.school_id = p.school_id and u.paper_id = p.paper_id) as has_marks,
                  public.exam_class_published(p.exam_id, p.class_id) as published
             from exam_papers p where p.school_id = $1 and p.exam_id = $2 and p.paper_id = $3`,
          [actor.schoolId, examId, paperId]
        )).rows[0] ?? null)
      : null;

  if (input.action === 'add_paper') {
    const checked = await checkPaper(db, actor.schoolId, input.paper, await schemeInForce(db, actor.schoolId));
    if (!checked.ok) return { ok: false, reason: checked.reason };
    // A published class takes no new paper until the principal reopens it (C215).
    if ((await db.query(`select public.exam_class_published($1, $2) as yes`, [examId, checked.paper.classId])).rows[0]?.yes === true) return { ok: false, reason: 'published' };
    await db.query('savepoint exam_paper_add');
    let paperId: string;
    try {
      paperId = await insertPaper(db, actor, examId, checked.paper);
      await db.query('release savepoint exam_paper_add');
    } catch (err) {
      await db.query('rollback to savepoint exam_paper_add');
      if (isUnique(err)) return { ok: false, reason: 'paper_twice' };
      throw err;
    }
    await audit('exam_paper.added', 'exam_papers', paperId, { class_id: checked.paper.classId, subject_id: checked.paper.subjectId, components: checked.paper.components.length });
    return { ok: true, examId, paperId };
  }
  if (input.action === 'paper') {
    const paper = await paperOf(input.paperId);
    if (!paper) return { ok: false, reason: 'not_found' };
    if (paper.published) return { ok: false, reason: 'published' };
    const date = input.date === null || input.date === undefined || input.date === '' ? null : input.date;
    if (date !== null && !isIsoDate(date)) return { ok: false, reason: 'date' };
    const units = await checkUnits(db, actor.schoolId, paper.class_id, paper.subject_id, input.unitIds ?? []);
    if (!units) return { ok: false, reason: 'units' };
    await db.query(`update exam_papers set paper_date = $3, unit_ids = $4::uuid[] where school_id = $1 and paper_id = $2`, [actor.schoolId, paper.paper_id, date, units]);
    await audit('exam_paper.changed', 'exam_papers', paper.paper_id, { date, units: units.length });
    return { ok: true, examId, paperId: paper.paper_id };
  }
  if (input.action === 'remove_paper') {
    const paper = await paperOf(input.paperId);
    if (!paper) return { ok: false, reason: 'not_found' };
    if (paper.published) return { ok: false, reason: 'published' };
    if (paper.has_marks) return { ok: false, reason: 'has_marks' };
    await db.query(`delete from exam_papers where school_id = $1 and paper_id = $2`, [actor.schoolId, paper.paper_id]);
    await audit('exam_paper.removed', 'exam_papers', paper.paper_id, { class_id: paper.class_id, subject_id: paper.subject_id });
    return { ok: true, examId };
  }
  if (input.action === 'remove') {
    // Marks, or answer sheets uploaded for AI marking (C347): either keeps the exam.
    const kept = await db.query(
      `select 1 from marks where school_id = $1 and exam_id = $2
       union all select 1 from marking_uploads u join exam_papers p on p.school_id = u.school_id and p.paper_id = u.paper_id where u.school_id = $1 and p.exam_id = $2
       limit 1`,
      [actor.schoolId, examId]
    );
    if (kept.rows[0]) return { ok: false, reason: 'has_marks' };
    const gone = await db.query(`delete from exam_papers where school_id = $1 and exam_id = $2`, [actor.schoolId, examId]);
    await db.query(`delete from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId]);
    await audit('exam.removed', 'exams', examId, { name: exam.name, papers: gone.rowCount ?? 0 });
    return { ok: true, examId };
  }
  return { ok: false, reason: 'papers' };
}
